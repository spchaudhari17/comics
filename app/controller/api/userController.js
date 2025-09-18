const Users = require("../../models/User");
let validator = require("email-validator");
const jwt = require("jsonwebtoken")
var bcrypt = require('bcryptjs');
var crypto = require("crypto");
let mailer = require("../../../config/mailer");
const MOMENT = require('moment');
const { upload_files, deleteFiles } = require("../../../helper/helper");
const mongoose = require("mongoose");
const QuizSubmission = require("../../models/QuizSubmission");


const BASE_URL = process.env.BASE_URL;


const signupWithEmail = async (req, res) => {

    let { firstname = '', lastname = '', password = '', username = '', email = '', countryCode = '+1',
        mobileNumber = '', device_udid = '', device_type = '' } = req.body


    if (firstname === '') {

        return res.send({ "error": true, 'status': 201, "message": "Firstname name is required.", "message_desc": "Full name is required." })

    }
    else if (lastname === '') {

        return res.send({ "error": true, 'status': 201, "message": "Lastname is required.", "message_desc": "Username is required" })

    }
    // else if (username === '') {

    //     return res.send({ "error": true, 'status': 201, "message": "Username is required.", "message_desc": "Username is required" })

    // }
    if (email === '') {

        return res.send({ "error": true, 'status': 201, "message": "Email is required.", "message_desc": "Email is required" })

    }
    else if (password === '') {

        return res.send({ "error": true, 'status': 201, "message": "Password is required.", "message_desc": "Password is required" })

    }


    if (email.trim() == '' || !validator.validate(req.body.email)) {

        return res.send({ "error": true, 'status': 201, "message": "Email is required and must be valid.", "message_desc": "Email is required and must be valid." })

    } else if (password == '') {

        return res.send({ "error": true, 'status': 201, "message": "Password is required.", "message_desc": "Password is required." })

    }


    email = email.trim().toLowerCase();

    try {


        // Check if email already exists
        let isExist = await Users.findOne({ email: email });

        if (isExist) {

            return res.send({ "error": true, 'status': 201, "message": "This email already taken.", "message_desc": "This email already taken." })

        }

        // Check if username already exists
        // const isUsernameExist = await Users.findOne({ username });

        // if (isUsernameExist) {

        //     return res.send({ "error": true, 'status': 201, "message": "Username already taken.", "message_desc": "Username already taken." });

        // }

        var min = 1000;
        var max = 9999;
        var otp = Math.floor(Math.random() * (max - min + 1)) + min;

        var passwordHash = await bcrypt.hashSync(password, 12);

        var keys = crypto.randomBytes(20).toString('hex');

        const userSignup = new Users({
            firstname: firstname,
            lastname: lastname,
            username: username,
            email: email,
            password: passwordHash,
            reset_key: keys,
            otp: otp,
            otp_generated_at: Date.now(),
            countryCode: countryCode,
            mobileNumber: mobileNumber,
            device_type: device_type,
            device_udid: device_udid,
        });

        var isSaved = await userSignup.save();

        var userId = isSaved._id;



        await mailer.sendMail({
            from: '"comics" <Comicsapp@gmail.com>', // sender address
            to: email, // list of receivers
            subject: "comics account verification link", // Subject line
            text: "Verification link", // plain text body
            html: "Hi! " + firstname + ",<br><br>Your Email verification OTP is:" + otp + "<br><br> Any issues please email Comicsapp@gmail.com. <br><br> Reminder Team", // html body
        });



        if (isSaved) {

            const login_data = await Users.findOne({ "_id": userId }, { resend_blocked_at: 0, otp_resend: 0, is_verify: 0, otp: 0, otp_generated_at: 0, otp_verify_at: 0, updatedAt: 0 });

            // const token = jwt.sign({ login_data }, process.env.JWTKEY, {
            //     algorithm: "RS256",
            //     expiresIn: '30d',
            // })

            return res.send({ "error": false, 'status': 200, "message": "Signup successful! An OTP has been sent to your email for verification.", "message_desc": "Signup successful! An OTP has been sent to your email for verification.", "data": login_data })

            //return res.send({ "error": false, "message": "Signup successfull a verification link sent to your email.","message_desc":"Signup successfull.", "data": updatedData })

        } else {

            return res.send({ "error": true, 'status': 201, "message": "An error has occured.", "message_desc": "An error has occured." })
        }

    } catch (e) {

        return res.send({ "error": true, "message": "" + e, 'status': 201, "message_desc": "unhandled exception found" + e })
    }

}



