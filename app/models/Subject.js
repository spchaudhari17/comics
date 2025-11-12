const mongoose = require("mongoose");

const subjectSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  image: { type: String },
  ishowads: { type: Boolean, default: true },

  showAdsFaq: { type: Boolean, default: true },
  showAdsDidYouKnow: { type: Boolean, default: true },
  showAdsQuiz: { type: Boolean, default: true },
  showAdsHardcoreQuiz: { type: Boolean, default: true },


  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Subject", subjectSchema);
