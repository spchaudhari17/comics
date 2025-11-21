const OpenAI = require("openai");
const HardcoreQuiz = require("../../models/HardcoreQuiz");
const HardcoreQuizQuestion = require("../../models/HardcoreQuizQuestion");
const Comic = require("../../models/Comic");
const HardcoreQuizSubmission = require("../../models/HardcoreQuizSubmission");
const { default: mongoose } = require("mongoose");
const User = require("../../models/User");
const Subject = require("../../models/Subject");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


const generateHardcoreQuiz = async (req, res) => {
  const { comicId, script, subject, concept, grade } = req.body;

  try {
    // 🧠 Step 1: Check if quiz already exists
    const existingQuiz = await HardcoreQuiz.findOne({ comicId })
      .populate({
        path: "questions",
        select: "question options correctAnswer difficulty explanation hint",
      })
      .lean();

    if (existingQuiz) {
      return res.status(200).json({
        message: "Adaptive quiz already exists for this comic.",
        quizId: existingQuiz._id,
        quiz: existingQuiz,
        alreadyExists: true,
      });
    }

    // 🧩 Step 2: Extract minimal reference context from script (no story use)
    // Just use a short trimmed version to give GPT background if needed
    let storyContext = "";
    if (Array.isArray(script)) {
      storyContext = script
        .map((page) =>
          page.panels
            .map((p) => `${p.caption || ""}`)
            .join(" ")
        )
        .join(" ");
    } else {
      storyContext = script || "";
    }

    const prompt = `
You are an expert educational content creator.

Your job is to create **Hardcore Quiz questions** that stay perfectly aligned with:

1. The Subject → "${subject}"
2. The Concept → "${concept}"
3. The Grade Level → "${grade}"
4. The Learning Boundaries defined by the comic summary

---

### 📘 COMIC SUMMARY (Use ONLY this as knowledge boundary)
This summary reflects what students learned:
${storyContext.slice(0, 900)}

Use this to determine:
- what depth the concept was covered in the comic
- what examples or logic were introduced
- what subtopics the student already understands

DO NOT introduce anything outside this comic coverage.

---

### 🎯 REQUIRED: TWO STRICT RULES  
1️⃣ **Concept-Based**  
- Every question must test reasoning about the SAME concept  
- Do not include any unrelated topics or advanced external theories  
- Do not exceed the grade-level depth

2️⃣ **Comic-Aligned**  
- Use the same conceptual flow the comic uses  
- Only use knowledge the comic teaches (implicit or explicit)  
- Don't use the story or characters  
- Use scenes, examples, or situations *only as educational context*

---

### 🧠 GRADE-SPECIFIC INSTRUCTIONS  
Make difficulty match the grade:

- Grades 1–5 → concrete, simple logic, visual understanding  
- Grades 6–8 → conceptual reasoning, why/how questions  
- Grades 9–12 → application-based, multi-step reasoning  
- UG/PG → deep analytical understanding (but ONLY within comic scope)

DO NOT exceed the level appropriate for "${grade}".

---

### 🔥 Difficulty Pattern (Strict Order)
1. easy  
2. medium  
3. hard  
4. extreme  
5. easy  
6. medium  
7. hard  
8. extreme  

Even the "extreme" questions must stay within the comic's covered depth.

---

### 📝 QUESTION REQUIREMENTS
Each question must have:
- 6–7 options  
- exactly 1 correct answer  
- difficulty label ("easy", "medium", "hard", "extreme")  
- explanation (must match the comic’s teaching logic)  
- hint (must help, not reveal answer)

---

### ❌ Forbidden
- NO questions about characters or story plot  
- NO fictional details  
- NO topics beyond the comic’s subject/concept  
- NO college-level theory if comic didn't cover it  
- NO new formulas, new definitions, or outside-syllabus knowledge  

### ✔ Allowed
- Use conceptual examples implied by the panels  
- Use logic/scenarios that match the comic’s explanation style  
- Make harder questions by increasing reasoning, not new topics

---

### 📤 Final Output  
Return ONLY a valid JSON array with EXACTLY 8 items.

Format:
[
  {
    "question": "",
    "options": ["","","","","",""],
    "correctAnswer": "",
    "difficulty": "",
    "explanation": "",
    "hint": ""
  }
]
`;




    // 🧩 Step 4: Generate quiz via OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Return only strict valid JSON, no markdown." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    let raw = response.choices[0].message.content.trim();
    if (raw.startsWith("```")) raw = raw.replace(/```json|```/g, "").trim();

    let questions;
    try {
      questions = JSON.parse(raw);
      if (!Array.isArray(questions)) throw new Error("Invalid JSON array");
    } catch (err) {
      return res.status(500).json({
        error: "Invalid JSON from OpenAI",
        details: err.message,
        raw,
      });
    }

    // 🧩 Step 5: Create new quiz
    const quiz = await HardcoreQuiz.create({
      comicId,
      user_id: req.user.login_data._id,
      status: "draft",
      mode: "adaptive", // adaptive quiz
    });

    await Comic.findByIdAndUpdate(comicId, { hasHardcoreQuiz: true });

    // 🧩 Step 6: Save questions in DB
    const savedQuestions = [];
    for (const q of questions) {
      const newQ = await HardcoreQuizQuestion.create({
        quizId: quiz._id,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        difficulty: q.difficulty,
        explanation: q.explanation,
        hint: q.hint,
      });
      savedQuestions.push(newQ._id);
    }

    quiz.questions = savedQuestions;
    await quiz.save();

    // 🧩 Step 7: Response
    res.json({
      message: "Concept-based adaptive quiz successfully created (easy → extreme).",
      quizId: quiz._id,
      questions,
      alreadyExists: false,
    });
  } catch (error) {
    console.error("Adaptive Quiz Generation Error:", error);
    res.status(500).json({
      error: "Failed to generate adaptive quiz",
      details: error.message,
    });
  }
};



