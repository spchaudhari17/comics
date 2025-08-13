const express = require('express');
const { refinePrompt, generateComicImage } = require('../app/controller/api/comicController');
const { signup, login, verify_otp, forgotPassword, resendOtp, resetPassword, submitPassword } = require('../app/controller/api/userController');
const router = express.Router();


//******************************** Authentication started from here ***************************** */
router.post('/user/register', signup)
router.post('/user/forgotPassword', forgotPassword)
router.post('/user/resetPassword', resetPassword)
router.post('/user/resendOtp', resendOtp)
router.post('/user/verify_otp', verify_otp)
router.post('/user/login', login)
router.post('/user/submitPassword', submitPassword)

//******************************** Prompt routes started from here ***************************** */
router.post("/user/refine-prompt", refinePrompt)
router.post("/user/generate-comic", generateComicImage)
// router.post("/user/generate-comic", generateComicImage)




module.exports = router;
