const mongoose = require("mongoose");

const conceptSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: "Subject" }, // relation with subject
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Concept", conceptSchema);
