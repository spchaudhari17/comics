const mongoose = require("mongoose");
const { Schema } = mongoose;

const HardcoreQuizUserAttemptSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: "users", required: true },
    quizId: { type: Schema.Types.ObjectId, ref: "HardcoreQuiz", required: true },
    allowedAttempts: { type: Number, default: 2 }
}, { timestamps: true });

module.exports = mongoose.model("HardcoreQuizUserAttempt", HardcoreQuizUserAttemptSchema);