const verify_otp = async (req, res) => {


    try {

        const { email = '', otp = '' } = req.body

        if (email == '' || !validator.validate(req.body.email)) {

            return res.send({ "error": true, 'status': 201, "message": "Email field is required and must be valid email.", "message_desc": "Email field is required and must be valid email." })

        }

        if (otp == '' || otp == 0) {

            return res.send({ "error": true, 'status': 201, "message": "Otp is required.", "message_desc": "Enter your otp which you have recieved in your mobile number." })

        }

        const data = await Users.findOne({ email }, { resend_blocked_at: 0 })


        if (data == null) {

            return res.send({ "error": true, 'status': 201, "message": "Email id not registered with us.", "message_desc": "The Email you provided is not registered with us." })
        }

        if (data.otp === 0) {

            return res.send({ "error": true, 'status': 201, "message": "No OTP found.", "message_desc": "No OTP found." })
        }

        if (data.otp != otp) {

            return res.send({ "error": true, 'status': 201, "message": "Invalid otp.", "message_desc": "OTP verifcation failled due to wrong otp provided." })
        }


        startTime = MOMENT(data.otp_generated_at, 'YYYY-MM-DD HH:mm:ss');
        endTime = MOMENT(new Date(Date.now()), 'YYYY-MM-DD HH:mm:ss');
        var reset_keys = crypto.randomBytes(20).toString('hex');
        let timeDiff = endTime.diff(startTime, "minute");

        if (timeDiff > 1440) {

            return res.send({ "error": true, 'status': 201, "message": "OTP has been expired.", "message_desc": "You can verify within 30 min." })

        }

        login_data = data

        const token = jwt.sign({ login_data }, process.env.JWTKEY, {
            algorithm: "HS256",
            expiresIn: '180d',
        })



        const isupdated = await Users.updateMany({ email }, { $set: { otp: 0, reset_key: reset_keys, otp_generated_at: "", "otp_verify_at": Date.now(), "email_verified_at": Date.now(), "is_verify": 1, "otp_resend": 0 } });
        const keys = await Users.findOne({ email }, { email_verified_at: 1, email: 1, username: 1, firstname: 1, lastname: 1, reset_key: 1 });

        keys._doc.is_emailVerified = keys.is_verify ? 1 : 0;
        keys._doc.token = token

        return res.send({ "error": false, 'status': 200, "message": "Otp verification successfull.", "message_desc": "OTP verification successfull.", "data": keys, reset_key: reset_keys })

    } catch (e) {

        return res.send({ "error": true, 'status': 201, "message": "Something went wrong.", "message_desc": "Unhandeled exception found" + e, "data": {} })
    }

}


const loginWithEmail = async (req, res) => {
    try {
        let { email = '', password = '', device_type = '' } = req.body;

        if (email.trim() === '' || !validator.validate(email)) {
            return res.send({
                error: true,
                status: 201,
                message: "Email field is required and must be valid email.",
                message_desc: "Email field is required and must be valid email."
            });
        }

        if (password === '' || password.length < 4) {
            return res.send({
                error: true,
                status: 201,
                message: "Password is required and must be four character.",
                message_desc: "Password is required and must be four character."
            });
        }

        email = email.toLowerCase();
        const isExist = await Users.findOne({ email });

        if (!isExist) {
            return res.send({
                error: true,
                status: 201,
                message: "Email not registered with us.",
                message_desc: "Email not registered with us."
            });
        }

        // Email verification
        if (isExist.is_verify == 0) {

            var min = 1000;
            var max = 9999;
            var newOtp = Math.floor(Math.random() * (max - min + 1)) + min;

            // Update OTP in DB
            await Users.updateOne({ email }, { $set: { otp: newOtp, otp_generated_at: Date.now() } });



            await mailer.sendMail({
                from: '"comics" <Comicsapp@gmail.com>',
                to: email,
                subject: "comics account verification link",
                text: "Verification link",
                html: `Hi! ${isExist.firstname},<br><br>Your Email verification OTP is: ${newOtp}<br><br>Any issues please email Comicsapp@gmail.com.<br><br>Reminder Team`
            });

            return res.send({
                error: true,
                status: 200,
                message: "Please verify your account (A verification link sent to your email).",
                message_desc: "Please verify your account (A verification link sent to your email).",
                data: {
                    _id: isExist._id,
                    firstname: isExist.firstname,
                    lastname: isExist.lastname,
                    username: isExist.username,
                    email: isExist.email,
                    token: isExist.token || "",
                    is_emailVerified: 0
                }
            });
        }

        const isPasswordMatched = bcrypt.compareSync(password, isExist.password);
        if (!isPasswordMatched) {
            return res.send({
                error: true,
                status: 201,
                message: "Check email or password.",
                message_desc: "Check email or password."
            });
        }

        await Users.updateOne({ email }, {
            $set: {
                device_type,
            }
        });

        const login_data = await Users.findOne({ email }, {
            password: 0,
            otp: 0,
            login_location: 0
        });

        // Generate token
        const token = jwt.sign({ login_data }, process.env.JWTKEY, {
            algorithm: "HS256",
            expiresIn: '180d',
        });

        login_data._doc.is_emailVerified = login_data.email_verified_at ? 1 : 0;
        login_data._doc.token = token;


        return res.send({
            error: false,
            status: 200,
            message: "Login Successfull.",
            message_desc: "Login Successfull.",
            data: login_data
        });

    } catch (e) {
        return res.send({
            error: true,
            status: 201,
            message: "Something went wrong.",
            message_desc: "Unhandled exception found: " + e
        });
    }
};



