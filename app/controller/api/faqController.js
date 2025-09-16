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


// old working fine
// const generateFAQs = async (req, res) => {
//   const { comicId, story } = req.body;

//   try {
//     let storyText = "";
//     if (Array.isArray(story)) {
//       storyText = story
//         .map(page =>
//           page.panels
//             .map(
//               p =>
//                 `Scene: ${p.scene}. Caption: ${p.caption || ""}. Dialogue: ${p.dialogue
//                   .map(d => `${d.character}: ${d.text}`)
//                   .join(" ")}`
//             )
//             .join("\n")
//         )
//         .join("\n\n");
//     } else {
//       storyText = story;
//     }

//     const faqPrompt = `
//     Extract 3 FAQs with answers based on this story:

//     ${storyText}

//     ⚠️ Output JSON only:
//     [
//       { "question": "string", "answer": "string" }
//     ]
//     `;

//     const response = await openai.chat.completions.create({
//       model: "gpt-3.5-turbo",
//       messages: [
//         { role: "system", content: "You are a strict JSON generator." },
//         { role: "user", content: faqPrompt }
//       ],
//       temperature: 0.5,
//       max_tokens: 800
//     });

//     let raw = response.choices[0].message.content.trim();
//     if (raw.startsWith("```")) raw = raw.replace(/```json|```/g, "").trim();

//     const faqs = JSON.parse(raw);

//     const savedFAQs = await FAQ.insertMany(
//       faqs.map(f => ({ comicId, question: f.question, answer: f.answer }))
//     );

//     res.json({ faqs: savedFAQs });
//   } catch (err) {
//     console.error("FAQ error:", err);
//     res.status(500).json({ error: "Failed to generate FAQs", details: err.message });
//   }
// };


const generateFAQs = async (req, res) => {
  const { comicId, story } = req.body;

  try {
    let storyText = "";

    if (Array.isArray(story)) {
      storyText = story
        .map(page =>
          page.panels
            .map(
              p =>
                `Scene: ${p.scene}. Caption: ${p.caption || ""}`
            )
            .join("\n")
        )
        .join("\n\n");
    } else {
      storyText = story;
    }

    const faqPrompt = `
    Extract 3 meaningful FAQs with answers based on the *educational content* of this story.
    ❌ Do NOT use characters’ dialogues as questions or answers.
    ✅ Focus only on the knowledge and concepts taught in the story.

    Story:
    ${storyText}

    ⚠️ Output JSON only:
    [
      { "question": "string", "answer": "string" }
    ]
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      // model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a strict JSON generator." },
        { role: "user", content: faqPrompt }
      ],
      temperature: 0.5,
      max_tokens: 800
    });

    let raw = response.choices[0].message.content.trim();
    if (raw.startsWith("```")) raw = raw.replace(/```json|```/g, "").trim();

    const faqs = JSON.parse(raw);

    const savedFAQs = await FAQ.insertMany(
      faqs.map(f => ({ comicId, question: f.question, answer: f.answer }))
    );

    res.json({ faqs: savedFAQs });
  } catch (err) {
    console.error("FAQ error:", err);
    res.status(500).json({ error: "Failed to generate FAQs", details: err.message });
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


module.exports = {generateFAQs, listFAQs}