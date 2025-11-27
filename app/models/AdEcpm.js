// models/AdEcpm.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

const adEcpmSchema = new Schema({
  ad_unit_id: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  ecpm: {
    type: Number,
    required: true // e.g. 0.45 = $0.45 per 1000 impressions
  },
  currency: {
    type: String,
    default: "USD"
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  collection: "ad_ecpms"
});

module.exports = mongoose.model("AdEcpm", adEcpmSchema);
