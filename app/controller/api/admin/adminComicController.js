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
const User = require("../../../models/User");


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});





const listAllComicsAdmin = async (req, res) => {
  try {
    const { country } = req.query; // 👈 optional country filter
    const filter = { comicStatus: "published" };

    // ✅ If country query is present, add to filter
    if (country && country.trim() !== "") {
      filter.country = country.toUpperCase(); // e.g. "IN", "US"
    }

    const comics = await Comic.find(filter, "-prompt")
      .populate("user_id", "name email userType firstname")
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      total: comics.length,
      country: country || "ALL",
      comics,
    });
  } catch (error) {
    console.error("❌ Admin list comics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch comics",
      error: error.message,
    });
  }
};




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


const assignModeratorRole = async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).send({ error: true, message: "User ID is required" });
    }

    const adminUser = await User.findById(req.user.login_data._id);

    if (!adminUser || adminUser.userType !== 'admin') {
      return res.status(403).send({ error: true, message: "Unauthorized action" });
    }

    const user = await User.findById(user_id);

    if (!user) {
      return res.status(404).send({ error: true, message: "User not found" });
    }

    // Toggle userType logic
    const newUserType = user.userType === 'moderator' ? 'user' : 'moderator';
    user.userType = newUserType;

    await user.save();

    return res.status(200).send({
      error: false,
      message: `User type updated to ${newUserType}`,
      data: user,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send({ error: true, message: "An error occurred" });
  }
};

const deleteUser = async (req, res) => {


  try {

    const { user_id } = req.body;

    if (!user_id) {
      return res.send({ error: true, status: 400, message: "User ID is required." });
    }

    const isDeleted = await User.deleteOne({ "_id": user_id })

    if (isDeleted) {

      return res.send({ "error": false, "status": 200, "message": "Account Deleted successfully." })

    } else {

      return res.send({ "error": true, "status": 201, "message": "An error has occured." })
    }

  } catch (e) {

    return res.send({ "error": true, "status": 201, "message": "Something went wrong." + e })
  }

}


const toggleUnlimited = async (req, res) => {
  try {
    const { isUnlimited, userId } = req.body;

    // agar value nahi bhejoge to error dega
    if (typeof isUnlimited !== "boolean") {
      return res.status(400).json({
        error: "Please provide isUnlimited as true or false"
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { isUnlimited },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      success: true,
      message: `User unlimited access set to ${isUnlimited}`,
      user: updatedUser
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};


module.exports = { approveComicStatusAdmin, listAllComicsAdmin, getAdminComicDetails, assignModeratorRole, deleteUser, toggleUnlimited }

















