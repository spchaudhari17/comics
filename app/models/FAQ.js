const mongoose = require("mongoose");
const { Schema } = require("mongoose");
const { ObjectId } = Schema.Types

const FAQSchema = new mongoose.Schema({
  comicId: { type: ObjectId, ref: "Comic" },
  question: String,
  answer: String
}, { timestamps: true });

module.exports = mongoose.model("FAQ", FAQSchema);
