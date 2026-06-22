const mongoose = require("mongoose");

const BundleRatingSchema = new mongoose.Schema(
    {
        bundleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ComicBundle",
            required: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "users",
            required: true,
        },
        rating: {
            type: Number,
            min: 1,
            max: 5,
            required: true,
        },
    },
    { timestamps: true }
);

BundleRatingSchema.index(
    { bundleId: 1, userId: 1 },
    { unique: true }
);

module.exports = mongoose.model("BundleRating", BundleRatingSchema);