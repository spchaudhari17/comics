// =====================================================================
// models/GeneratedThumbnail.js
// Bundle cover images jo teacher ke paas save rehti hain:
//   source "ai"     -> AI se bani (har ek = 1 credit), comicId = kis comic se bani
//   source "upload" -> teacher ne khud upload ki (free), kisi comic se judi nahi
// Save rehti hain taaki teacher baad me dobara chun sake.
// =====================================================================

const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema.Types;

const generatedThumbnailSchema = new mongoose.Schema(
    {
        userId: { type: ObjectId, ref: "users", required: true },
        source: { type: String, enum: ["ai", "upload"], default: "ai" },
        comicId: {
            type: ObjectId,
            ref: "Comic",
            required: function () { return this.source !== "upload"; } // AI wali kis comic se bani
        },
        imageUrl: { type: String, required: true },
        s3Key: { type: String },
        instructions: { type: String, default: "" } // teacher ka extra instruction (agar diya)
    },
    { timestamps: true }
);

generatedThumbnailSchema.index({ userId: 1, comicId: 1, createdAt: -1 });
generatedThumbnailSchema.index({ userId: 1, source: 1, createdAt: -1 });

module.exports = mongoose.model("GeneratedThumbnail", generatedThumbnailSchema);