const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: true, message: "Email is required" });
        }

        const user = await Users.findOne({ email });
        if (!user) {
            return res.status(404).json({ error: true, message: "Email not found" });
        }

        // generate 4 digit OTP
        const otp = Math.floor(1000 + Math.random() * 9000);

        user.otp = otp;
        user.otp_expiry = Date.now() + 10 * 60 * 1000; // 10 min validity
        await user.save();

        await mailer.sendMail({
            from: '"Comics App" <comicsapp@gmail.com>',
            to: email,
            subject: "Password Reset OTP",
            html: `Hello ${user.firstname}, <br/>Your OTP is <b>${otp}</b>. Valid for 10 minutes.`,
        });

        return res.json({ error: false, message: "OTP sent to email" });
    } catch (err) {
        return res.status(500).json({ error: true, message: err.message });
    }
};


const resendOtp = async (req, res) => {

    const { email = '' } = req.body

    try {


        if (email == '') {

            return res.send({ "error": true, 'status': 201, "message": "Email field is required.", "message_desc": "Please provide registered email" })

        }

        const data = await Users.findOne({ email })

        if (!data) {

            return res.send({ "error": true, 'status': 201, "message": "Email not exist.", "message_desc": "email you provided is not exist" })
        }

        if (data.otp === 0) {

            return res.send({ "error": true, 'status': 201, "message": "We are unable to send otp.", "message_desc": "Look like you haven't generated any otp" })
        }

        if (data.otp_resend > 6) {

            await Users.updateOne({ email }, { $set: { resend_blocked_at: Date.now() } })

            return res.send({ "error": true, 'status': 201, "message": "Look like you are not able to recieve OTP please try after sometime.", "message_desc": "Please try after sometime" })
        }




        await mailer.sendMail({
            from: '"comics" <Comicsapp@gmail.com>', // sender address
            to: email, // list of receivers
            subject: "comics Reset Password OTP", // Subject line
            text: "Reset Password OTP", // plain text body
            html: "Hello " + data.first_name + ",<br><br>To reset your password please enter the below verification code into comics app when prompted:" + data.otp + "<br><br> If you have any trouble changing your password please feel free to email us at Comicsapp@gmail.com. <br> <br><br> Best regards, <br><br> Wake wall app team", // html body

        });

        const isIncreased = await Users.updateOne({ email }, { $inc: { otp_resend: 1 } })

        if (isIncreased) {

            const response = await Users.findOne({ email }, { email: 1 })
            return res.send({ "error": false, 'status': 200, "message": "Otp resend successfull..", "message_desc": "Otp resend successfull to your email:" + data.email, "data": response })

        } else {

            return res.send({ "error": true, 'status': 201, "message": "unable to sent otp.", "message_desc": "please try again" })
        }

    } catch (e) {

        return res.send({ "error": true, 'status': 201, "message": " " + e, "message_desc": "Unhandeled exception found" + e })
    }

}


