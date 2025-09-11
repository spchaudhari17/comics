const express = require('express');
const router = express.Router();
const { refinePrompt, generateComicImage, generateComicPDF, listComics, getComic, updateComicStatus, deleteComic, listUserComics } = require('../app/controller/api/comicController');
const { verify_otp, forgotPassword, resendOtp, resetPassword, submitPassword, test, privacys, signupWithEmail, loginWithEmail } = require('../app/controller/api/userController');
const { authentication } = require('../app/middileware/authentication');
const { listAllComicsAdmin, approveComicStatusAdmin } = require('../app/controller/api/admin/adminComicController');
const { generateQuiz, getQuizByComic, publishQuiz } = require('../app/controller/api/quizController');
const { submitQuiz } = require('../app/controller/api/submitQuizController');
const { getAllUsers } = require('../app/controller/api/admin/userController');
const { generateFAQs, listFAQs } = require('../app/controller/api/faqController');
const { generateDidYouKnow, listDidYouKnow } = require('../app/controller/api/didyouknowController');
const { createStyle, createTheme } = require('../app/controller/api/themeStyleController');
const { createSubject, deleteSubject, getAllSubjects } = require('../app/controller/api/subjectController');
const { signupWithUsername, loginWithUsername } = require('../app/controller/api/appAuthController');


//******************************** Authentication started from here ***************************** */
// Website routes (email based)
router.post('/user/register', signupWithEmail)
router.post('/user/login', loginWithEmail)

// App routes (username based)
router.post('/app/register', signupWithUsername)
router.post('/app/login', loginWithUsername)

router.post('/user/forgotPassword', forgotPassword)
router.post('/user/resetPassword', resetPassword)
router.post('/user/resendOtp', resendOtp)
router.post('/user/verify_otp', verify_otp)
router.post('/user/submitPassword', submitPassword)
router.post('/user/test', test)

//******************************** Prompt routes started from here ***************************** */
router.post("/user/create-themes", createTheme);
router.post("/user/create-styles", createStyle);
router.post("/user/create-subject", createSubject);
router.post("/user/delete-subject", deleteSubject);
router.get("/user/getallSubject", getAllSubjects);

//******************************** Prompt routes started from here ***************************** */
router.post("/user/refine-prompt", authentication, refinePrompt)
router.post("/user/generate-comic", authentication, generateComicImage)
router.post("/user/generateComicPDF", generateComicPDF)
router.post("/user/comics/set-status", authentication, updateComicStatus);
router.get("/user/my-comics", authentication, listUserComics);

router.post("/user/generate-faqs", generateFAQs);
router.post("/user/generate-didyouknow", generateDidYouKnow);
router.get("/user/comic-faqs/:comicId", listFAQs);
router.get("/user/comic-didyouknow/:comicId", listDidYouKnow);


// router.post("/user/thumbnail", generateComicThumbnail);

router.get("/user/comics", listComics);
router.get("/user/comics/:id", getComic);
router.post("/user/deleteComic",authentication, deleteComic);
router.post("/user/submit-quiz", authentication, submitQuiz);



//******************************** admin routes routes started from here ***************************** */

router.get("/admin/comics", authentication, listAllComicsAdmin);
router.post("/admin/comics/status", authentication, approveComicStatusAdmin);
router.get("/admin/users", getAllUsers);

//******************************** quiz routes routes started from here ***************************** */

router.post("/user/generate-quiz", authentication, generateQuiz);
router.get("/user/comic/:id/quiz", getQuizByComic);
router.post("/user/quiz/publish", authentication, publishQuiz);


//******************************** quiz routes routes started from here ***************************** */
router.get("/user/privacy", privacys);

module.exports = router;
