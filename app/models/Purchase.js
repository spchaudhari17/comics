const mongoose = require("mongoose");
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const purchaseSchema = new Schema({
    userId: { type: ObjectId, ref: "users", required: true },
    bundleId: { type: ObjectId, ref: "ComicBundle", required: true },
    teacherId: { type: ObjectId, ref: "users", index: true },

    amount: { type: Number, required: true },
    currency: { type: String, default: "usd" },

    teacherAmount: { type: Number, required: true },
    platformAmount: { type: Number, required: true },

    paymentIntentId: { type: String },
    chargeId: { type: String },
    transferId: { type: String },

    teacherPayoutStatus: {
        type: String,
        enum: ["pending", "transferred", "failed"],
        default: "pending"
    },

    paymentMethod: {
        type: String,
        default: "card"
    },

    buyerDetails: {
        name: String,
        email: String
    },

    paymentStatus: {
        type: String,
        enum: ["pending", "success", "failed", "refunded"],
        default: "pending"
    },

    createdAt: { type: Date, default: Date.now }
});

// 🔥 Check export - Yeh sahi hai?
module.exports = mongoose.model("Purchase", purchaseSchema);