const mongoose = require("mongoose");
const { Schema } = require("mongoose");
const { ObjectId } = Schema.Types

const comicSchema = new mongoose.Schema({
  user_id: { type: ObjectId, ref: "users" },
  themeId: { type: ObjectId, ref: "Theme" },
  styleId: { type: ObjectId, ref: "Style" },
  title: { type: String, required: true, trim: true },
  author: { type: String, trim: true },
  subject: { type: String, required: true, trim: true },
  story: { type: String, required: true },
  thumbnailUrl: { type: String },
  prompt: { type: String, required: true },
  pdfUrl: { type: String },
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

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Comic", comicSchema);