// const getHardcoreQuizByComic = async (req, res) => {
//   try {
//     const { id } = req.params; // comicId
//     const userId = req.query.userId || req.params.userId;

//     const quiz = await HardcoreQuiz.findOne({ comicId: id })
//       .read("primary")
//       .populate({ path: "questions", options: { lean: true } })
//       .lean();

//     if (!quiz) return res.status(404).json({ error: "Hardcore Quiz not found" });

//     let hasAttempted = false;
//     let hasAttemptedAllQuestion = false;
//     let hasHardCoreChanceLeft = 2;
//     let activeSubmission = null;
//     let attemptedAnswers = {};
//     let attemptNumber = 1;

//     if (userId) {
//       const userObjectId = new mongoose.Types.ObjectId(userId);

//       const todayStart = new Date();
//       todayStart.setHours(0, 0, 0, 0);

//       const todayEnd = new Date();
//       todayEnd.setHours(23, 59, 59, 999);

//       const submissions = await HardcoreQuizSubmission.find({
//         quizId: quiz._id,
//         userId: userObjectId,
//       })
//         .sort({ createdAt: -1 })
//         .lean();

//       if (submissions.length > 0) hasAttempted = true;

//       activeSubmission = submissions.find((s) => s.isActive) || null;

//       const finishedAttemptsToday = submissions.filter((s) =>
//         s.isFinished &&
//         s.createdAt >= todayStart &&
//         s.createdAt <= todayEnd
//       ).length;

//       // ------------- FIX: Award 0 chances if user already completed all questions correctly ------------------
//       const latestFinished = submissions.find((s) => s.isFinished);

//       if (
//         latestFinished &&
//         latestFinished.answers.length === quiz.questions.length &&
//         latestFinished.answers.every((a) => a.isCorrect)
//       ) {
//         hasAttemptedAllQuestion = true;
//         hasHardCoreChanceLeft = 0;  // IMPORTANT FIX
//       } else {
//         // Otherwise follow daily 2 attempts rule
//         hasHardCoreChanceLeft = Math.max(0, 2 - finishedAttemptsToday);
//       }

//       // Determine attempt number
//       if (activeSubmission) {
//         attemptNumber = activeSubmission.attemptNumber;
//       } else if (hasAttemptedAllQuestion) {
//         attemptNumber = latestFinished.attemptNumber; // locked
//       } else if (finishedAttemptsToday > 0 && finishedAttemptsToday < 2) {
//         attemptNumber = finishedAttemptsToday + 1;
//       } else if (finishedAttemptsToday >= 2) {
//         attemptNumber = 2;
//       } else {
//         attemptNumber = 1;
//       }

//       // Merge attempted answers for UI
//       for (const sub of submissions) {
//         for (const ans of sub.answers || []) {
//           attemptedAnswers[ans.questionId.toString()] = {
//             selectedAnswer: ans.selectedAnswer,
//             isCorrect: ans.isCorrect,
//             coins: ans.coins,
//             exp: ans.exp,
//           };
//         }
//       }
//     }

//     const questionsWithAttemptStatus = quiz.questions.map((q) => {
//       const attempt = attemptedAnswers[q._id.toString()];
//       return {
//         ...q,
//         locked: false,
//         hasAttempted: !!attempt,
//         selectedAnswer: attempt ? attempt.selectedAnswer : null,
//         isCorrect: attempt ? attempt.isCorrect : null,
//         coins: attempt ? attempt.coins : 0,
//         exp: attempt ? attempt.exp : 0,
//       };
//     });

//     const comic = await Comic.findById(id);
//     let showAdsHardcoreQuiz = true;

//     if (comic?.subjectId) {
//       const subject = await Subject.findById(comic.subjectId);
//       showAdsHardcoreQuiz = subject ? subject.showAdsHardcoreQuiz : true;
//     }

//     const quizWithAds = {
//       ...quiz,
//       questions: questionsWithAttemptStatus,
//       showAdsHardcoreQuiz,
//       showInterestialAds: showAdsHardcoreQuiz,
//     };

