
const mongoose = require("../../config/database")

var UserSchema = new mongoose.Schema({

    firstname: { type: String },
    lastname: { type: String },
    username: { type: String },
    password: { type: String },
    grade: { type: String },
    country: { type: String },
    email: {
        type: String,
        // unique: true,   
        // sparse: true,   
        trim: true,
        default: ''
    },
    userType: { type: String, default: "user" },
    age: { type: Number, min: 0, max: 120 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "users", default: null }, // Teacher who created student
    classInfo: {
        school: String,
        year: String,
        class: String,
        section: String
    },
    plain_password: { type: String, default: "" }, // for teacher reference (students' visible password)


    profile_pic: { type: String, default: "" },
    device_type: { type: String, default: "" },
    device_udid: { type: String, default: "" },
    social_id: { type: String, default: '' },
    countryCode: { type: String, default: '+1' },
    mobileNumber: { type: String, default: '' },
    email_verified_at: { type: Date, default: "" },
    is_verify: { type: String, default: '0' },

    // Wallet System
    coins: { type: Number, default: 0 },
    exp: { type: Number, default: 0 },
    gems: { type: Number, default: 0 },

    otp: { type: Number, default: 0 },
    otp_generated_at: { type: Date, default: 0 },
    resend_blocked_at: { type: Date, default: 0 },
    otp_resend: { type: Number, default: 0 },
    otp_verify_at: { type: Date, default: "" },
    reset_key: { type: String, required: false, default: "" },


    powerCards: {
        hint: { type: Number, default: 0 },
        timeExtend: { type: Number, default: 0 },
        reduceOptions: { type: Number, default: 0 },
        changeQuestion: { type: Number, default: 0 },
    },



}, { timestamps: true })

const User = mongoose.model('users', UserSchema);
module.exports = User