const resetPassword = async (req, res) => {
    try {
        const { reset_key, password } = req.body;
        if (!reset_key || !password) {
            return res.status(400).json({ error: true, message: "Reset key & password required" });
        }

        const user = await Users.findOne({ reset_key });
        if (!user) return res.status(400).json({ error: true, message: "Invalid reset key" });

        const hashed = await bcrypt.hash(password, 12);
        user.password = hashed;
        user.reset_key = null;
        await user.save();

        return res.json({ error: false, message: "Password reset successful" });
    } catch (err) {
        return res.status(500).json({ error: true, message: err.message });
    }
};


const submitPassword = async (req, res) => {


    const { token = '' } = req.body

    if (token == '') {

        return res.send({ "error": true, 'status': 201, "message": "Reset key is required.", "message_desc": "Reset key is required." })

    }


    if (typeof req.body.password == 'undefined' || req.body.password.length < 4) {

        return res.send({ "error": true, 'status': 201, "message": "Password is required and must be four character.", "message_desc": "Password is required and must be four character" })

    }

    const isKeyExist = await Users.findOne({ reset_key: token })

    if (!isKeyExist) {

        return res.send({ "error": true, 'status': 201, "message": "Invalid reset key.", "message_desc": "Invalid reset key." })

    }


    var password = req.body.password.trim();
    var key = token.trim();


    var passwordHash = await bcrypt.hashSync(password, 12)

    const isupdated = await Users.updateOne({ reset_key: key }, { $set: { password: passwordHash, reset_key: '' } });

    if (isupdated) {

        res.redirect('/web/forgotPage?changed=1');
        // return res.send({ "error": false, 'status':200, "message": "Password reset successfull.", "message_desc": "Password reset successfull." })
    } else {

        res.redirect('/web/forgotPage?changed=""');
        //  return res.send({ "error": true, 'status':201, "message": "An error has occured.", "message_desc": "An error has occured." })
    }

}

const test = async (req, res) => {
    try {
        if (!req.files || !req.files.profile_image) {
            return res.status(400).send({
                error: true,
                message: "No file uploaded"
            });
        }

        const image = req.files.profile_image;

        // Validate type
        const allowedMimes = [
            "image/gif",
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/svg+xml",
            "image/webp"
        ];
        if (!allowedMimes.includes(image.mimetype)) {
            return res.status(400).send({
                error: true,
                message: "Invalid image type"
            });
        }

        // Validate size (2MB limit)
        let imageSize = image.size / 1024; // kb
        if (imageSize > 2048) {
            return res.status(400).send({
                error: true,
                message: "Image size cannot be greater than 2 MB"
            });
        }

        // ✅ Upload to S3
        let imageUrl = await upload_files("profile-images", image);

        return res.status(200).send({
            error: false,
            message: "Upload successful",
            url: imageUrl
        });
    } catch (error) {
        console.error("Upload error:", error);
        return res.status(500).send({
            error: true,
            message: "Internal server error",
            details: error.message
        });
    }
};


const privacys = (req, res) => {

    try {
        res.render("privacy", {
            title: "Privacy Policy",
            // logo: "/images/logo.png",
            description: "This is our Privacy Policy page."
        });
    } catch (e) {
        return res.send({ "error": true, "message": "Something went wrong." + e, "message_desc": "Something went wrong." })
    }
}


