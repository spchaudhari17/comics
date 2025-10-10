const mongoose = require("mongoose");
const { Schema } = require("mongoose");
const { ObjectId } = Schema.Types

const QuizQuestionSchema = new mongoose.Schema({
  quizId: { type: ObjectId, ref: "Quiz", required: true },
  question: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctAnswer: { type: String, required: true },
  difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
  explanation: { type: String } //detailed answer explanation
});

module.exports = mongoose.model("QuizQuestion", QuizQuestionSchema);
