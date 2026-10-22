// =====================================================================
// models/CreditTransaction.js
// Har credit ka hisaab: kharida (purchase), kharch (spend), wapas (refund)
// stripeSessionId UNIQUE hai -> ek payment ke credit do baar nahi milenge
// =====================================================================

const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema.Types;

const creditTransactionSchema = new mongoose.Schema(
    {
        userId: { type: ObjectId, ref: "users", required: true, index: true },

        type: {
            type: String,
            enum: ["purchase", "spend", "refund", "admin_adjust"],
            required: true
        },

        // purchase/refund = +ve, spend = -ve
        credits: { type: Number, required: true },

        // Purchase details
        packId: { type: String },
        amountUsd: { type: Number },
        stripeSessionId: { type: String },
        stripePaymentIntentId: { type: String },

        // Spend/refund details
        comicId: { type: ObjectId, ref: "Comic" },
        pageNumber: { type: Number },

        note: { type: String }
    },
    { timestamps: true }
);

// Duplicate webhook se double credit na mile
creditTransactionSchema.index(
    { stripeSessionId: 1 },
    { unique: true, partialFilterExpression: { stripeSessionId: { $type: "string" } } }
);

creditTransactionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("CreditTransaction", creditTransactionSchema);