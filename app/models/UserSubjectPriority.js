const mongoose = require("mongoose");
const { Schema } = mongoose;

const UserSubjectPrioritySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "users", required: true },
  selectedSubjects: [{ type: Schema.Types.ObjectId, ref: "Subject" }] // ordered array
});

module.exports = mongoose.model("UserSubjectPriority", UserSubjectPrioritySchema);