//     return res.json({
//       quiz: quizWithAds,
//       hasAttempted,
//       hasAttemptedAllQuestion,
//       hasHardCoreChanceLeft,
//       attemptNumber,
//       activeSubmission: activeSubmission
//         ? {
//           _id: activeSubmission._id,
//           attemptNumber: activeSubmission.attemptNumber,
//           score: activeSubmission.score,
//           coinsEarned: activeSubmission.coinsEarned,
//           expEarned: activeSubmission.expEarned,
//           answers: activeSubmission.answers.map((a) => ({
//             questionId: a.questionId,
//             isCorrect: a.isCorrect,
//             selectedAnswer: a.selectedAnswer,
//           })),
//           isActive: activeSubmission.isActive,
//         }
//         : null,
//     });
//   } catch (error) {
//     console.error("❌ Error fetching Hardcore Quiz:", error);
//     res.status(500).json({ error: "Failed to fetch hardcore quiz" });
//   }
// };

const getHardcoreQuizByComic = async (req, res) => {
  try {
    const { id } = req.params; // comicId
    const userId = req.query.userId || req.params.userId;

    const quiz = await HardcoreQuiz.findOne({ comicId: id })
      .read("primary")
      .populate({ path: "questions", options: { lean: true } })
      .lean();

    if (!quiz) {
      return res.status(404).json({ error: "Hardcore Quiz not found" });
    }

    let hasAttempted = false;
    let hasAttemptedAllQuestion = false;
    let hasHardCoreChanceLeft = 2;
    let activeSubmission = null;
    let attemptedAnswers = {};
    let attemptNumber = 1;

    if (userId) {
      const userObjectId = new mongoose.Types.ObjectId(userId);

      const submissions = await HardcoreQuizSubmission.find({
        quizId: quiz._id,
        userId: userObjectId,
      })
        .sort({ createdAt: -1 })
        .lean();

      if (submissions.length > 0) hasAttempted = true;

      activeSubmission = submissions.find((s) => s.isActive) || null;

      const finishedAttempts = submissions.filter((s) => s.isFinished).length;

      // kisi bhi attempt me agar user ne sare questions sahi kiye hon
      const latestFinished = submissions.find((s) => s.isFinished);

      if (
        latestFinished &&
        latestFinished.answers.length === quiz.questions.length &&
        latestFinished.answers.every((a) => a.isCorrect)
      ) {
        hasAttemptedAllQuestion = true;
        hasHardCoreChanceLeft = 0; // perfect ho gaya, ab aur attempt nahi
      } else {
        hasHardCoreChanceLeft = Math.max(0, 2 - finishedAttempts);
      }

      // attempt number decide karna
      if (activeSubmission) {
        attemptNumber = activeSubmission.attemptNumber;
      } else if (hasAttemptedAllQuestion && latestFinished) {
        attemptNumber = latestFinished.attemptNumber;
      } else {
        attemptNumber = Math.min(2, finishedAttempts + 1); // 1 ya 2
      }

      // UI ke liye attempted answers collect karo
      for (const sub of submissions) {
        for (const ans of sub.answers || []) {
          attemptedAnswers[ans.questionId.toString()] = {
            selectedAnswer: ans.selectedAnswer,
            isCorrect: ans.isCorrect,
            coins: ans.coins,
            exp: ans.exp,
          };
        }
      }
    }

    const questionsWithAttemptStatus = quiz.questions.map((q) => {
      const attempt = attemptedAnswers[q._id.toString()];
      return {
        ...q,
        locked: false,
        hasAttempted: !!attempt,
        selectedAnswer: attempt ? attempt.selectedAnswer : null,
        isCorrect: attempt ? attempt.isCorrect : null,
        coins: attempt ? attempt.coins : 0,
        exp: attempt ? attempt.exp : 0,
      };
    });

    const comic = await Comic.findById(id);
    let showAdsHardcoreQuiz = true;

    if (comic?.subjectId) {
      const subject = await Subject.findById(comic.subjectId);
      showAdsHardcoreQuiz = subject ? subject.showAdsHardcoreQuiz : true;
    }

    const quizWithAds = {
      ...quiz,
      questions: questionsWithAttemptStatus,
      showAdsHardcoreQuiz,
      showInterestialAds: showAdsHardcoreQuiz,
    };

    return res.json({
      quiz: quizWithAds,
      hasAttempted,
      hasAttemptedAllQuestion,
      hasHardCoreChanceLeft,
      attemptNumber,
      activeSubmission: activeSubmission
        ? {
          _id: activeSubmission._id,
          attemptNumber: activeSubmission.attemptNumber,
          score: activeSubmission.score,
          coinsEarned: activeSubmission.coinsEarned,
          expEarned: activeSubmission.expEarned,
          answers: activeSubmission.answers.map((a) => ({
            questionId: a.questionId,
            isCorrect: a.isCorrect,
            selectedAnswer: a.selectedAnswer,
          })),
          isActive: activeSubmission.isActive,
        }
        : null,
    });
  } catch (error) {
    console.error("❌ Error fetching Hardcore Quiz:", error);
    res.status(500).json({ error: "Failed to fetch hardcore quiz" });
  }
};

const COINS_PER_GEM = 1800;
const getGemsFromCoins = (coins) => Math.floor(coins / COINS_PER_GEM);

