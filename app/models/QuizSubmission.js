const mongoose = require("mongoose");
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const QuizSubmissionSchema = new Schema({
  quizId: { type: ObjectId, ref: "Quiz", required: true },
  userId: { type: ObjectId, ref: "users", required: true },
  answers: [
    {
      questionId: { type: ObjectId, ref: "QuizQuestion", required: true },
      selectedAnswer: { type: String, required: true },
      isCorrect: { type: Boolean, required: true }
    }
  ],
  score: { type: Number, default: 0 },
  submittedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("QuizSubmission", QuizSubmissionSchema);
