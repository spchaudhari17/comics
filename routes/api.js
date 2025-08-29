const express = require('express');
const router = express.Router();
const { refinePrompt, generateComicImage, generateComicPDF, listComics, getComic, updateComicStatus, deleteComic } = require('../app/controller/api/comicController');
const { signup, login, verify_otp, forgotPassword, resendOtp, resetPassword, submitPassword, test } = require('../app/controller/api/userController');
const { authentication } = require('../app/middileware/authentication');
const { listAllComicsAdmin, approveComicStatusAdmin } = require('../app/controller/api/admin/adminComicController');
const { generateQuiz, getQuizByComic, publishQuiz } = require('../app/controller/api/quizController');


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
router.post("/user/generateComicPDF", generateComicPDF)
router.post("/user/comics/set-status", authentication, updateComicStatus);

router.get("/user/comics", listComics);
router.get("/user/comics/:id", getComic);
router.post("/user/deleteComic",authentication, deleteComic);


//******************************** admin routes routes started from here ***************************** */

router.get("/admin/comics", authentication, listAllComicsAdmin);
router.post("/admin/comics/status", authentication, approveComicStatusAdmin);

//******************************** admin routes routes started from here ***************************** */

router.post("/user/generate-quiz", authentication, generateQuiz);
router.get("/user/comic/:id/quiz", getQuizByComic);
router.post("/user/quiz/publish", authentication, publishQuiz);

module.exports = router;
