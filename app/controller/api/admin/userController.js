const Users = require("../../../models/User");
let validator = require("email-validator");
const jwt = require("jsonwebtoken")
var bcrypt = require('bcryptjs');
var crypto = require("crypto");
const MOMENT = require('moment');
const { upload_files } = require("../../../../helper/helper");



const getAllUsers = async (req, res) => {
    try {
        let users = await Users.find().select("-password -reset_key -otp").sort({ createdAt: -1 });


        return res.status(200).json({
            success: true,
            count: users.length,
            data: users
        });

    } catch (err) {
        console.error("Error in getAllUsers:", err);
        return res.status(500).json({
            success: false,
            message: "Something went wrong!",
            error: err.message
        });
    }
};

module.exports = { getAllUsers }