// perfect working
// const submitHardcoreQuiz = async (req, res) => {
//   try {
//     const { quizId, questionId, selectedAnswer, doubleChoice } = req.body;
//     const userId = req.user.login_data._id;

//     const quiz = await HardcoreQuiz.findById(quizId).populate("questions");
//     if (!quiz) return res.status(404).json({ error: "Hardcore Quiz not found" });

//     const question = quiz.questions.find(q => q._id.toString() === questionId);
//     if (!question)
//       return res.status(404).json({ error: "Question not found in this quiz" });

//     const todayStart = new Date();
//     todayStart.setHours(0, 0, 0, 0);
//     const todayEnd = new Date();
//     todayEnd.setHours(23, 59, 59, 999);

//     // 🔍 Find or create submission
//     let submission = await HardcoreQuizSubmission.findOne({
//       quizId,
//       userId,
//       isActive: true,
//     });

//     if (!submission) {
//       const todaySubs = await HardcoreQuizSubmission.find({
//         userId,
//         quizId,
//         createdAt: { $gte: todayStart, $lte: todayEnd },
//       });
//       const finishedToday = todaySubs.filter(s => s.isFinished).length;
//       if (finishedToday >= 2) {
//         return res.status(403).json({
//           error: true,
//           message: "You have exceeded daily limit (2 attempts).",
//         });
//       }

//       submission = await HardcoreQuizSubmission.create({
//         quizId,
//         userId,
//         attemptNumber: finishedToday + 1,
//         answers: [],
//         score: 0,
//         coinsEarned: 0,
//         expEarned: 0,
//         currentMultiplier: 1,
//         isActive: true,
//       });
//     }

//     // 🚫 Check if question already attempted
//     const alreadyAttempted = submission.answers.some(a => a.questionId.toString() === questionId);
//     if (alreadyAttempted) {
//       return res.status(400).json({ error: true, message: "Already attempted this question." });
//     }

//     // 🎯 Evaluate answer
//     const isCorrect = question.correctAnswer === selectedAnswer;
//     let coins = 0, exp = 0;

//     if (isCorrect) {
//       coins = 40 * submission.currentMultiplier;
//       exp = 20 * submission.currentMultiplier;

//       submission.score += 1;
//       submission.coinsEarned += coins;
//       submission.expEarned += exp;

//       if (doubleChoice) submission.currentMultiplier *= 2;
//     } else {
//       // ❌ Wrong → Lose everything
//       submission.isActive = false;
//       submission.isFinished = true;
//       submission.coinsEarned = 0;
//       submission.expEarned = 0;
//       submission.currentMultiplier = 1;
//     }

//     // 🧩 Save answer
//     submission.answers.push({ questionId, selectedAnswer, isCorrect, coins, exp });
//     await submission.save();

//     // 🏁 If all questions correct → merge to user wallet
//     let hasAttemptedAllQuestion = false;

//     if (submission.answers.length >= quiz.questions.length && isCorrect) {
//       submission.isActive = false;
//       submission.isFinished = true;
//       hasAttemptedAllQuestion = true;

//       if (!submission.hasMergedToWallet) {
//         const user = await User.findById(userId);
//         user.coins += submission.coinsEarned;
//         user.exp += submission.expEarned;
//         user.gems = getGemsFromCoins(user.coins);
//         await user.save();

//         submission.hasMergedToWallet = true;
//       }

//       await submission.save();
//     }

//     // ❌ If user failed mid-way → don't merge anything
//     if (!isCorrect) {
//       submission.hasMergedToWallet = true;
//       await submission.save();
//     }

//     // 🔁 Check remaining daily chances
//     const totalFinishedAttempts = await HardcoreQuizSubmission.countDocuments({
//       userId,
//       quizId,
//       isFinished: true,
//       createdAt: { $gte: todayStart, $lte: todayEnd },
//     });
//     const hasHardCoreChanceLeft = totalFinishedAttempts < 2 ? 1 : 0;

//     res.json({
//       message: !isCorrect
//         ? "Wrong answer! You lost all coins."
//         : hasAttemptedAllQuestion
//           ? "Congrats! You won and coins merged successfully."
//           : "Correct answer! Keep going.",
//       result: {
//         questionId,
//         isCorrect,
//         correctAnswer: question.correctAnswer,
//         coins,
//         exp,
//       },
//       currentScore: submission.score,
//       totalQuestions: quiz.questions.length,
//       coinsEarned: submission.coinsEarned,
//       expEarned: submission.expEarned,
//       hasHardCoreChanceLeft,
//       hasAttemptedAllQuestion,
//     });
//   } catch (error) {
//     console.error("❌ Submit Hardcore Quiz Error:", error);
//     res.status(500).json({
//       error: "Failed to submit hardcore question",
//       details: error.message,
//     });
//   }
// };

