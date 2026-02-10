const mongoose = require("mongoose");
const { Schema } = mongoose;

const subscriptionHistorySchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },

    planType: {
      type: String,
      enum: ["bundle", "dashboard"],
    },

    priceId: String,

    stripeSubscriptionId: String,
    stripeInvoiceId: String,

    amount: Number,
    currency: String,

    status: {
      type: String,
      enum: ["created", "renewed", "cancelled", "expired", "payment_failed", "cancel_requested"],
      required: true,
    },

    startDate: Date,
    endDate: Date,
  },
  { timestamps: true }
);

module.exports = mongoose.model("SubscriptionHistory",subscriptionHistorySchema);