const updatePic = async (req, res) => {
    try {
        const user = req.user.login_data;
        const userId = user._id;

        if (!req.files || !req.files.profile_pic) {
            return res.send({
                error: true,
                status: 201,
                message: "No image selected",
                message_desc: "No image selected."
            });
        }

        const image = req.files.profile_pic;

        // ✅ Allowed mime types
        const allowedMimes = [
            "image/gif",
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/svg+xml",
            "image/webp"
        ];
        if (!allowedMimes.includes(image.mimetype)) {
            return res.send({
                error: true,
                status: 201,
                message: "Invalid image type.",
                message_desc: "Allowed only gif, jpeg, png, svg, webp."
            });
        }

        // ✅ Size validation (2 MB)
        let imageSize = image.size / 1024;
        if (imageSize > 2048) {
            return res.send({
                error: true,
                status: 201,
                message: "Profile image size cannot be greater than 2 MB.",
                message_desc: "Profile image size cannot be greater than 2 MB."
            });
        }

        // ✅ Get existing image
        const getImage = await Users.findOne({ _id: userId }, { profile_pic: 1 });

        // ✅ Upload new image
        const imageUrl = await upload_files("profile-images", image);

        // ✅ Delete old image from S3 if exists
        if (getImage && getImage.profile_pic) {
            try {
                const oldKey = getImage.profile_pic.split("/").pop(); // safer
                await deleteFiles("profile-images", oldKey);
            } catch (err) {
                console.warn("Old image delete failed:", err.message);
            }
        }

        // ✅ Update DB
        const updated = await Users.updateOne(
            { _id: new mongoose.Types.ObjectId(userId) },
            { profile_pic: imageUrl }
        );

        if (updated.modifiedCount > 0) {
            return res.send({
                error: false,
                status: 200,
                message: "Profile image updated successfully.",
                profile_pic: imageUrl
            });
        } else {
            return res.send({
                error: true,
                status: 201,
                message: "An error has occurred.",
                message_desc: "An error has occurred."
            });
        }
    } catch (e) {
        return res.send({
            error: true,
            message: "Something went wrong: " + e
        });
    }
};

const deletePic = async (req, res) => {
    try {
        const user = req.user.login_data;
        const userId = user._id;

        // Check existing image
        const getUser = await Users.findOne(
            { _id: new mongoose.Types.ObjectId(userId) },
            { profile_pic: 1 }
        );

        if (!getUser || !getUser.profile_pic) {
            return res.send({
                error: true,
                status: 201,
                message: "No profile image found.",
                message_desc: "Profile image not set."
            });
        }

        // Extract key and delete from S3
        const oldKey = getUser.profile_pic.split("/").pop();
        try {
            await deleteFiles("profile-images", oldKey);
        } catch (err) {
            console.warn("S3 delete failed:", err.message);
        }

        // Update DB (set profile_pic = "")
        const updated = await Users.updateOne(
            { _id: new mongoose.Types.ObjectId(userId) },
            { profile_pic: "" }
        );

        if (updated.modifiedCount > 0) {
            return res.send({
                error: false,
                status: 200,
                message: "Profile image deleted successfully.",
                profile_pic: ""
            });
        } else {
            return res.send({
                error: true,
                status: 201,
                message: "An error has occurred.",
                message_desc: "Failed to delete profile image."
            });
        }
    } catch (e) {
        return res.send({
            error: true,
            status: 500,
            message: "Something went wrong: " + e
        });
    }
};



// const profileDetails = async (req, res) => {
//     try {
//         let userId = req.user.login_data._id;

//         // ✅ User profile basic info
//         const userDetails = await Users.aggregate([
//             {
//                 $match: { _id: new mongoose.Types.ObjectId(userId) }
//             },
//             {
//                 $project: {
//                     _id: 1,
//                     email: 1,
//                     username: 1,
//                     email_verified_at: 1,
//                     profile_pic: 1,
//                     created_at: "$createdAt",
//                     updated_at: "$updatedAt"
//                 }
//             }
//         ]);

//         if (!userDetails || userDetails.length === 0) {
//             return res.send({
//                 error: true,
//                 status: 201,
//                 message: "User not found",
//                 message_desc: "No user found with this id",
//                 data: {}
//             });
//         }

//         // Total quizzes taken
//         const totalQuizzesTaken = await QuizSubmission.countDocuments({ userId });

//         // Comics completed (unique comicId from quizzes attempted)
//         const comicsCompleted = await QuizSubmission.aggregate([
//             { $match: { userId: new mongoose.Types.ObjectId(userId) } },
//             {
//                 $lookup: {
//                     from: "quizzes", // collection name of Quiz
//                     localField: "quizId",
//                     foreignField: "_id",
//                     as: "quizData"
//                 }
//             },
//             { $unwind: "$quizData" },
//             {
//                 $group: {
//                     _id: "$quizData.comicId"
//                 }
//             }
//         ]);

//         const numberOfComicsCompleted = comicsCompleted.length;


//         const submissions = await QuizSubmission.find({ userId });
//         let correctAnswers = 0;
//         submissions.forEach(sub => {
//             sub.answers.forEach(ans => {
//                 if (ans.isCorrect) correctAnswers++;
//             });
//         });
//         const totalCoinsEarned = correctAnswers;




