const mongoose = require("mongoose");
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const HardcoreQuizQuestionSchema = new Schema({
  quizId: { type: ObjectId, ref: "HardcoreQuiz", required: true },
  question: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctAnswer: { type: String, required: true },
  difficulty: { type: String, enum: ["hard", "extreme"], default: "hard" },
  explanation: { type: String }, //detailed answer explanation
  hint: { type: String },
});

module.exports = mongoose.model("HardcoreQuizQuestion", HardcoreQuizQuestionSchema);
