const express = require('express');
const router = express.Router();
const { refinePrompt, generateComicImage, generateComicPDF, listComics, getComic, deleteComic } = require('../app/controller/api/comicController');
const { signup, login, verify_otp, forgotPassword, resendOtp, resetPassword, submitPassword, test } = require('../app/controller/api/userController');
const { authentication } = require('../app/middileware/authentication');


//******************************** Authentication started from here ***************************** */
router.post('/user/register', signup)
router.post('/user/forgotPassword', forgotPassword)
router.post('/user/resetPassword', resetPassword)
router.post('/user/resendOtp', resendOtp)
router.post('/user/verify_otp', verify_otp)
router.post('/user/login', login)
router.post('/user/submitPassword', submitPassword)
router.post('/user/test', test)

//******************************** Prompt routes started from here ***************************** */
router.post("/user/refine-prompt", authentication, refinePrompt)
router.post("/user/generate-comic", authentication, generateComicImage)
router.post("/user/generateComicPDF", authentication, generateComicPDF)

router.get("/user/comics", listComics);
router.get("/user/comics/:id", getComic);
router.delete("/user/comics/:id", authentication, deleteComic);







module.exports = router;
