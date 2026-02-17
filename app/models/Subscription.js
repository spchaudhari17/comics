const mongoose = require("mongoose");
const { Schema } = require("mongoose");
const { ObjectId } = Schema.Types

const subscriptionSchema = new mongoose.Schema(
  {
    userId: { type: ObjectId, ref: "users", },

    // Stripe related (future use)
    stripeCustomerId: {
      type: String,
    },
    stripeSubscriptionId: {
      type: String,
    },

    // Subscription type
    planType: {
      type: String,
      enum: ["bundle", "dashboard"],
      required: true,
    },

    // Pricing reference
    priceId: {
      type: String, // Stripe price id
      required: true,
    },

    // Limits
    comicsPerWeek: {
      type: Number,
      default: 0, // dashboard plans = 0
    },

    studentsLimit: {
      type: Number,
      required: true,
    },

    // Tracking usage
    comicsUsedThisWeek: {
      type: Number,
      default: 0,
    },

    // Subscription lifecycle
    status: {
      type: String,
      enum: ["active", "inactive", "cancelled", "to_cancel"],
      default: "active",
    },

    startDate: {
      type: Date,
      default: Date.now,
    },

    endDate: {
      type: Date, // monthly end
    },

    isAutoRenew: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
