// models/ComicBundle.js
const mongoose = require("mongoose");
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const comicBundleSchema = new Schema({
    title: { type: String, required: true },

    description: { type: String },

    teacherId: { type: ObjectId, ref: "users", required: true },

    comics: [{ type: ObjectId, ref: "Comic" }], // 🔥 main logic

    // Cover: is comic ka pehla page bundle ka thumbnail. null = pehla comic
    thumbnailComicId: { type: ObjectId, ref: "Comic", default: null },

    // AI se bana cover (credit wala). Ho to yahi thumbnail, thumbnailComicId se upar
    customThumbnailId: { type: ObjectId, ref: "GeneratedThumbnail", default: null },
    customThumbnail: { type: String, default: "" },

    price: { type: Number, required: true },

    isBundle: { type: Boolean, default: false }, // single vs bundle

    status: {
        type: String,
        enum: ["draft", "published"],
        default: "draft"
    },

    // Rating Fields
    averageRating: {
        type: Number,
        default: 0
    },

    totalRatings: {
        type: Number,
        default: 0
    },

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("ComicBundle", comicBundleSchema);