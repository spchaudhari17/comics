// models/ComicSeries.js
const mongoose = require("mongoose");
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const comicSeriesSchema = new Schema({
    
  user_id: { type: ObjectId, ref: "users", required: true },
  themeId: { type: ObjectId, ref: "Theme" },
  styleId: { type: ObjectId, ref: "Style" },
  subjectId: { type: ObjectId, ref: "Subject", required: true },
  conceptId: { type: ObjectId, ref: "Concept" },

  concept: { type: String, required: true, trim: true }, // e.g. "Life cycle of a star"
  grade: { type: String, required: true }, // e.g. "9th"

  title: { type: String, required: true, trim: true }, // e.g. "Life Cycle of a Star"
  author: { type: String, trim: true },
  country: { type: String },
  countries: [{ type: String }], 

  // Relation with child comics
  parts: [{ type: ObjectId, ref: "Comic" }],

  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending"
  },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("ComicSeries", comicSeriesSchema);
