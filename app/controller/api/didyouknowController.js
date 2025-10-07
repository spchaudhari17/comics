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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


// working good for text
// const generateDidYouKnow = async (req, res) => {
//   const { comicId, subject, story } = req.body;

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


//     const factPrompt = `
//     Generate 3 fun and educational "Did You Know?" facts.
//     ❌ Do NOT use characters' dialogues.
//     ✅ Focus only on knowledge, subject concepts, and factual information.

//     Subject: ${subject}
//     Story Content:
//     ${storyText}

//     ⚠️ JSON only:
//     [
//       { "fact": "string" }
//     ]
//     `;

//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [
//         { role: "system", content: "You are a strict JSON generator." },
//         { role: "user", content: factPrompt }
//       ],
//       temperature: 0.5,
//       max_tokens: 500
//     });

//     let raw = response.choices[0].message.content.trim();
//     if (raw.startsWith("```")) raw = raw.replace(/```json|```/g, "").trim();
//     let facts = JSON.parse(raw);

//     if (!Array.isArray(facts)) {
//       if (facts && facts.fact) {
//         facts = [facts];
//       } else {
//         throw new Error("Invalid response format from OpenAI");
//       }
//     }


//     const comic = await Comic.findById(comicId).populate("styleId");
//     if (!comic) return res.status(404).json({ error: "Comic not found" });

//     const stylePrompt = comic.styleId.prompt;


//     const factImages = await Promise.all(
//       facts.map(async (fact, index) => {
//         const imagePrompt = `
// Educational comic-style poster.
// ${stylePrompt}

// Panel 1: Title at top: "💡 Did You Know?"
// Panel 2: Fun fact text: "${fact.fact}"
// Make it engaging, colorful, consistent with comic style.
// `;

//         const imageResponse = await openai.images.generate({
//           model: "gpt-image-1",
//           prompt: imagePrompt,
//           size: "1024x1536",
//           n: 1,
//         });

//         if (!imageResponse.data || !imageResponse.data[0]) {
//           throw new Error(`Image generation failed for fact ${index + 1}`);
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

//         const fileName = `didyouknow_${comicId}_${Date.now()}_${index + 1}.jpg`;

//         const s3Upload = await upload_files("didyouknow", {
//           name: fileName,
//           data: buffer,
//           mimetype: "image/jpeg",
//         });


//         const savedFact = await DidYouKnow.create({
//           comicId,
//           fact: fact.fact,
//           imageUrl: s3Upload,
//           s3Key: `didyouknow/${fileName}`,
//         });

//         return savedFact;
//       })
//     );

//     res.json({ didYouKnow: factImages });
//   } catch (err) {
//     console.error("DidYouKnow error:", err);
//     res.status(500).json({
//       error: "Failed to generate Did You Know facts",
//       details: err.message,
//     });
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



const generateDidYouKnow = async (req, res) => {
  const { comicId } = req.body;

  try {
    const comic = await Comic.findById(comicId).populate("styleId themeId");
    if (!comic) return res.status(404).json({ error: "Comic not found" });

    // ✅ Prevent duplicates
    const existingFacts = await DidYouKnow.find({ comicId });
    if (existingFacts.length > 0) {
      return res.json({ didYouKnow: existingFacts });
    }

    // Extract story text
    const pages = JSON.parse(comic.prompt || "[]");
    const storyText = pages
      .map(p => p.panels.map(pp => `Scene: ${pp.scene}. Caption: ${pp.caption || ""}`).join("\n"))
      .join("\n\n");

    const factPrompt = `
You are an expert educational content creator.

Generate 1–2 fun and educational "Did You Know?" facts.

❌ Do NOT use dialogues.
✅ Focus on interesting insights, background information, or real-world connections related to the comic’s subject.

⚠️ Do NOT repeat information already covered in the comic storyline.
Focus only on **new facts or clarifications** that expand the student's understanding.

Comic Story Content:
${storyText}

Return strictly JSON only:
[
  { "fact": "string" }
]
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Return ONLY valid JSON array. No markdown, no text." },
        { role: "user", content: factPrompt }
      ],
      temperature: 0.4,
      max_tokens: 600
    });

    const raw = response.choices[0].message.content.trim();
    let facts = safeJsonParse(raw);
    if (!Array.isArray(facts)) facts = [facts];

    // ✅ Generate images (theme + style)
    const stylePrompt = comic.styleId.prompt;
    const themePrompt = comic.themeId.prompt;

    const factImages = await Promise.all(
      facts.map(async (fact, idx) => {
        const imgPrompt = `
Educational comic-style poster.
Theme: ${themePrompt}
Style: ${stylePrompt}

Panel 1: Title at top: "💡 Did You Know?"
Panel 2: Fun fact: "${fact.fact}"
Make it colorful, engaging, and consistent with the comic style.
        `;

        const imgRes = await openai.images.generate({
          model: "gpt-image-1",
          prompt: imgPrompt,
          size: "1024x1536",
          n: 1,
        });

        // ✅ Download & optimize
        let buffer;
        const imgData = imgRes.data[0];
        if (imgData.url) {
          const axiosRes = await axios.get(imgData.url, { responseType: "arraybuffer" });
          buffer = Buffer.from(axiosRes.data);
        } else if (imgData.b64_json) {
          buffer = Buffer.from(imgData.b64_json, "base64");
        }

        buffer = await sharp(buffer)
          .resize({ width: 1024 })
          .jpeg({ quality: 75 })
          .toBuffer();

        // ✅ Upload to S3
        const fileName = `${Date.now()}_didyouknow_${comicId}_${idx + 1}.jpg`;
        const s3Upload = await upload_files("didyouknow", {
          name: fileName,
          data: buffer,
          mimetype: "image/jpeg",
        });

        const s3Key = `didyouknow/${fileName}`;

        // ✅ Save in DB
        const savedFact = await DidYouKnow.create({
          comicId,
          fact: fact.fact,
          imageUrl: s3Upload,
          s3Key,
        });

        return savedFact.toObject();
      })
    );

    res.json({ didYouKnow: factImages });
  } catch (err) {
    console.error("DidYouKnow Error:", err);
    res.status(500).json({
      error: "Failed to generate Did You Know facts",
      details: err.message,
    });
  }
};






const listDidYouKnow = async (req, res) => {
  try {
    const { comicId } = req.params;
    const facts = await DidYouKnow.find({ comicId });
    res.json({ didYouKnow: facts });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch Did You Know facts" });
  }
};


module.exports = { generateDidYouKnow, listDidYouKnow }