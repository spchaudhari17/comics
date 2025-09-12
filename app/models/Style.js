const mongoose = require("mongoose");

const StyleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // Example: "Minimalist Cartoon"
    description: { type: String },
    subjects: [{ type: String }], // Example: ["K–5 subjects", "Grammar"]
    grades: { type: String }, // Example: "K–6"
    prompt: { type: String }, // Image AI ke liye
    image: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Style", StyleSchema);
