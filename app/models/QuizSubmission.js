const mongoose = require("mongoose");
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const QuizSubmissionSchema = new Schema({
  quizId: { type: ObjectId, ref: "Quiz", required: true },
  userId: { type: ObjectId, ref: "users", required: true },
  answers: [
    {
      questionId: { type: ObjectId, ref: "QuizQuestion", required: true },
      selectedAnswer: { type: String },
      isCorrect: { type: Boolean, required: true },
      timeTaken: { type: Number, default: 0 },
      coins: { type: Number, default: 0 },  // reward per question
      exp: { type: Number, default: 0 }     // reward per question
    }
  ],
  score: { type: Number, default: 0 },
  coinsEarned: { type: Number, default: 0 }, // total
  expEarned: { type: Number, default: 0 },   // total
  submittedAt: { type: Date, default: Date.now },
  isDoubleRewardApplied: { type: Boolean, default: false },
});

module.exports = mongoose.model("QuizSubmission", QuizSubmissionSchema);