const submitHardcoreQuiz = async (req, res) => {
  try {
    const { quizId, questionId, selectedAnswer, doubleChoice } = req.body;
    const userId = req.user.login_data._id;

    const quiz = await HardcoreQuiz.findById(quizId).populate("questions");
    if (!quiz) {
      return res.status(404).json({ error: "Hardcore Quiz not found" });
    }

    const question = quiz.questions.find(
      (q) => q._id.toString() === questionId
    );
    if (!question) {
      return res
        .status(404)
        .json({ error: "Question not found in this quiz" });
    }

    // 🔐 TOTAL LIMIT = 2 attempts for this quiz
    const allSubs = await HardcoreQuizSubmission.find({ userId, quizId });
    const finishedAttempts = allSubs.filter((s) => s.isFinished).length;

    if (finishedAttempts >= 2) {
      return res.status(403).json({
        error: true,
        message: "You have used all 2 attempts for this quiz.",
      });
    }

    // ❌ check: ye question kabhi pehle attempt hua hai kya? (any attempt)
    const attemptedQuestionIds = new Set();
    for (const sub of allSubs) {
      for (const ans of sub.answers || []) {
        attemptedQuestionIds.add(ans.questionId.toString());
      }
    }

    if (attemptedQuestionIds.has(questionId.toString())) {
      return res.status(400).json({
        error: true,
        message: "You have already attempted this question.",
      });
    }

    // 🔍 Active submission dhoondo, nahi ho to naya attempt
    let submission = await HardcoreQuizSubmission.findOne({
      quizId,
      userId,
      isActive: true,
    });

    if (!submission) {
      submission = await HardcoreQuizSubmission.create({
        quizId,
        userId,
        attemptNumber: finishedAttempts + 1, // 1 ya 2
        answers: [],
        score: 0,
        coinsEarned: 0,
        expEarned: 0,
        currentMultiplier: 1,
        isActive: true,
        isFinished: false,
        hasMergedToWallet: false,
      });
    }

    // EVALUATE ANSWER
    const isCorrect = question.correctAnswer === selectedAnswer;
    let coins = 0;
    let exp = 0;

    if (isCorrect) {
      coins = 40 * submission.currentMultiplier;
      exp = 20 * submission.currentMultiplier;

      submission.score += 1;
      submission.coinsEarned += coins;
      submission.expEarned += exp;

      if (doubleChoice) {
        submission.currentMultiplier *= 2; // next question double
      }
    } else {
      // ❌ WRONG ANSWER → poora attempt fail ho gaya
      submission.isActive = false;
      submission.isFinished = true;
      submission.coinsEarned = 0;
      submission.expEarned = 0;
      submission.currentMultiplier = 1;
      // hasMergedToWallet YAHAN MAT CHANGE KARNA
    }

    // answer push karo
    submission.answers.push({
      questionId,
      selectedAnswer,
      isCorrect,
      coins,
      exp,
    });
    await submission.save();

    let hasAttemptedAllQuestion = false;

    // 🏁 CASE: is attempt me saare questions sahi ho gaye (single clean run)
    if (submission.answers.length >= quiz.questions.length && isCorrect) {
      submission.isActive = false;
      submission.isFinished = true;
      hasAttemptedAllQuestion = true;

      if (!submission.hasMergedToWallet) {
        const user = await User.findById(userId);

        user.coins += submission.coinsEarned;
        user.exp += submission.expEarned;
        user.gems = getGemsFromCoins(user.coins);
        await user.save();

        submission.hasMergedToWallet = true;
        await submission.save();
      }
    }

    // remaining attempts (max 2)
    const finishedCount = await HardcoreQuizSubmission.countDocuments({
      userId,
      quizId,
      isFinished: true,
    });
    const hasHardCoreChanceLeft = finishedCount < 2 ? 1 : 0;

    res.json({
      message: !isCorrect
        ? "Wrong answer! You lost all coins."
        : hasAttemptedAllQuestion
          ? "Congrats! You won and coins merged successfully."
          : "Correct answer! Keep going.",
      result: {
        questionId,
        isCorrect,
        correctAnswer: question.correctAnswer,
        coins,
        exp,
      },
      currentScore: submission.score,
      totalQuestions: quiz.questions.length,
      coinsEarned: submission.coinsEarned,
      expEarned: submission.expEarned,
      hasHardCoreChanceLeft,
      hasAttemptedAllQuestion,
    });
  } catch (error) {
    console.error("❌ Submit Hardcore Quiz Error:", error);
    res.status(500).json({
      error: "Failed to submit hardcore question",
      details: error.message,
    });
  }
};



