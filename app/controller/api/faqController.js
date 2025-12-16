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
const Subject = require("../../models/Subject");
const { generateGeminiComicImage } = require("../../../helper/geminiImage");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});




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

// perfect working for gpt -image-1
// const generateFAQs = async (req, res) => {
//   const { comicId } = req.body;

//   try {
//     const comic = await Comic.findById(comicId).populate("styleId themeId subjectId");
//     if (!comic) return res.status(404).json({ error: "Comic not found" });

//     // Prevent duplicates
//     const existingFAQs = await FAQ.find({ comicId });
//     if (existingFAQs.length > 0) {
//       return res.status(200).json({
//         alreadyExists: true,
//         faqs: existingFAQs,
//       });
//     }

//     const pages = JSON.parse(comic.prompt || "[]");
//     const storyText = pages
//       .map(p => p.panels.map(pp => `${pp.scene}: ${pp.caption}`).join("\n"))
//       .join("\n\n");

//     const faqPrompt = `
// You are an educational assistant.
// Generate 2–4 meaningful FAQs and answers based on the following comic.

// Context:
// - Subject: ${comic.subject || comic.subjectId?.name || "General Knowledge"}
// - Concept: ${comic.concept || ""}
// - Grade Level: ${comic.grade || "School Level"}

// Comic Story (summary, ignore dialogues and characters): 
// ${storyText}

// Guidelines:
// - FAQs must test conceptual understanding (definitions, reasoning, cause-effect, applications).
// - Questions must be directly related to "${comic.concept}" and "${comic.subject}".
// - ❌ Do NOT repeat information already covered in the comic storyline.
// - ❌ No questions about characters, artwork, or dialogues.
// - ✔️ Focus on deeper clarifications or real-world application.
// - Answers must be short.
// - Return ONLY valid JSON.

// Format:
// [
//   { "question": "string", "answer": "string" }
// ]
//     `;

//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [
//         { role: "system", content: "Return ONLY valid JSON, no markdown." },
//         { role: "user", content: faqPrompt }
//       ],
//       temperature: 0.4,
//       max_tokens: 800
//     });

//     const raw = response.choices[0].message.content.trim();
//     const faqs = safeJsonParse(raw);

//     const stylePrompt = comic.styleId?.prompt || "";
//     const themePrompt = comic.themeId?.prompt || "";

//     const faqImages = await Promise.all(
//       faqs.map(async (faq, idx) => {
//         const imgPrompt = `
// Create an educational diagram.
// Theme: ${themePrompt}
// Style: ${stylePrompt}

// Requirements:
// - Show ONLY diagrams (no humans, no characters).
// - Use flowcharts, labeled diagrams, concept maps, or clean infographics.
// - Visualize the concept from the question: "${faq.question}"
// - Illustrate or label the explanation: "${faq.answer}"
// - Clean academic style. School-friendly. High clarity.
//         `;

//         const imgRes = await openai.images.generate({
//           model: "gpt-image-1",
//           prompt: imgPrompt,
//           size: "1024x1536",
//           n: 1,
//         });

//         let buffer;
//         const imgData = imgRes.data[0];

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

//         const fileName = `${Date.now()}_faq_page${idx + 1}.jpg`;
//         const s3Upload = await upload_files("faqs", {
//           name: fileName,
//           data: buffer,
//           mimetype: "image/jpeg",
//         });

//         const s3Key = `faqs/${fileName}`;

//         const savedFAQ = await FAQ.create({
//           comicId,
//           question: faq.question,
//           answer: faq.answer,
//           imageUrl: s3Upload,
//           s3Key,
//         });

//         return savedFAQ.toObject();
//       })
//     );

//     res.json({ faqs: faqImages });
//   } catch (err) {
//     console.error("FAQ Error:", err);
//     res.status(500).json({ error: "FAQ generation failed", details: err.message });
//   }
// };



