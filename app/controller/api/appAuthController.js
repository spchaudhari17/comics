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
  let { firstname = '', lastname = '', password = '', username = '', age = null, grade = '', country = '' } = req.body;

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
const { default: mongoose } = require("mongoose");

const generateRandomPassword = () => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
};

const bulkRegister = async (req, res) => {
  try {
    const teacherId = req.user?.login_data?._id;
    if (!teacherId)
      return res.status(403).send({ error: true, message: "Unauthorized" });

    if (!req.files || !req.files.file)
      return res.send({ error: true, message: "Excel file required" });

    const excelFile = req.files.file;
    const workbook = XLSX.read(excelFile.data, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    let createdUsers = [];

    // ⭐ GRADE MAPPING FUNCTION
    const getGradeName = (cls) => {
      const num = parseInt(cls);

      if (!isNaN(num)) {
        if (num === 1) return "1st Standard";
        if (num === 2) return "2nd Standard";
        if (num === 3) return "3rd Standard";
        if (num === 4) return "4th Standard";
        if (num === 5) return "5th Standard";
        if (num === 6) return "6th Standard";
        if (num === 7) return "7th Standard";
        if (num === 8) return "8th Standard";
        if (num === 9) return "9th Standard";
        if (num === 10) return "10th Standard";
        if (num === 11) return "11th Standard";
        if (num === 12) return "12th Standard";
      }

      if (cls.toString().toUpperCase() === "UG") return "UG";
      if (cls.toString().toUpperCase() === "PG") return "PG";

      return "Unknown";
    };


    for (const row of data) {
      const { School, Year, Class, Section, ["Roll No."]: RollNo, Country } = row;
      if (!School || !Year || !Class || !Section || !RollNo) continue;

      // ✅ Follow institutional username rule
      const schoolCode = School.trim().toUpperCase().slice(0, 3); // 3 letters
      const yearCode = Year.toString().padStart(2, "0"); // 2 digits
      const classCode = Class.toString().padStart(2, "0"); // 2 digits
      const sectionCode = Section.trim().toUpperCase().slice(0, 1); // 1 letter
      const rollCode = RollNo.toString().padStart(3, "0"); // 3 digits

      const username = `${schoolCode}${yearCode}${classCode}${sectionCode}${rollCode}`; // e.g. GGS2508A001

      const randomPassword = generateRandomPassword();
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      const exists = await Users.findOne({ username: username.toLowerCase() });
      if (exists) continue;

      const gradeName = getGradeName(Class);
      const countryCode = Country?.trim().toUpperCase() || "IN";

      const newUser = new Users({
        username: username.toLowerCase(),
        password: passwordHash,
        plain_password: randomPassword,
        userType: "student",
        createdBy: teacherId,

        grade: gradeName,
        country: countryCode,

        classInfo: {
          school: schoolCode,
          year: yearCode,
          class: classCode,
          section: sectionCode,
          rollNo: rollCode,
          country: countryCode,
        },
        is_verify: 1,
      });

      const saved = await newUser.save();

      createdUsers.push({
        username,
        password: randomPassword,
        school: schoolCode,
        year: yearCode,
        class: classCode,
        section: sectionCode,
        rollNo: rollCode,
        country: countryCode,
        grade: gradeName,
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
    if (!teacherId)
      return res.status(403).send({ error: true, message: "Unauthorized" });

    const students = await Users.find(
      { createdBy: teacherId, userType: "student" },
      { password: 0 }
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


const resetStudentPassword = async (req, res) => {
  try {
    const { studentId } = req.body;
    const teacherId = req.user?.login_data?._id;

    if (!studentId)
      return res.send({ error: true, message: "Student ID required" });

    const student = await Users.findOne({
      _id: studentId,
      createdBy: teacherId,
      userType: "student",
    });

    if (!student)
      return res.send({ error: true, message: "Student not found or unauthorized" });

    const newPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(newPassword, 12);

    await Users.updateOne(
      { _id: studentId },
      { $set: { password: passwordHash, plain_password: newPassword } }
    );

    res.send({
      error: false,
      message: "Password reset successfully",
      newPassword,
      username: student.username,
    });
  } catch (e) {
    res.send({ error: true, message: e.message });
  }
};

const deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.body;
    const teacherId = req.user?.login_data?._id;

    const deleted = await Users.findOneAndDelete({
      _id: studentId,
      createdBy: teacherId,
      userType: "student",
    });

    if (!deleted)
      return res.send({ error: true, message: "Student not found or unauthorized" });

    res.send({ error: false, message: "Student deleted successfully" });
  } catch (e) {
    res.send({ error: true, message: e.message });
  }
};

const deleteAllStudents = async (req, res) => {
  try {
    const { filter } = req.body;
    const teacherId = req.user?.login_data?._id;

    let query = { createdBy: teacherId, userType: "student" };

    if (filter && filter !== "All") {
      const [school, year, className, section] = filter.split("-");
      query["classInfo.school"] = school;
      query["classInfo.year"] = year;
      query["classInfo.class"] = className;
      query["classInfo.section"] = section;
    }

    const result = await Users.deleteMany(query);
    res.send({
      error: false,
      message: `${result.deletedCount} students deleted successfully.`,
    });
  } catch (e) {
    res.send({ error: true, message: e.message });
  }
};






module.exports = {
  signupWithUsername, loginWithUsername, bulkRegister, getStudentsList,
  resetStudentPassword,
  deleteStudent,
  deleteAllStudents
}