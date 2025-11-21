const express = require('express');
const router = express.Router();
const multer = require('multer');

const { refinePrompt, generateComicImage, generateComicPDF, listComics, getComic, updateComicStatus, deleteComic, listUserComics, updateCountryForSeries, listComicsforPublic, } = require('../app/controller/api/comicController');
const { verify_otp, forgotPassword, resendOtp, resetPassword, submitPassword, test, privacys, signupWithEmail, loginWithEmail, updatePic, profileDetails, deletePic, deleteAccount, addCoins, addGems } = require('../app/controller/api/userController');
const { authentication } = require('../app/middileware/authentication');
const { listAllComicsAdmin, approveComicStatusAdmin, getAdminComicDetails } = require('../app/controller/api/admin/adminComicController');
const { generateQuiz, getQuizByComic, publishQuiz } = require('../app/controller/api/quizController');
const { submitQuiz } = require('../app/controller/api/submitQuizController');
const { getAllUsers } = require('../app/controller/api/admin/userController');
const { generateFAQs, listFAQs } = require('../app/controller/api/faqController');
const { generateDidYouKnow, listDidYouKnow } = require('../app/controller/api/didyouknowController');
const { createStyle, createTheme, getAllStyles, getAllThemes, updateStyle } = require('../app/controller/api/themeStyleController');
const { createSubject, deleteSubject, getAllSubjects, getConceptsBySubject, getComicsByConcept, saveSubjectPriority, updateSubject, getAllSubjectsForWeb } = require('../app/controller/api/subjectController');
const { signupWithUsername, loginWithUsername, bulkRegister, getMyClasses, getStudentsByClass, downloadClassStudents, getStudentsList, resetStudentPassword, deleteStudent, deleteAllStudents } = require('../app/controller/api/appAuthController');
const { createContact, getAllContacts, deleteContact } = require('../app/controller/api/contactController');
const { generateHardcoreQuiz, getHardcoreQuizByComic, submitHardcoreQuiz, buyPowerCard, getPowerCards, usePowerCard, buyGems, unlockHardcoreQuestion, getUnlockedQuestions, buyHardcoreQuestion, getBoughtQuestions, getAllBoughtQuestions, finishHardcoreQuiz } = require('../app/controller/api/hardcoreQuizController');
const { getAllCountries } = require('../app/controller/api/countryController');


//******************************** routes started from here ***************************** */
// Website routes (email based)
router.post('/user/register', signupWithEmail)
router.post('/user/login', loginWithEmail)

// App routes (username based)
router.post('/app/register', signupWithUsername)
router.post('/app/login', loginWithUsername)




router.post('/user/bulk-register', authentication, bulkRegister);
router.get('/user/get-students', authentication, getStudentsList);
router.post('/user/reset-student-password', authentication, resetStudentPassword);
router.post('/user/delete-student', authentication, deleteStudent);
router.post('/user/delete-all-students', authentication, deleteAllStudents);


router.post('/user/forgotPassword', forgotPassword)
router.post('/user/resetPassword', resetPassword)
router.post('/user/resendOtp', resendOtp)
router.post('/user/verify_otp', verify_otp)
router.post('/user/submitPassword', submitPassword)
router.post('/user/test', test)
//******************************** Authentication started from here ***************************** */
router.post('/user/updatePic', authentication, updatePic)
router.post('/user/deletePic', authentication, deletePic)
router.get('/user/getProfile', authentication, profileDetails)
router.post('/user/deleteAccount', authentication, deleteAccount)


//******************************** Prompt routes started from here ***************************** */
router.post("/user/create-themes", createTheme);
router.post("/user/create-styles", createStyle);
router.post("/user/update-style", updateStyle);
router.get("/user/getAllThemes", getAllThemes);
router.get("/user/getAllStyles", getAllStyles);

//******************************** Subject routes started from here ***************************** */
router.post("/user/create-subject", createSubject);
router.post("/user/delete-subject", deleteSubject);
router.get("/user/getallSubject", getAllSubjects);
router.get("/user/getAllSubjectsForWeb", getAllSubjectsForWeb);
router.post("/user/update-subject", updateSubject);
router.post("/user/subject-priority", saveSubjectPriority);

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
router.get("/user/listComicsforPublic", listComicsforPublic);
router.post("/user/deleteComic", authentication, deleteComic);
router.post("/user/submit-quiz", authentication, submitQuiz);

router.get("/user/concepts-by-subject/:subjectId", getConceptsBySubject);
router.get("/user/concepts/:conceptId/comics", getComicsByConcept);
router.patch("/user/add-coins", authentication, addCoins);
router.patch("/user/add-gems", authentication, addGems);



//******************************** admin routes routes started from here ***************************** */

router.get("/admin/comics", authentication, listAllComicsAdmin);
router.post("/admin/comics/status", authentication, approveComicStatusAdmin);
router.get("/admin/getAllUsers", getAllUsers);
router.get("/admin/comics/:id", getAdminComicDetails);
router.put("/admin/update-country", updateCountryForSeries);

//******************************** quiz routes routes started from here ***************************** */

router.post("/user/generate-quiz", authentication, generateQuiz);
router.get("/user/comic/:id/quiz/:userId", getQuizByComic);
router.get("/user/comic/:id/quiz/", getQuizByComic);
router.post("/user/quiz/publish", authentication, publishQuiz);
//******************************** Hard core quiz routes routes started from here ***************************** */

router.post("/user/generate-hardcore-quiz", authentication, generateHardcoreQuiz);
//  Get Hardcore Quiz for a Comic (with userId - optional)
router.get("/user/comic/:id/hardcore-quiz/:userId", getHardcoreQuizByComic);
// Get Hardcore Quiz for a Comic (without userId)
router.get("/user/comic/:id/hardcore-quiz", getHardcoreQuizByComic);
router.post("/user/submit-hardcore-quiz", authentication, submitHardcoreQuiz);
router.post("/user/finish-hardcore-quiz", authentication, finishHardcoreQuiz);


router.post("/user/buyPowerCard", authentication, buyPowerCard);
router.get("/user/getPowerCards", authentication, getPowerCards);
router.post("/user/usePowerCard", authentication, usePowerCard);
router.post("/user/buy-gems", authentication, buyGems);

router.post("/user/hardcore/buy-question", authentication, buyHardcoreQuestion);
router.get("/user/hardcore/buy-questions/:quizId", authentication, getBoughtQuestions);
router.get("/user/hardcore/all-bought-questions", authentication, getAllBoughtQuestions);



//******************************** quiz routes routes started from here ***************************** */
router.get("/user/privacy", privacys);
router.get("/user/countries", getAllCountries);

router.post("/user/contact", createContact);
router.get("/user/contacts", getAllContacts);
router.delete("/user/contact/:id", deleteContact);


router.get("/users", async (req, res) => {
    res.send("just for test today 30-10-2025")
});





module.exports = router;
