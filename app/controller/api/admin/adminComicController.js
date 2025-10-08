const OpenAI = require("openai");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { upload_files } = require("../../../../helper/helper");
const Comic = require("../../../models/Comic");
const ComicPage = require("../../../models/ComicPage");
const PDFDocument = require("pdfkit");
const sharp = require("sharp");


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});



const listAllComicsAdmin = async (req, res) => {
  try {
    const comics = await Comic.find({ comicStatus: "published" }, "-prompt")
      .populate("user_id", "name email userType firstname")
      .sort({ createdAt: -1 });

    res.json({comics});
  } catch (error) {
    console.error("Admin list comics error:", error);
    res.status(500).json({ error: "Failed to fetch comics" });
  }
};

const getAdminComicDetails = async (req, res) => {
  try {
    const comicId = req.params.id;

    const comic = await Comic.findById(comicId)
      .populate("user_id", "firstname email userType")
      .populate("subjectId", "name")
      .populate("themeId", "name")
      .populate("styleId", "name")
      .lean();

    if (!comic) return res.status(404).json({ error: "Comic not found" });

    const pages = await ComicPage.find({ comicId }).sort({ pageNumber: 1 }).lean();

    res.json({ comic, pages });
  } catch (error) {
    console.error("Error fetching admin comic details:", error);
    res.status(500).json({ error: "Failed to fetch comic details" });
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

















