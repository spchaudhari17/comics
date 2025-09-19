const mongoose = require("mongoose");
const { Schema } = require("mongoose");
const { ObjectId } = Schema.Types

const FAQSchema = new mongoose.Schema({
  comicId: { type: ObjectId, ref: "Comic" },
  question: { type: String },
  answer: { type: String },
  imageUrl: { type: String },
}, { timestamps: true });

module.exports = mongoose.model("FAQ", FAQSchema);
