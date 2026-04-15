const mongoose = require("mongoose");
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const purchaseSchema = new Schema({
    userId: { type: ObjectId, ref: "users" },

    bundleId: { type: ObjectId, ref: "ComicBundle" },

    amount: Number,

    teacherAmount: Number, // 60%
    platformAmount: Number, // 40%

    paymentIntentId: { type: String }, // 🔥 Stripe

    paymentMethod: {
        type: String,
        default: "card"
    },

    currency: {
        type: String,
        default: "USD" // ✅ FIX
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

module.exports = mongoose.model("Purchase", purchaseSchema);