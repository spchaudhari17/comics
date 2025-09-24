const OpenAI = require("openai");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { upload_files, deleteFiles } = require("../../../helper/helper");
const Comic = require("../../models/Comic");
const ComicPage = require("../../models/ComicPage");
const PDFDocument = require("pdfkit");
const sharp = require("sharp");
const DidYouKnow = require("../../models/DidYouKnow");
const FAQ = require("../../models/FAQ");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});



// const generateFAQs = async (req, res) => {
//   const { comicId, story } = req.body;

//   try {

//     let storyText = "";
//     if (Array.isArray(story)) {
//       storyText = story
//         .map(page =>
//           page.panels
//             .map(
//               p => `Scene: ${p.scene}. Caption: ${p.caption || ""}`
//             )
//             .join("\n")
//         )
//         .join("\n\n");
//     } else {
//       storyText = story;
//     }


//     const faqPrompt = `
//     Extract 3 meaningful FAQs with answers based on the *educational content* of this story.
//     ❌ Do NOT use characters’ dialogues as questions or answers.
//     ✅ Focus only on the knowledge and concepts taught in the story.

//     Story:
//     ${storyText}

//     ⚠️ Output JSON only:
//     [
//       { "question": "string", "answer": "string" }
//     ]
//     `;

//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [
//         { role: "system", content: "You are a strict JSON generator." },
//         { role: "user", content: faqPrompt }
//       ],
//       temperature: 0.3,
//       max_tokens: 800
//     });

//     let raw = response.choices[0].message.content.trim();
//     if (raw.startsWith("```")) raw = raw.replace(/```json|```/g, "").trim();
//     const faqs = JSON.parse(raw);


//     const comic = await Comic.findById(comicId).populate("styleId");
//     if (!comic) return res.status(404).json({ error: "Comic not found" });

//     const stylePrompt = comic.styleId.prompt;
//     const characterReferences = {};


//     const faqImages = await Promise.all(
//       faqs.map(async (faq, index) => {
//         const faqImagePrompt = `
// Educational comic page.
// ${stylePrompt}

// Panels:
// Panel 1: Teacher character asking: "${faq.question}"
// Panel 2: Student character answering: "${faq.answer}"

// Keep art style consistent with comic. Use same characters.
// `;

//         const imageResponse = await openai.images.generate({
//           model: "gpt-image-1",
//           prompt: faqImagePrompt,
//           size: "1024x1536",

//           n: 1,
//         });

//         if (!imageResponse.data || !imageResponse.data[0]) {
//           throw new Error(`Image generation failed for FAQ ${index + 1}`);
//         }

//         const imgData = imageResponse.data[0];
//         let buffer;

//         if (imgData.url) {
//           const axiosRes = await axios.get(imgData.url, { responseType: "arraybuffer" });
//           buffer = Buffer.from(axiosRes.data);
//         } else if (imgData.b64_json) {
//           buffer = Buffer.from(imgData.b64_json, "base64");
//         }

//         buffer = await sharp(buffer)
//           .resize({ width: 1024 })
//           .jpeg({ quality: 75 })
//           .toBuffer();

//         const fileName = `faq_page${index + 1}_${Date.now()}.jpg`;

//         const s3Upload = await upload_files("faqs", {
//           name: fileName,
//           data: buffer,
//           mimetype: "image/jpeg",
//         });

//         // Save in DB
//         const savedFAQ = await FAQ.create({
//           comicId,
//           question: faq.question,
//           answer: faq.answer,
//           imageUrl: s3Upload,
//         });

//         return { ...savedFAQ.toObject(), imageUrl: s3Upload };
//       })
//     );

//     res.json({ faqs: faqImages });
//   } catch (err) {
//     console.error("FAQ Image Error:", err);
//     res.status(500).json({ error: "Failed to generate FAQ images", details: err.message });
//   }
// };


function safeJsonParse(str) {
  try {
    // Agar code fences hain to hatao
    if (str.startsWith("```")) {
      str = str.replace(/```json|```/g, "").trim();
    }
    return JSON.parse(str);
  } catch (err) {
    console.error("❌ JSON Parse Error:", err.message, "\nRaw:", str);
    throw new Error("AI returned invalid JSON");
  }
}


const generateFAQs = async (req, res) => {
  const { comicId } = req.body;

  try {
    const comic = await Comic.findById(comicId).populate("styleId themeId");
    if (!comic) return res.status(404).json({ error: "Comic not found" });

    // ✅ Prevent duplicates
    const existingFAQs = await FAQ.find({ comicId });
    if (existingFAQs.length > 0) {
      return res.json({ faqs: existingFAQs });
    }

    // Extract story text from saved prompt
    const pages = JSON.parse(comic.prompt || "[]");
    const storyText = pages.map(p =>
      p.panels.map(pp => `${pp.scene} - ${pp.caption}`).join("\n")
    ).join("\n\n");

    const faqPrompt = `
      Extract 2-4 unique FAQs with answers from this story.
      ❌ Do NOT use dialogues.
      ✅ Focus only on educational concepts.

      Story:
      ${storyText}

      ⚠️ Output strictly JSON only:
      [
        { "question": "string", "answer": "string" }
      ]
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Return ONLY valid JSON, no markdown." },
        { role: "user", content: faqPrompt }
      ],
      temperature: 0.4,
      max_tokens: 800
    });

    const raw = response.choices[0].message.content.trim();
    const faqs = safeJsonParse(raw);

    // Generate images with same theme & style
    const stylePrompt = comic.styleId.prompt;
    const themePrompt = comic.themeId.prompt;

    const faqImages = await Promise.all(
      faqs.map(async (faq, idx) => {
        const imgPrompt = `
Educational comic page.
Theme: ${themePrompt}
Style: ${stylePrompt}

Panel 1: Teacher asks: "${faq.question}"
Panel 2: Student answers: "${faq.answer}"
        `;

        const imgRes = await openai.images.generate({
          model: "gpt-image-1",
          // model: "dall-e-3",
          prompt: imgPrompt,
          // size: "1024x1792", // dall-e-3
          size: "1024x1536",
          n: 1,
        });

        // ✅ Download image buffer
        let buffer;
        const imgData = imgRes.data[0];
        if (imgData.url) {
          const axiosRes = await axios.get(imgData.url, { responseType: "arraybuffer" });
          buffer = Buffer.from(axiosRes.data);
        } else if (imgData.b64_json) {
          buffer = Buffer.from(imgData.b64_json, "base64");
        }

        // ✅ Optimize image
        buffer = await sharp(buffer)
          .resize({ width: 1024 })
          .jpeg({ quality: 75 })
          .toBuffer();

        // ✅ Upload to S3
        const fileName = `${Date.now()}_faq_page${idx + 1}_${Date.now()}.jpg`;
        const s3Upload = await upload_files("faqs", {
          name: fileName,
          data: buffer,
          mimetype: "image/jpeg",
        });

        const s3Key = `faqs/${fileName}`;

        // ✅ Save in DB
        const savedFAQ = await FAQ.create({
          comicId,
          question: faq.question,
          answer: faq.answer,
          imageUrl: s3Upload,
          s3Key,
        });

        return savedFAQ.toObject();
      })
    );

    res.json({ faqs: faqImages });
  } catch (err) {
    console.error("FAQ Error:", err);
    res.status(500).json({ error: "FAQ generation failed", details: err.message });
  }
};




const listFAQs = async (req, res) => {
  try {
    const { comicId } = req.params;
    const faqs = await FAQ.find({ comicId });
    res.json({ faqs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch FAQs" });
  }
};


module.exports = { generateFAQs, listFAQs }