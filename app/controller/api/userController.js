const Users = require("../../models/User");
let validator = require("email-validator");
const jwt = require("jsonwebtoken")
var bcrypt = require('bcryptjs');
var crypto = require("crypto");
let mailer = require("../../../config/mailer");
const MOMENT = require('moment');
const { upload_files } = require("../../../helper/helper");


const BASE_URL = process.env.BASE_URL;


const signup = async (req, res) => {

    let { firstname = '', lastname = '', password = '', username = '', email = '', countryCode = '+1',
        mobileNumber = '',  device_udid='', device_type='' } = req.body


    // if (firstname === '') {

    //     return res.send({ "error": true, 'status': 201, "message": "Firstname name is required.", "message_desc": "Full name is required." })

    // }
    // else if (lastname === '') {

    //     return res.send({ "error": true, 'status': 201, "message": "Lastname is required.", "message_desc": "Username is required" })

    // }
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
        const isUsernameExist = await Users.findOne({ username });

        if (isUsernameExist) {

            return res.send({ "error": true, 'status': 201, "message": "Username already taken.", "message_desc": "Username already taken." });

        }

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

        return res.send({ "error": false, 'status': 200, "message": "Otp verification successfull.", "message_desc": "OTP verification successfull.", "data": keys })

    } catch (e) {

        return res.send({ "error": true, 'status': 201, "message": "Something went wrong.", "message_desc": "Unhandeled exception found" + e, "data": {} })
    }

}


const login = async (req, res) => {
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

    var { email = '' } = req.body

    if (email == '' || !validator.validate(req.body.email)) {

        return res.send({ "error": true, 'status': 201, "message": "Email field is required and must be valid email.", "message_desc": "Email field is required and must be valid email." })

    }

    var email = email.toLowerCase()

    var min = 1000;
    var max = 9999;
    var otp = Math.floor(Math.random() * (max - min + 1)) + min;

    const data = await Users.findOne({ email })

    if (!data) {
        return res.send({ "error": true, 'status': 201, "message": "Email not registered with us.", "message_desc": "Email not registered with us." })
    }

    if (data && data.length < 1) {
        return res.send({ "error": true, 'status': 201, "message": "Email not registered with us.", "message_desc": "Email not registered with us." })
    }

    if (data && data.is_verify == 0) {

        return res.send({ "error": true, 'status': 201, "message": "Account must be verified.", "message_desc": "Account must be verified" })
    }

    const characters = crypto.randomBytes(25).toString('hex');



    let token = characters;

    await mailer.sendMail({
        from: '"comics" <Comicsapp@gmail.com>', 
        to: email, // list of receivers
        subject: "comics Reset Password OTP", 
        text: "Reset Password OTP", 
        html: "<b>Hi </b> </br></br>" + data.firstname + " Please click on below link to reset your password <a target='_blank' style='color:blue' href='" + BASE_URL + "/web/forgotPage?token=" + token + "'>Click Here</a></br></br></br>  <span>Best Regard</span></br>  <span>comics</span>", // html body

    });



    const isupdated = await Users.updateOne({ email }, { $set: { otp: otp, otp_generated_at: Date.now(), otp_resend: 1, reset_key: token } });

    return res.send({ "error": false, 'status': 200, "message": "A reset link has been sent on your email.", "message_desc": "A reset link has been sent on your email." })

}


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

    const { rKey = '' } = req.body

    if (rKey == '') {

        return res.send({ "error": true, 'status': 201, "message": "Reset key is required.", "message_desc": "Reset key is required." })

    }


    if (typeof req.body.password == 'undefined' || req.body.password.length < 4) {

        return res.send({ "error": true, 'status': 201, "message": "Password is required and must be four character.", "message_desc": "Password is required and must be four character" })

    }

    const isKeyExist = await Users.findOne({ reset_key: rKey })

    if (isKeyExist) {

        return res.send({ "error": true, 'status': 201, "message": "Invalid reset key.", "message_desc": "Invalid reset key." })

    }

    var email = req.body.email.trim().toLowerCase();

    var password = req.body.password.trim();
    var key = req.body.rKey.trim();

    if (data.reset_key != key) {

        return res.send({ "error": true, 'status': 201, "message": "Invalid request key.", "message_desc": "Invalid request key." })
    }


    var passwordHash = await bcrypt.hashSync(password, 12)

    const isupdated = await Users.updateMany({ reset_key: rKey }, { $set: { password: passwordHash, reset_key: '' } });

    if (isupdated) {
        return res.send({ "error": false, 'status': 200, "message": "Password reset successfull.", "message_desc": "Password reset successfull.", "data": data })
    } else {
        return res.send({ "error": true, 'status': 201, "message": "An error has occured.", "message_desc": "An error has occured." })
    }
}


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


module.exports = { signup, login, verify_otp, forgotPassword, resendOtp, resetPassword, submitPassword, test }