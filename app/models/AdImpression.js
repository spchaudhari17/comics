// models/AdImpression.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const adImpressionSchema = new Schema({
    comic: {
        type: Schema.Types.ObjectId,
        ref: "Comic",
        required: true
    },
    ad_unit_id: {
        type: String,
        required: true,
        trim: true
    },
    ad_type: {
        type: String,
        enum: ["banner", "interstitial", "rewarded"],
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    collection: "ad_impressions"
});

module.exports = mongoose.model("AdImpression", adImpressionSchema);
