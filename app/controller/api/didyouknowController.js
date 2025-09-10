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



const generateDidYouKnow = async (req, res) => {
  const { comicId, subject, story } = req.body;

  try {
    const factPrompt = `
    Generate 3 fun "Did You Know?" facts about this subject/story:
    ${subject} / ${JSON.stringify(story)}

    ⚠️ JSON only:
    [
      { "fact": "string" }
    ]
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a strict JSON generator." },
        { role: "user", content: factPrompt }
      ],
      temperature: 0.7
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