const finishHardcoreQuiz = async (req, res) => {
  try {
    const { quizId } = req.body;
    const userId = req.user.login_data._id;

    const quiz = await HardcoreQuiz.findById(quizId).populate("questions");
    if (!quiz) {
      return res.status(404).json({ error: "Hardcore Quiz not found" });
    }

    let submission = await HardcoreQuizSubmission.findOne({
      quizId,
      userId,
      isActive: true,
    });

    if (!submission) {
      return res.status(400).json({
        error: true,
        message: "No active hardcore quiz attempt found.",
      });
    }

    // agar pehle hi merge kar chuke ho
    if (submission.hasMergedToWallet) {
      submission.isActive = false;
      submission.isFinished = true;
      await submission.save();

      return res.json({
        message: "Quiz already finished and rewards merged.",
        coinsEarned: submission.coinsEarned,
        expEarned: submission.expEarned,
      });
    }

    // agar koi answer nahi diya tha
    if (!submission.answers || submission.answers.length === 0) {
      submission.isActive = false;
      submission.isFinished = true;
      submission.coinsEarned = 0;
      submission.expEarned = 0;
      submission.hasMergedToWallet = true;
      await submission.save();

      return res.json({
        message: "Quiz finished with no answers. No rewards earned.",
        coinsEarned: 0,
        expEarned: 0,
      });
    }

    // yaha: kuch answers diye hain, and now quitting voluntarily
    const user = await User.findById(userId);
    user.coins += submission.coinsEarned;
    user.exp += submission.expEarned;
    user.gems = getGemsFromCoins(user.coins);
    await user.save();

    submission.isActive = false;
    submission.isFinished = true;
    submission.hasMergedToWallet = true;
    await submission.save();

    const finishedCount = await HardcoreQuizSubmission.countDocuments({
      userId,
      quizId,
      isFinished: true,
    });
    const hasHardCoreChanceLeft = finishedCount < 2 ? 1 : 0;

    res.json({
      message: "Quiz finished. Rewards merged successfully.",
      coinsEarned: submission.coinsEarned,
      expEarned: submission.expEarned,
      currentScore: submission.score,
      totalQuestions: quiz.questions.length,
      hasHardCoreChanceLeft,
    });
  } catch (error) {
    console.error("❌ Finish Hardcore Quiz Error:", error);
    res.status(500).json({
      error: "Failed to finish hardcore quiz",
      details: error.message,
    });
  }
};





const POWER_CARD_COSTS = {
  hint: 300,
  timeExtend: 250,
  reduceOptions: 400,
  changeQuestion: 600,
};

const buyPowerCard = async (req, res) => {
  try {
    const { powerType, quantity = 1 } = req.body;
    const userId = req.user.login_data._id;

    // Validate input
    if (!POWER_CARD_COSTS[powerType]) {
      return res.status(400).json({
        error: true,
        message: "Invalid power card type.",
      });
    }

    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ error: true, message: "User not found" });

    const cost = POWER_CARD_COSTS[powerType] * quantity;

    // Check coins
    if (user.coins < cost) {
      return res.status(400).json({
        error: true,
        message: `Not enough coins. You need ${cost} coins.`,
      });
    }

    // Deduct coins ONLY — gems will stay same
    user.coins -= cost;

    // Add power card
    user.powerCards[powerType] =
      (user.powerCards[powerType] || 0) + quantity;

    await user.save();

    res.json({
      message: `Purchased ${quantity} ${powerType} power card(s) successfully.`,
      powerType,
      quantity,
      cost,
      wallet: { coins: user.coins, gems: user.gems }, // gems same
      powerCards: user.powerCards,
    });
  } catch (error) {
    console.error("Buy Power Card Error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to buy power card",
      details: error.message,
    });
  }
};


const usePowerCard = async (req, res) => {
  try {
    const { quizId, questionId, powerType } = req.body;
    const userId = req.user.login_data._id;

    // Validate
    if (!POWER_CARD_COSTS[powerType]) {
      return res.status(400).json({
        error: true,
        message: "Invalid power card type",
      });
    }

    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ error: true, message: "User not found" });

    // Check or auto-buy
    if ((user.powerCards[powerType] || 0) <= 0) {
      const cost = POWER_CARD_COSTS[powerType];
      if (user.coins < cost) {
        return res.status(400).json({
          error: true,
          message: `You don’t have this power card and not enough coins (${cost} required).`,
        });
      }
      user.coins -= cost;
      user.gems = getGemsFromCoins(user.coins);
    } else {
      user.powerCards[powerType] -= 1;
    }

    await user.save();

    // Apply card effect
    let effect = {};
    const quiz = await HardcoreQuiz.findById(quizId).populate("questions");
    const question = quiz.questions.find((q) => q._id.toString() === questionId);

    if (powerType === "hint") {
      effect = { hint: question?.hint || "No hint available." };
    } else if (powerType === "reduceOptions") {
      const correct = question.correctAnswer;
      const wrongs = question.options.filter((opt) => opt !== correct);
      const reduced = [correct, wrongs[Math.floor(Math.random() * wrongs.length)]];
      effect = { reducedOptions: reduced.sort(() => Math.random() - 0.5) };
    } else if (powerType === "timeExtend") {
      effect = { timeAdded: 10 };
    } else if (powerType === "changeQuestion") {
      const remaining = quiz.questions.filter((q) => q._id.toString() !== questionId);
      if (remaining.length === 0) {
        effect = { message: "No more questions left in this quiz!" };
      } else {
        const newQ = remaining[Math.floor(Math.random() * remaining.length)];
        effect = {
          message: "Question changed successfully.",
          newQuestion: {
            questionId: newQ._id,
            question: newQ.question,
            options: newQ.options,
            difficulty: newQ.difficulty,
          },
        };
      }
    }

    res.json({
      message: `Used power card '${powerType}' successfully.`,
      powerUsed: powerType,
      effect,
      updatedWallet: { coins: user.coins, gems: user.gems },
      remainingCards: user.powerCards,
    });
  } catch (error) {
    console.error("Use Power Card Error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to use power card",
      details: error.message,
    });
  }
};

