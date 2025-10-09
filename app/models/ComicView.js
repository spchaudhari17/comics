const mongoose = require("mongoose");
const { Schema } = mongoose;

const ComicViewSchema = new Schema({
  comicId: { type: Schema.Types.ObjectId, ref: "Comic", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "users", required: true },
  viewedAt: { type: Date, default: Date.now }
});

ComicViewSchema.index({ comicId: 1, userId: 1 }, { unique: true }); // prevents duplicate views

module.exports = mongoose.model("ComicView", ComicViewSchema);
