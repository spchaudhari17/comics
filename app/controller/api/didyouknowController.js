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
// const generateDidYouKnow = async (req, res) => {
//   const { comicId } = req.body;

//   try {
//     const comic = await Comic.findById(comicId).populate("styleId themeId");
//     if (!comic) return res.status(404).json({ error: "Comic not found" });

//     // ✅ Prevent duplicates
//     const existingFacts = await DidYouKnow.find({ comicId });
//     if (existingFacts.length > 0) {
//       return res.status(200).json({
//         alreadyExists: true,
//         didYouKnow: existingFacts,
//       });
//     }

//     // Extract story text
//     const pages = JSON.parse(comic.prompt || "[]");
//     const storyText = pages
//       .map(p => p.panels.map(pp => `Scene: ${pp.scene}. Caption: ${pp.caption || ""}`).join("\n"))
//       .join("\n\n");

//     const factPrompt = `
// You are an expert educational content creator.

// Generate 1–2 fun and educational "Did You Know?" facts.

// ❌ Do NOT use dialogues.
// ✅ Focus on interesting insights, background information, or real-world connections related to the comic’s subject.

// ⚠️ Do NOT repeat information already covered in the comic storyline.
// Focus only on **new facts or clarifications** that expand the student's understanding.

// Comic Story Content:
// ${storyText}

// Return strictly JSON only:
// [
//   { "fact": "string" }
// ]
//     `;

//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [
//         { role: "system", content: "Return ONLY valid JSON array. No markdown, no text." },
//         { role: "user", content: factPrompt }
//       ],
//       temperature: 0.4,
//       max_tokens: 600
//     });

//     const raw = response.choices[0].message.content.trim();
//     let facts = safeJsonParse(raw);
//     if (!Array.isArray(facts)) facts = [facts];

//     // ✅ Generate images (theme + style)
//     const stylePrompt = comic.styleId.prompt;
//     const themePrompt = comic.themeId.prompt;

//     const factImages = await Promise.all(
//       facts.map(async (fact, idx) => {
//         const imgPrompt = `
// Educational comic-style poster.
// Theme: ${themePrompt}
// Style: ${stylePrompt}

// Panel 1: Title at top: "💡 Did You Know?"
// Panel 2: Fun fact: "${fact.fact}"
// Make it colorful, engaging, and consistent with the comic style.
//         `;

//         const imgRes = await openai.images.generate({
//           model: "gpt-image-1",
//           prompt: imgPrompt,
//           size: "1024x1536",
//           n: 1,
//         });

//         // ✅ Download & optimize
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

//         // ✅ Upload to S3
//         const fileName = `${Date.now()}_didyouknow_${comicId}_${idx + 1}.jpg`;
//         const s3Upload = await upload_files("didyouknow", {
//           name: fileName,
//           data: buffer,
//           mimetype: "image/jpeg",
//         });

//         const s3Key = `didyouknow/${fileName}`;

//         // ✅ Save in DB
//         const savedFact = await DidYouKnow.create({
//           comicId,
//           fact: fact.fact,
//           imageUrl: s3Upload,
//           s3Key,
//         });

//         return savedFact.toObject();
//       })
//     );

//     res.json({ didYouKnow: factImages });
//   } catch (err) {
//     console.error("DidYouKnow Error:", err);
//     res.status(500).json({
//       error: "Failed to generate Did You Know facts",
//       details: err.message,
//     });
//   }
// };



