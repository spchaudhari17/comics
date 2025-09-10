const mongoose = require("mongoose");
const { Schema } = require("mongoose");
const { ObjectId } = Schema.Types

const DidYouKnowSchema = new mongoose.Schema({
  comicId: { type: ObjectId, ref: "Comic" },
  fact: String
}, { timestamps: true });

module.exports = mongoose.model("DidYouKnow", DidYouKnowSchema);
