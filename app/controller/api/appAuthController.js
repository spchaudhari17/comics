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
    let { firstname = '', lastname = '', password = '', username = '', age = null, grade = '',  country = '' } = req.body;

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
            grade,
            country,
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

// --------------

const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const { default: mongoose } = require("mongoose");

const bulkRegister = async (req, res) => {
  try {
    const teacherId = req.user?.login_data?._id;
    if (!teacherId) return res.status(403).send({ error: true, message: "Unauthorized" });

    if (!req.files || !req.files.file) {
      return res.send({ error: true, message: "Excel file required" });
    }

    const excelFile = req.files.file;
    const workbook = XLSX.read(excelFile.data, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    let createdUsers = [];

    for (const row of data) {
      const { School, Year, Class, Section, ["Roll No."]: RollNo } = row;
      if (!School || !Year || !Class || !Section || !RollNo) continue;

      const username = `${School}${Year}${Class}${Section}${RollNo}`;
      const randomPassword = Math.random().toString(36).slice(-8);
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      const exists = await Users.findOne({ username: username.toLowerCase() });
      if (exists) continue;

      const newUser = new Users({
        username: username.toLowerCase(),
        password: passwordHash,
        plain_password: randomPassword, // 👈 teacher can view this anytime
        userType: "student",
        createdBy: teacherId,
        classInfo: { school: School, year: Year, class: Class, section: Section },
        is_verify: 1,
      });

      const saved = await newUser.save();

      createdUsers.push({
        username,
        password: randomPassword,
        school: School,
        year: Year,
        class: Class,
        section: Section,
        id: saved._id,
      });
    }

    res.send({
      error: false,
      message: "✅ Students added successfully",
      data: createdUsers,
    });
  } catch (e) {
    console.error(e);
    res.send({ error: true, message: e.message });
  }
};

const getStudentsList = async (req, res) => {
  try {
    const teacherId = req.user?.login_data?._id;
    if (!teacherId) return res.status(403).send({ error: true, message: "Unauthorized" });

    const students = await Users.find(
      { createdBy: teacherId, userType: "student" },
      { password: 0 } // exclude the hashed password only
    ).sort({ createdAt: -1 });

    res.send({
      error: false,
      message: "All students fetched successfully",
      data: students,
    });
  } catch (e) {
    console.error(e);
    res.send({ error: true, message: e.message });
  }
};








module.exports = { signupWithUsername, loginWithUsername, bulkRegister, getStudentsList, }