const mongoose = require("mongoose");
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const HardcoreQuizSubmissionSchema = new Schema({
    quizId: { type: ObjectId, ref: "HardcoreQuiz", required: true },
    userId: { type: ObjectId, ref: "users", required: true },
    answers: [
        {
            questionId: { type: ObjectId, ref: "HardcoreQuizQuestion", required: true },
            selectedAnswer: { type: String },
            isCorrect: { type: Boolean, required: true },
            coins: { type: Number, default: 0 },  // more reward for hardcore
            exp: { type: Number, default: 0 }     // more experience for hardcore
        }
    ],
    score: { type: Number, default: 0 },
    coinsEarned: { type: Number, default: 0 },
    expEarned: { type: Number, default: 0 },
    submittedAt: { type: Date, default: Date.now },
    currentMultiplier: { type: Number, default: 1 },
}, { timestamps: true });

module.exports = mongoose.model("HardcoreQuizSubmission", HardcoreQuizSubmissionSchema);