const generateFAQs = async (req, res) => {
  const { comicId } = req.body;

  try {
    const comic = await Comic.findById(comicId).populate(
      "styleId themeId subjectId"
    );
    if (!comic) return res.status(404).json({ error: "Comic not found" });

    // 🚫 Prevent duplicate FAQ generation
    const existingFAQs = await FAQ.find({ comicId });
    if (existingFAQs.length > 0) {
      return res.json({ alreadyExists: true, faqs: existingFAQs });
    }

    // 🧠 Build story summary (NO dialogues)
    const pages = JSON.parse(comic.prompt || "[]");
    const storyText = pages
      .map((p) =>
        p.panels.map((pp) => `${pp.scene}. ${pp.caption}`).join("\n")
      )
      .join("\n\n");

    // ---------------- TEXT GENERATION (GPT-4o) ----------------

    const faqPrompt = `
You are an educational expert.

Generate 2–4 FAQs with short answers based on the comic below.

Context:
- Subject: ${comic.subject || comic.subjectId?.name || "General Knowledge"}
- Concept: ${comic.concept || ""}
- Grade Level: ${comic.grade || "School Level"}

Comic Summary (ignore characters & dialogues):
${storyText}

Rules:
- Questions must test understanding, reasoning, or application
- Do NOT repeat facts already stated in the comic
- Do NOT ask about characters, story, or art
- Keep answers short and clear
- Output ONLY valid JSON

Format:
[
  { "question": "string", "answer": "string" }
]
`;

    const textRes = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Return ONLY valid JSON." },
        { role: "user", content: faqPrompt },
      ],
      temperature: 0.4,
      max_tokens: 700,
    });

    const faqs = safeJsonParse(
      textRes.choices[0].message.content.trim()
    );

    // ---------------- IMAGE GENERATION (GEMINI) ----------------

    const stylePrompt = comic.styleId?.prompt || "";
    const themePrompt = comic.themeId?.prompt || "";

    const savedFAQs = [];

    for (let i = 0; i < faqs.length; i++) {
      const faq = faqs[i];

      const imagePrompt = `
Create a CLEAN EDUCATIONAL DIAGRAM.

Subject: ${comic.subject || comic.subjectId?.name}
Concept: ${comic.concept}
Grade Level: ${comic.grade}

Theme:
${themePrompt}

Style:
${stylePrompt}

STRICT RULES:
- ONLY diagrams / charts / labeled visuals
- NO people, NO animals, NO scenes
- White or light background
- School textbook style
- Simple colors, high clarity

Visualize this question:
"${faq.question}"

Explain visually:
"${faq.answer}"
`;

      const rawBuffer = await generateGeminiComicImage(imagePrompt);

      const buffer = await sharp(rawBuffer)
        .resize({ width: 1024 })
        .jpeg({ quality: 75 })
        .toBuffer();

      const fileName = `${Date.now()}_faq_${i + 1}.jpg`;
      const imageUrl = await upload_files("faqs", {
        name: fileName,
        data: buffer,
        mimetype: "image/jpeg",
      });

      const saved = await FAQ.create({
        comicId,
        question: faq.question,
        answer: faq.answer,
        imageUrl,
        s3Key: `faqs/${fileName}`,
      });

      savedFAQs.push(saved.toObject());
    }

    res.json({ faqs: savedFAQs });

  } catch (err) {
    console.error("🔥 FAQ Error:", err);
    res.status(500).json({
      error: "FAQ generation failed",
      details: err.message,
    });
  }
};


const listFAQs = async (req, res) => {
  try {
    const { comicId } = req.params;

    // 🔍 Fetch FAQs by comicId
    const faqs = await FAQ.find({ comicId });

    // 🧠 Fetch related subject via comic
    const comic = await Comic.findById(comicId);
    let showAdsFaq = true;

    if (comic?.subjectId) {
      const subject = await Subject.findById(comic.subjectId);
      showAdsFaq = subject ? subject.showAdsFaq : true;
    }

    // 🆕 For each FAQ, attach both flags
    const faqsWithAds = faqs.map((faq) => ({
      ...faq.toObject(),
      showAdsFaq,
      showInterestialAds: showAdsFaq,
    }));

    // ✅ Return modified FAQs
    res.json({ faqs: faqsWithAds });
  } catch (err) {
    console.error("❌ Error fetching FAQs:", err);
    res.status(500).json({ error: "Failed to fetch FAQs" });
  }
};



module.exports = { generateFAQs, listFAQs }