const GEM_CONVERSION_RATE = 1800; // 1 Gem = 1800 Coins


const buyGems = async (req, res) => {
  try {
    const { gemsToBuy } = req.body;
    const userId = req.user.login_data._id;

    if (!gemsToBuy || gemsToBuy <= 0) {
      return res.status(400).json({
        error: true,
        message: "Invalid number of gems to buy.",
      });
    }

    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ error: true, message: "User not found" });

    const costInCoins = gemsToBuy * GEM_CONVERSION_RATE;

    if (user.coins < costInCoins) {
      return res.status(400).json({
        error: true,
        message: `Not enough coins. You need ${costInCoins} coins to buy ${gemsToBuy} gem(s).`,
      });
    }

    // 💰 Deduct coins and add gems
    user.coins -= costInCoins;
    user.gems += gemsToBuy;
    await user.save();

    res.json({
      success: true,
      message: `Successfully purchased ${gemsToBuy} gem(s).`,
      conversionRate: `1 Gem = ${GEM_CONVERSION_RATE} Coins`,
      wallet: {
        coins: user.coins,
        gems: user.gems,
      },
    });
  } catch (error) {
    console.error("💎 Buy Gems Error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to buy gems",
      details: error.message,
    });
  }
};



const getPowerCards = async (req, res) => {
  try {
    const user = await User.findById(req.user.login_data._id).lean();
    const powerCards = [
      { type: "hint", name: "Hint", cost: 300, description: "Show hint for the current question" },
      { type: "timeExtend", name: "Time Extend", cost: 250, description: "Add +10 seconds to timer" },
      { type: "reduceOptions", name: "Reduce Options", cost: 400, description: "Remove two wrong answers" },
      { type: "changeQuestion", name: "Change Question", cost: 600, description: "Skip current question" },
    ];

    // 💎 Available Gem Packages
    const gemPackages = [
      { type: "gems", name: "Gems", amount: 1, cost: GEM_CONVERSION_RATE, description: "Buy 1 gem for 1800 coins" },
    ];

    res.json({
      message: "Power cards fetched successfully.",
      availablePowerCards: powerCards,
      userPowerCards: user.powerCards,
      availableGems: gemPackages,
      wallet: { coins: user.coins, gems: user.gems },
    });
  } catch (error) {
    console.error("Get Power Cards Error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to fetch power cards",
    });
  }
};


// ----------------------------------------


const buyHardcoreQuestion = async (req, res) => {
  try {
    const { quizId, questionId } = req.body;
    const userId = req.user.login_data._id;

    // 1️⃣ Fetch user & quiz
    const user = await User.findById(userId);
    if (!user)
      return res.status(404).json({ error: true, message: "User not found" });

    const quiz = await HardcoreQuiz.findById(quizId).populate("questions");
    if (!quiz)
      return res.status(404).json({ error: true, message: "Quiz not found" });

    // 2️⃣ Check across all submissions (not just active)
    const previousUnlock = await HardcoreQuizSubmission.findOne({
      userId,
      quizId,
      unlockedQuestions: { $in: [questionId] },
    });

    if (previousUnlock) {
      return res.status(400).json({
        error: true,
        message: "This question is already purchased.",
      });
    }

    // 3️⃣ Get or create submission
    let submission = await HardcoreQuizSubmission.findOne({
      userId,
      quizId,
      isActive: true,
    });

    if (!submission) {
      submission = await HardcoreQuizSubmission.create({
        quizId,
        userId,
        answers: [],
        unlockedQuestions: [],
        score: 0,
        coinsEarned: 0,
        expEarned: 0,
        isActive: true,
      });
    }

    // 4️⃣ Already unlocked?
    if (submission.unlockedQuestions?.includes(questionId)) {
      return res.json({ message: "Question already purchased." });
    }

    // 5️⃣ Get the question from quiz
    const boughtQuestion = quiz.questions.find(
      (q) => q._id.toString() === questionId
    );

    if (!boughtQuestion) {
      return res.status(404).json({
        error: true,
        message: "Question not found in this quiz.",
      });
    }

    // 6️⃣ Determine gem cost based on difficulty
    const difficulty = boughtQuestion.difficulty?.toLowerCase() || "easy";
    const gemCostMap = {
      easy: 1,
      medium: 2,
      hard: 3,
      extreme: 4,
    };
    const gemCost = gemCostMap[difficulty] || 1;

    // 7️⃣ Check if user has enough gems
    if (user.gems < gemCost) {
      return res.status(400).json({
        error: true,
        message: `Not enough gems. ${gemCost} gem(s) required to buy this ${difficulty} question.`,
        requiredGems: gemCost,
        userGems: user.gems,
      });
    }

    // 8️⃣ Deduct gems
    user.gems -= gemCost;
    await user.save();

    // 9️⃣ Mark question as unlocked
    submission.unlockedQuestions.push(questionId);
    await submission.save();

    // 🔟 Return purchased question details
    res.json({
      success: true,
      message: `Question purchased successfully.`,
      unlockedQuestion: {
        _id: boughtQuestion._id,
        question: boughtQuestion.question,
        options: boughtQuestion.options,
        difficulty: boughtQuestion.difficulty,
        correctAnswer: boughtQuestion.correctAnswer,
      },
      spentGems: gemCost,
      remainingGems: user.gems,
    });
  } catch (error) {
    console.error("❌ Buy Question Error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to purchase question",
      details: error.message,
    });
  }
};



