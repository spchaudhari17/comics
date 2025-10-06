const mongoose = require("mongoose");
const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

const HardcoreQuizSchema = new Schema({
  comicId: { type: ObjectId, ref: "Comic", required: true },
  user_id: { type: ObjectId, ref: "users" },
  questions: [{ type: ObjectId, ref: "HardcoreQuizQuestion" }],
  status: { type: String, enum: ["draft", "published"], default: "draft" },
  mode: { type: String, default: "hardcore" }, // 👈 flag for identification
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("HardcoreQuiz", HardcoreQuizSchema);
