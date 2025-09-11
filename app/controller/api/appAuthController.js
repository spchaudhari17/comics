const Users = require("../../models/User");
let validator = require("email-validator");
const jwt = require("jsonwebtoken")
var bcrypt = require('bcryptjs');
var crypto = require("crypto");
let mailer = require("../../../config/mailer");
const MOMENT = require('moment');
const { upload_files } = require("../../../helper/helper");


const BASE_URL = process.env.BASE_URL;




const signupWithUsername = async (req, res) => {
    let { firstname = '', lastname = '', password = '', username = '', age = null } = req.body;

    if (username.trim() === '') {
        return res.send({ error: true, status: 201, message: "Username is required." });
    }
    if (password.trim() === '') {
        return res.send({ error: true, status: 201, message: "Password is required." });
    }

    try {
        const isExist = await Users.findOne({ username: username.trim().toLowerCase() });
        if (isExist) {
            return res.send({ error: true, status: 201, message: "Username already taken." });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const userSignup = new Users({
            firstname,
            lastname,
            username: username.trim().toLowerCase(),
            password: passwordHash,
            age,
            is_verify: 1  // ✅ App flow mein OTP skip
        });

        const savedUser = await userSignup.save();

        // ✅ Signup ke baad fresh user data fetch karo (password/otp exclude karke)
        const login_data = await Users.findOne(
            { _id: savedUser._id },
            { password: 0, otp: 0, login_location: 0 }
        );

        // ✅ JWT me pura login_data daalo (web jaisa)
        const token = jwt.sign({ login_data }, process.env.JWTKEY, {
            algorithm: "HS256",
            expiresIn: '180d',
        });

        login_data._doc.token = token;

        return res.send({
            error: false,
            status: 200,
            message: "Signup successful (username based).",
            data: login_data
        });

    } catch (e) {
        return res.send({ error: true, status: 500, message: "Something went wrong", details: e.message });
    }
};



const loginWithUsername = async (req, res) => {
    try {
        let { username = '', password = '' } = req.body;

        if (username.trim() === '') {
            return res.send({ error: true, status: 201, message: "Username is required." });
        }
        if (password === '') {
            return res.send({ error: true, status: 201, message: "Password is required." });
        }

        const user = await Users.findOne({ username: username.trim().toLowerCase() });
        if (!user) {
            return res.send({ error: true, status: 201, message: "Invalid username or password." });
        }

        const isPasswordMatched = bcrypt.compareSync(password, user.password);
        if (!isPasswordMatched) {
            return res.send({ error: true, status: 201, message: "Invalid username or password." });
        }

        // ✅ Web jaisa hi login_data banao (password/otp ko exclude karke)
        const login_data = await Users.findOne(
            { _id: user._id },
            { password: 0, otp: 0, login_location: 0 }
        );

        // ✅ JWT me pura login_data daalo
        const token = jwt.sign({ login_data }, process.env.JWTKEY, {
            algorithm: "HS256",
            expiresIn: '180d',
        });

        login_data._doc.token = token;

        return res.send({
            error: false,
            status: 200,
            message: "Login successful (username based).",
            data: login_data
        });

    } catch (e) {
        return res.send({ error: true, status: 500, message: "Something went wrong", details: e.message });
    }
};



module.exports = { signupWithUsername, loginWithUsername }