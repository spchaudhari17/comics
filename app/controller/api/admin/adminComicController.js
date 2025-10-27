const OpenAI = require("openai");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { upload_files } = require("../../../../helper/helper");
const Comic = require("../../../models/Comic");
const ComicPage = require("../../../models/ComicPage");
const PDFDocument = require("pdfkit");
const sharp = require("sharp");
const HardcoreQuiz = require("../../../models/HardcoreQuiz");
const DidYouKnow = require("../../../models/DidYouKnow");
const Quiz = require("../../../models/Quiz");
const FAQ = require("../../../models/FAQ");


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});



const listAllComicsAdmin = async (req, res) => {
  try {
    const comics = await Comic.find({ comicStatus: "published" }, "-prompt")
      .populate("user_id", "name email userType firstname")
      .sort({ createdAt: -1 });

    res.json({ comics });
  } catch (error) {
    console.error("Admin list comics error:", error);
    res.status(500).json({ error: "Failed to fetch comics" });
  }
};

// Controller: listAllComicsAdmin
// const listAllComicsAdmin = async (req, res) => {
//   try {
//     const { country } = req.query;
//     const filter = {};

//     if (country) {
//       filter.country = country; // filter by country
//     }

//     const comics = await Comic.find(filter)
//       .populate("user_id", "firstname email userType")
//       .populate("subjectId", "name")
//       .sort({ createdAt: -1 });

//     res.json({ success: true, comics });
//   } catch (err) {
//     console.error("❌ Error fetching comics:", err);
//     res.status(500).json({ success: false, message: "Failed to fetch comics" });
//   }
// };



const getAdminComicDetails = async (req, res) => {
  try {
    const comicId = req.params.id;

    // 1️⃣ Find the main comic
    const comic = await Comic.findById(comicId)
      .populate("user_id", "firstname email userType")
      .populate("subjectId", "name")
      .populate("themeId", "name")
      .populate("styleId", "name")
      .lean();

    if (!comic) {
      return res.status(404).json({
        error: true,
        status: 404,
        message: "Comic not found",
      });
    }

    // 2️⃣ Find pages
    const pages = await ComicPage.find({ comicId })
      .sort({ pageNumber: 1 })
      .lean();

    // 3️⃣ Find Quiz
    const quiz = await Quiz.findOne({ comicId })
      .populate({
        path: "questions",
        select:
          "question options correctAnswer explanation hint difficulty",
      })
      .lean();

    // 4️⃣ Find Did You Know
    const didYouKnow = await DidYouKnow.find({ comicId }).lean();

    // 5️⃣ Find FAQs
    const faqs = await FAQ.find({ comicId }).lean();

    // 6️⃣ Find Hardcore Quiz
    const hardcoreQuiz = await HardcoreQuiz.findOne({ comicId })
      .populate({
        path: "questions",
        select:
          "question options correctAnswer difficulty explanation hint",
      })
      .lean();

    // 7️⃣ Create section flags
    const hasQuiz = !!quiz;
    const hasDidYouKnow = didYouKnow && didYouKnow.length > 0;
    const hasFaq = faqs && faqs.length > 0;
    const hasHardcoreQuiz = !!hardcoreQuiz;

    // 8️⃣ Prepare final response object
    const response = {
      comic,
      pages,
      quiz: quiz || null,
      didYouKnow: didYouKnow || [],
      faqs: faqs || [],
      hardcoreQuiz: hardcoreQuiz || null,

      // ⚡️ Section flags
      hasQuiz,
      hasDidYouKnow,
      hasFaq,
      hasHardcoreQuiz,
    };

    // ✅ Send response
    return res.status(200).json({
      error: false,
      status: 200,
      message: "Admin comic details fetched successfully",
      data: response,
    });
  } catch (error) {
    console.error("❌ Error fetching admin comic details:", error);
    return res.status(500).json({
      error: true,
      status: 500,
      message: "Failed to fetch comic details",
      details: error.message,
    });
  }
};


const approveComicStatusAdmin = async (req, res) => {
  try {
    const { id } = req.body;
    const { status } = req.body;

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const comic = await Comic.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!comic) {
      return res.status(404).json({ error: "Comic not found" });
    }

    res.json({ message: `Comic ${status} successfully`, comic });
  } catch (error) {
    console.error("Update comic status error:", error);
    res.status(500).json({ error: "Failed to update comic status" });
  }
};





module.exports = { approveComicStatusAdmin, listAllComicsAdmin, getAdminComicDetails }

















