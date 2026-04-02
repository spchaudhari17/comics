const mongoose = require("mongoose");
const { Schema } = mongoose;

const cartSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: "users" },
    bundleId: { type: Schema.Types.ObjectId, ref: "ComicBundle" },

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Cart", cartSchema);