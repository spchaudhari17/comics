const mongoose = require('mongoose');

const countrySchema = new mongoose.Schema({
  value: { type: String, required: true }, // country code
  label: { type: String, required: true }  // emoji + name
});

module.exports = mongoose.model('Country', countrySchema);
