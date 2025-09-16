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


// old working fine
// const generateDidYouKnow = async (req, res) => {
//   const { comicId, subject, story } = req.body;

//   try {
//     const factPrompt = `
//     Generate 3 fun "Did You Know?" facts about this subject/story:
//     ${subject} / ${JSON.stringify(story)}

//     ⚠️ JSON only:
//     [
//       { "fact": "string" }
//     ]
//     `;

//     const response = await openai.chat.completions.create({
//       model: "gpt-3.5-turbo",
//       messages: [
//         { role: "system", content: "You are a strict JSON generator." },
//         { role: "user", content: factPrompt }
//       ],
//       temperature: 0.7
//     });

//     let raw = response.choices[0].message.content.trim();
//     if (raw.startsWith("```")) raw = raw.replace(/```json|```/g, "").trim();

//     let facts = JSON.parse(raw);

//     // ensure always an array
//     if (!Array.isArray(facts)) {
//       if (typeof facts === "object" && facts.fact) {
//         facts = [facts];
//       } else {
//         throw new Error("Invalid response format from OpenAI");
//       }
//     }

//     const savedFacts = await DidYouKnow.insertMany(
//       facts.map(f => ({ comicId, fact: f.fact }))
//     );

//     res.json({ didYouKnow: savedFacts });
//   } catch (err) {
//     console.error("DidYouKnow error:", err);
//     res.status(500).json({ error: "Failed to generate Did You Know facts", details: err.message });
//   }
// };

const generateDidYouKnow = async (req, res) => {
  const { comicId, subject, story } = req.body;

  try {
    // -------- Convert story to text (without dialogues) --------
    let storyText = "";
    if (Array.isArray(story)) {
      storyText = story
        .map(page =>
          page.panels
            .map(
              p =>
                `Scene: ${p.scene}. Caption: ${p.caption || ""}` // ✅ dialogues skipped
            )
            .join("\n")
        )
        .join("\n\n");
    } else {
      storyText = story;
    }

    // -------- Prompt for facts --------
    const factPrompt = `
    Generate 3 fun and educational "Did You Know?" facts.
    ❌ Do NOT use characters' dialogues.
    ✅ Focus only on knowledge, subject concepts, and factual information.

    Subject: ${subject}
    Story Content:
    ${storyText}

    ⚠️ JSON only:
    [
      { "fact": "string" }
    ]
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a strict JSON generator." },
        { role: "user", content: factPrompt }
      ],
      temperature: 0.7,
      max_tokens: 800
    });

    let raw = response.choices[0].message.content.trim();
    if (raw.startsWith("```")) raw = raw.replace(/```json|```/g, "").trim();

    let facts = JSON.parse(raw);

    // ensure always an array
    if (!Array.isArray(facts)) {
      if (typeof facts === "object" && facts.fact) {
        facts = [facts];
      } else {
        throw new Error("Invalid response format from OpenAI");
      }
    }

    const savedFacts = await DidYouKnow.insertMany(
      facts.map(f => ({ comicId, fact: f.fact }))
    );

    res.json({ didYouKnow: savedFacts });
  } catch (err) {
    console.error("DidYouKnow error:", err);
    res.status(500).json({ error: "Failed to generate Did You Know facts", details: err.message });
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