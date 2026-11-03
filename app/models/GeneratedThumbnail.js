// =====================================================================
// models/GeneratedThumbnail.js
// AI se bani bundle cover images (har ek = 1 credit).
// Save rehti hain taaki teacher baad me bina naye credit ke dobara chun sake.
// =====================================================================

const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema.Types;

const generatedThumbnailSchema = new mongoose.Schema(
    {
        userId: { type: ObjectId, ref: "users", required: true },
        comicId: { type: ObjectId, ref: "Comic", required: true }, // kis comic se bani
        imageUrl: { type: String, required: true },
        s3Key: { type: String },
        instructions: { type: String, default: "" } // teacher ka extra instruction (agar diya)
    },
    { timestamps: true }
);

generatedThumbnailSchema.index({ userId: 1, comicId: 1, createdAt: -1 });

module.exports = mongoose.model("GeneratedThumbnail", generatedThumbnailSchema);