//         const profile = {
//             ...userDetails[0],
//             number_of_comics_completed: numberOfComicsCompleted,
//             total_quizzes_taken: totalQuizzesTaken,
//             total_coins_earned: totalCoinsEarned,
//             total_gems_earned: 0
//         };

//         return res.send({
//             error: false,
//             status: 200,
//             message: "Success.",
//             message_desc: "Success",
//             data: profile
//         });
//     } catch (e) {
//         return res.send({
//             error: true,
//             status: 500,
//             message: "Something went wrong.",
//             message_desc: "Unhandled exception: " + e,
//             data: {}
//         });
//     }
// };


const profileDetails = async (req, res) => {
    try {
        let userId = req.user.login_data._id;

        // ✅ User profile basic info
        const userDetails = await Users.aggregate([
            {
                $match: { _id: new mongoose.Types.ObjectId(userId) }
            },
            {
                $project: {
                    _id: 1,
                    email: 1,
                    username: 1,
                    email_verified_at: 1,
                    profile_pic: 1,
                    created_at: "$createdAt",
                    updated_at: "$updatedAt"
                }
            }
        ]);

        if (!userDetails || userDetails.length === 0) {
            return res.send({
                error: true,
                status: 201,
                message: "User not found",
                message_desc: "No user found with this id",
                data: {}
            });
        }

        // ✅ Total unique quizzes attempted (not counting repeats)
        const quizzesTaken = await QuizSubmission.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            { $group: { _id: "$quizId" } }
        ]);
        const totalQuizzesTaken = quizzesTaken.length;

        // ✅ Comics completed (unique comicId from attempted quizzes)
        const comicsCompleted = await QuizSubmission.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(userId) } },
            {
                $lookup: {
                    from: "quizzes", // Quiz collection name
                    localField: "quizId",
                    foreignField: "_id",
                    as: "quizData"
                }
            },
            { $unwind: "$quizData" },
            {
                $group: {
                    _id: "$quizData.comicId"
                }
            }
        ]);
        const numberOfComicsCompleted = comicsCompleted.length;

        // ✅ Total coins earned = total correct answers
        const submissions = await QuizSubmission.find({ userId });
        let correctAnswers = 0;
        submissions.forEach(sub => {
            sub.answers.forEach(ans => {
                if (ans.isCorrect) correctAnswers++;
            });
        });
        const totalCoinsEarned = correctAnswers;

        // ✅ Final profile response
        const profile = {
            ...userDetails[0],
            number_of_comics_completed: numberOfComicsCompleted,
            total_quizzes_taken: totalQuizzesTaken,
            total_coins_earned: totalCoinsEarned,
            total_gems_earned: 0 // agar future me logic aayega to update karna
        };

        return res.send({
            error: false,
            status: 200,
            message: "Success.",
            message_desc: "Success",
            data: profile
        });
    } catch (e) {
        console.error("Profile Details Error:", e);
        return res.send({
            error: true,
            status: 500,
            message: "Something went wrong.",
            message_desc: "Unhandled exception: " + e,
            data: {}
        });
    }
};



const deleteAccount =  async (req, res) => {
    try {
        const userId = req.user.login_data._id;

    
        const user = await Users.findOne(
            { _id: new mongoose.Types.ObjectId(userId) },
            { profile_pic: 1 }
        );

        if (!user) {
            return res.send({
                error: true,
                status: 404,
                message: "User not found.",
                message_desc: "No account exists with this ID."
            });
        }

      
        if (user.profile_pic) {
            try {
                const oldKey = user.profile_pic.split("/").pop();
                await deleteFiles("profile-images", oldKey);
            } catch (err) {
                console.warn("S3 delete failed:", err.message);
            }
        }

   
        await Users.deleteOne({ _id: new mongoose.Types.ObjectId(userId) });

        return res.send({
            error: false,
            status: 200,
            message: "Account deleted successfully.",
            message_desc: "User account has been permanently deleted."
        });
    } catch (e) {
        return res.send({
            error: true,
            status: 500,
            message: "Something went wrong.",
            message_desc: "Unhandled exception: " + e
        });
    }
};






module.exports = {
    signupWithEmail, loginWithEmail, verify_otp, forgotPassword, resendOtp, resetPassword, submitPassword, test, privacys,
    updatePic, profileDetails, deletePic, deleteAccount
}