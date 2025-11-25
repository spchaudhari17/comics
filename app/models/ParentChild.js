const mongoose = require("mongoose");
const { Schema } = mongoose;

const ParentChildSchema = new Schema(
    {
        parentId: { type: Schema.Types.ObjectId, ref: "users", required: true },
        childId: { type: Schema.Types.ObjectId, ref: "users", required: true },
    },
    { timestamps: true }
);

// Same child cannot be linked twice to same parent
ParentChildSchema.index({ parentId: 1, childId: 1 }, { unique: true });

module.exports = mongoose.model("ParentChild", ParentChildSchema);
