const mongoose = require("../../config/database")

const comicSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  author: {
    type: String,
    required: true,
    trim: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  story: {
    type: String,
    required: true
  },
  prompt: {
    type: String,
    required: true
  },
  image: {
    type: String, // Can be Base64 or Image URL
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});


const Comic = mongoose.model('Comic', comicSchema);
module.exports = Comic
