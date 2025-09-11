const mongoose = require("mongoose");

const ThemeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // Example: "Mentor & Apprentice"
    description: { type: String, required: true },
    subjects: [{ type: String }], // ["Math", "Philosophy"]
    grades: { type: String }, // "5–12"
    prompt: { type: String, required: true }, // ChatGPT ke liye
    examplePages: { type: [String] }, // Example page scripts (array of text blocks)
  },
  { timestamps: true }
);

module.exports = mongoose.model("Theme", ThemeSchema);
