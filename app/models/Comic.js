const mongoose = require("mongoose");
const { Schema } = require("mongoose");
const { ObjectId } = Schema.Types

const comicSchema = new mongoose.Schema({
  seriesId: { type: ObjectId, ref: "ComicSeries" }, // NEW
  partNumber: { type: Number }, // NEW

  user_id: { type: ObjectId, ref: "users" },
  themeId: { type: ObjectId, ref: "Theme" },
  styleId: { type: ObjectId, ref: "Style" },
  title: { type: String, required: true, trim: true },
  author: { type: String, trim: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject", required: true },
  subject: { type: String, trim: true },

  concept: { type: String, trim: true },
  conceptId: { type: mongoose.Schema.Types.ObjectId, ref: "Concept" },

  story: { type: String, required: true },
  userStory: { type: String, trim: true },
  thumbnailUrl: { type: String },
  prompt: { type: String, required: true },
  pdfUrl: { type: String },
  // country: { type: String },
  country: [{ type: String }],
  grade: { type: String },
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"], // for admin
    default: "pending"
  },
  comicStatus: {
    type: String,
    enum: ["draft", "published"], // for user comic status
    default: "draft"
  },

  hasQuiz: { type: Boolean, default: false },
  total_view: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Comic", comicSchema);
