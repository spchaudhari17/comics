// models/CouponBanner.js

const mongoose = require("mongoose");

const couponBannerSchema = new mongoose.Schema({

    headline: {
        type: String,
        required: true
    },

    couponId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Coupon",
        default: null
    },

    status: {
        type: Boolean,
        default: true
    }

}, { timestamps: true });

module.exports = mongoose.model("CouponBanner", couponBannerSchema);