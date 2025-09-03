const mongoose = require("mongoose");

const comicPageSchema = new mongoose.Schema({
  comicId: { type: mongoose.Schema.Types.ObjectId, ref: "Comic", required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "users", },
  pageNumber: { type: Number, required: true },
  panels: { type: Array, required: true }, 
  imageUrl: { type: String, required: true }, 
  s3Key: { type: String, required: true }, 
  createdAt: { type: Date, default: Date.now }
});

comicPageSchema.index({ comicId: 1, pageNumber: 1 }, { unique: true });

module.exports = mongoose.model("ComicPage", comicPageSchema);
