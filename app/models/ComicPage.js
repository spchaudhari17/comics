const mongoose = require("mongoose");

const comicPageSchema = new mongoose.Schema({
  comicId: { type: mongoose.Schema.Types.ObjectId, ref: "Comic", required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: "users", },
  pageNumber: { type: Number, required: true },
  panels: { type: Array, required: true }, // store raw panel JSON
  imageUrl: { type: String, required: true }, // S3 URL
  s3Key: { type: String, required: true },    // S3 object key for deletion
  createdAt: { type: Date, default: Date.now }
});

comicPageSchema.index({ comicId: 1, pageNumber: 1 }, { unique: true });

module.exports = mongoose.model("ComicPage", comicPageSchema);
