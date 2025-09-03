const mongoose = require("mongoose");
const { Schema } = require("mongoose");
const { ObjectId } = Schema.Types

const QuizSchema = new mongoose.Schema({
    comicId: { type: ObjectId, ref: "Comic", required: true },
    user_id: { type: ObjectId, ref: "users", },
    questions: [{ type: ObjectId, ref: "QuizQuestion" }],
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Quiz", QuizSchema);