const getBoughtQuestions = async (req, res) => {
  try {
    const userId = req.user.login_data._id;
    const { quizId } = req.params;

    // 1️⃣ Validate quiz
    const quiz = await HardcoreQuiz.findById(quizId)
      .populate("questions", "_id question difficulty options correctAnswer")
      .lean();

    if (!quiz) {
      return res.status(404).json({ error: true, message: "Quiz not found" });
    }

    // 2️⃣ Fetch all submissions for this user & quiz
    const submissions = await HardcoreQuizSubmission.find({ userId, quizId })
      .sort({ createdAt: 1 })
      .lean();

    if (!submissions || submissions.length === 0) {
      return res.json({
        message: "No questions purchased yet.",
        boughtQuestions: [],
        totalBought: 0,
      });
    }

    // 3️⃣ Merge unlockedQuestions from all submissions (avoid duplicates)
    const allUnlockedIds = [
      ...new Set(
        submissions.flatMap((sub) =>
          (sub.unlockedQuestions || []).map((q) => q.toString())
        )
      ),
    ];

    if (allUnlockedIds.length === 0) {
      return res.json({
        message: "No questions purchased yet.",
        boughtQuestions: [],
        totalBought: 0,
      });
    }

    // 4️⃣ Filter quiz questions by unlocked list
    const boughtQuestionDetails = quiz.questions.filter((q) =>
      allUnlockedIds.includes(q._id.toString())
    );

    // 5️⃣ Response
    res.json({
      success: true,
      message: "Purchased questions fetched successfully.",
      totalBought: boughtQuestionDetails.length,
      boughtQuestions: boughtQuestionDetails.map((q) => ({
        _id: q._id,
        question: q.question,
        options: q.options,
        difficulty: q.difficulty,
        correctAnswer: q.correctAnswer,
      })),
    });
  } catch (error) {
    console.error("❌ Get Bought Questions Error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to fetch purchased questions",
      details: error.message,
    });
  }
};


const getAllBoughtQuestions = async (req, res) => {
  try {
    const userId = req.user.login_data._id;

    // 1️⃣ Fetch all submissions with unlocked questions
    const submissions = await HardcoreQuizSubmission.find({
      userId,
      unlockedQuestions: { $exists: true, $ne: [] },
    })
      .populate({
        path: "quizId",
        select: "_id comicId",
        populate: {
          path: "comicId",
          select: "_id title subject grade",
        },
      })
      .lean();

    if (!submissions || submissions.length === 0) {
      return res.json({
        message: "No purchased questions found.",
        totalBought: 0,
        boughtQuestions: [],
      });
    }

    // 2️⃣ Collect all purchased questions with quiz & comic info
    const allBought = [];
    for (const sub of submissions) {
      const quiz = await HardcoreQuiz.findById(sub.quizId._id)
        .populate("questions", "_id question options difficulty correctAnswer")
        .lean();

      const unlockedQuestions = quiz.questions.filter((q) =>
        sub.unlockedQuestions.some((u) => u.toString() === q._id.toString())
      );

      unlockedQuestions.forEach((q) => {
        allBought.push({
          quizId: sub.quizId._id,
          // comic: {
          //   id: sub.quizId.comicId?._id,
          //   title: sub.quizId.comicId?.title || "Untitled Comic",
          //   subject: sub.quizId.comicId?.subject || "Unknown",
          //   grade: sub.quizId.comicId?.grade || "N/A",
          // },
          questionId: q._id,
          question: q.question,
          options: q.options, // ✅ added full options array
          difficulty: q.difficulty,
          correctAnswer: q.correctAnswer,
        });
      });
    }

    // 3️⃣ Response
    res.json({
      success: true,
      message: "All purchased questions fetched successfully.",
      totalBought: allBought.length,
      boughtQuestions: allBought,
    });
  } catch (error) {
    console.error("❌ Get All Bought Questions Error:", error);
    res.status(500).json({
      error: true,
      message: "Failed to fetch all purchased questions",
      details: error.message,
    });
  }
};




module.exports = {
  generateHardcoreQuiz, getHardcoreQuizByComic, submitHardcoreQuiz, finishHardcoreQuiz,
  buyPowerCard, usePowerCard, getPowerCards, buyGems, buyHardcoreQuestion, getBoughtQuestions, getAllBoughtQuestions
};