const generateDidYouKnow = async (req, res) => {
  const { comicId } = req.body;

  try {
    const comic = await Comic.findById(comicId).populate("styleId themeId");
    if (!comic) return res.status(404).json({ error: "Comic not found" });

    // ✅ Prevent duplicates
    const existingFacts = await DidYouKnow.find({ comicId });
    if (existingFacts.length > 0) {
      return res.status(200).json({
        alreadyExists: true,
        didYouKnow: existingFacts,
      });
    }

    // 🧠 Build story context (NO dialogues)
    const pages = JSON.parse(comic.prompt || "[]");
    const storyText = pages
      .map(p =>
        p.panels
          .map(pp => `Scene: ${pp.scene}. Caption: ${pp.caption || ""}`)
          .join("\n")
      )
      .join("\n\n");

    // 🧠 TEXT GENERATION (GPT-4o)
    const factPrompt = `
You are an expert educational content creator.

Generate 1–2 fun and educational "Did You Know?" facts.

Rules:
- ❌ Do NOT use dialogues
- ❌ Do NOT repeat information already in the comic
- ✅ Add NEW insights, background knowledge, or real-world connections
- Content must be child-safe and school-friendly

Comic Story Context:
${storyText}

Return ONLY valid JSON:
[
  { "fact": "string" }
]
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Return ONLY valid JSON. No markdown." },
        { role: "user", content: factPrompt }
      ],
      temperature: 0.4,
      max_tokens: 600
    });

    const raw = response.choices[0].message.content.trim();
    let facts = safeJsonParse(raw);
    if (!Array.isArray(facts)) facts = [facts];

    // 🎨 IMAGE GENERATION (Gemini – banana 🍌)
    const stylePrompt = comic.styleId?.prompt || "";
    const themePrompt = comic.themeId?.prompt || "";

    const savedFacts = [];

    for (let i = 0; i < facts.length; i++) {
      const fact = facts[i];

      const imgPrompt = `
Create a single-page educational comic poster.

TITLE:
"💡 Did You Know?"

CONTENT:
"${fact.fact}"

STYLE:
${stylePrompt}

THEME:
${themePrompt}

STRICT RULES:
- One clean poster layout
- No animals or characters unless absolutely required
- No extra facts
- Big readable text
- Child-friendly, colorful, school-safe
- Flat illustration, clean outlines
      `;

      console.log(`🎨 Generating Did You Know image ${i + 1}`);

      const rawBuffer = await generateGeminiComicImage(imgPrompt);

      const buffer = await sharp(rawBuffer)
        .resize({ width: 1024 })
        .jpeg({ quality: 75 })
        .toBuffer();

      const fileName = `${Date.now()}_didyouknow_${comicId}_${i + 1}.jpg`;
      const s3Upload = await upload_files("didyouknow", {
        name: fileName,
        data: buffer,
        mimetype: "image/jpeg",
      });

      const s3Key = `didyouknow/${fileName}`;

      const saved = await DidYouKnow.create({
        comicId,
        fact: fact.fact,
        imageUrl: s3Upload,
        s3Key,
      });

      savedFacts.push(saved.toObject());
    }

    res.json({ didYouKnow: savedFacts });

  } catch (err) {
    console.error("❌ DidYouKnow Error:", err);
    res.status(500).json({
      error: "Failed to generate Did You Know",
      details: err.message,
    });
  }
};





const listDidYouKnow = async (req, res) => {
  try {
    const { comicId } = req.params;

    // 🔍 Fetch all "Did You Know" facts for this comic
    const facts = await DidYouKnow.find({ comicId });

    // 🧠 Find related subject through comic
    const comic = await Comic.findById(comicId);
    let showAdsDidYouKnow = true;

    if (comic?.subjectId) {
      const subject = await Subject.findById(comic.subjectId);
      showAdsDidYouKnow = subject ? subject.showAdsDidYouKnow : true;
    }

    // 🆕 Attach ad flags to each fact
    const factsWithAds = facts.map((fact) => ({
      ...fact.toObject(),
      showAdsDidYouKnow,
      showInterestialAds: showAdsDidYouKnow,
    }));

    // ✅ Send updated response
    res.json({ didYouKnow: factsWithAds });
  } catch (err) {
    console.error("❌ Error fetching Did You Know facts:", err);
    res.status(500).json({ error: "Failed to fetch Did You Know facts" });
  }
};



module.exports = { generateDidYouKnow, listDidYouKnow }