const mongoose = require("mongoose");
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const purchaseSchema = new Schema({
    userId: { type: ObjectId, ref: "users" },

    bundleId: { type: ObjectId, ref: "ComicBundle" },

    amount: Number,

    teacherAmount: Number, // 60%
    platformAmount: Number, // 40%

    paymentStatus: {
        type: String,
        enum: ["pending", "success", "failed"],
        default: "pending"
    },

    createdAt: { type: Date, default: Date.now }
});