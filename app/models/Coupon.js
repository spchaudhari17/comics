// models/Coupon.js

const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true
    },

    stripePromotionCodeId: {
        type: String
    },


    code: {
        type: String,
        unique: true,
        uppercase: true
    },

    discountType: {
        type: String,
        enum: ["percentage", "fixed"],
        required: true
    },

    discountValue: {
        type: Number,
        required: true
    },

    duration: {
        type: String,
        enum: ["once", "forever", "repeating"],
        required: true
    },

    durationInMonths: {
        type: Number,
        default: null
    },

    applicablePlan: {
        type: String,
        enum: ["bundle", "dashboard", "all"],
        default: "all"
    },

    stripeCouponId: {
        type: String
    },

    maxRedemptions: {
        type: Number,
        default: null
    },

    redeemedCount: {
        type: Number,
        default: 0
    },

    expiryDate: {
        type: Date,
        default: null
    },

    status: {
        type: Boolean,
        default: true
    }

}, { timestamps: true });

module.exports = mongoose.model("Coupon", couponSchema);