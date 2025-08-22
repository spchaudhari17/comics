const mongoose = require("mongoose");
const { Schema } = require("mongoose");
const { ObjectId } = Schema.Types

const comicSchema = new mongoose.Schema({
  user_id: { type: ObjectId, ref: "users" },
  title: { type: String, required: true, trim: true },
  author: { type: String, required: true, trim: true },
  subject: { type: String, required: true, trim: true },
  story: { type: String, required: true },  // user input/original
  prompt: { type: String, required: true }, // refined JSON string
  pdfUrl: { type: String },                 // final PDF S3 URL
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Comic", comicSchema);
