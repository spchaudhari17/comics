const mongoose = require("mongoose");
const { Schema } = mongoose;

const ComicViewSchema = new Schema({
  comicId: { type: Schema.Types.ObjectId, ref: "Comic", required: true },
  userId: { type: Schema.Types.ObjectId, ref: "users", required: true },
}, { timestamps: true });

module.exports = mongoose.model("ComicView", ComicViewSchema);
