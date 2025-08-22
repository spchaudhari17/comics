
const mongoose = require("../../config/database")

var UserSchema = new mongoose.Schema({

    firstname: { type: String },
    lastname: { type: String },
    username: { type: String },
    password: { type: String },
    email: { type: String, default: "", index: { unique: true } },
    userType: { type: String, default: "user" },
    profile_pic: { type: String, default: "" },
    device_type: { type: String, default: "" },
    device_udid: { type: String, default: "" },
    signup_type: { type: String, enum: ['Normal', 'Google', 'Apple'], default: 'Normal' },
    social_id: { type: String, default: '' },
    countryCode: { type: String, default: '+1' },
    mobileNumber: { type: String, default: '' },
    email_verified_at: { type: Date, default: "" },
    is_verify: { type: String, default: '0' },

    otp: { type: Number, default: 0 },
    otp_generated_at: { type: Date, default: 0 },
    resend_blocked_at: { type: Date, default: 0 },
    otp_resend: { type: Number, default: 0 },
    otp_verify_at: { type: Date, default: "" },
}, { timestamps: true })

const User = mongoose.model('users', UserSchema);
module.exports = User
