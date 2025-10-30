const OpenAI = require("openai");
const HardcoreQuiz = require("../../models/HardcoreQuiz");
const HardcoreQuizQuestion = require("../../models/HardcoreQuizQuestion");
const Comic = require("../../models/Comic");
const HardcoreQuizSubmission = require("../../models/HardcoreQuizSubmission");
const { default: mongoose } = require("mongoose");
const User = require("../../models/User");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});


// old
// const generateHardcoreQuiz = async (req, res) => {
//   const { comicId, script, subject, concept, grade } = req.body;

//   try {
//     // 🧠 Step 1: Check if quiz already exists
//     const existingQuiz = await HardcoreQuiz.findOne({ comicId })
//       .populate({
//         path: "questions",
//         select: "question options correctAnswer difficulty explanation hint",
//       })
//       .lean();

//     if (existingQuiz) {
//       return res.status(200).json({
//         message: "Hardcore quiz already exists for this comic.",
//         quizId: existingQuiz._id,
//         quiz: existingQuiz,
//         alreadyExists: true,
//       });
//     }

//     // 🧩 Step 2: Prepare story text
//     let storyText = "";
//     if (Array.isArray(script)) {
//       storyText = script
//         .map((page) =>
//           page.panels
//             .map((p) => `Scene: ${p.scene || ""}. Caption: ${p.caption || ""}`)
//             .join("\n")
//         )
//         .join("\n\n");
//     } else {
//       storyText = script || "";
//     }

//     // 🧠 Step 3: Prompt for OpenAI
//     const prompt = `
// You are an expert educational AI. Create a **hardcore-level quiz**.

// Context:
// - Subject: ${subject}
// - Concept: ${concept}
// - Grade: ${grade}
// - Reference Story (ignore dialogues):
// ${storyText}

// Instructions:
// - Create 5 very challenging MCQs.
// - Questions should require deep conceptual reasoning, analysis, and problem-solving.
// - Each question must have:
//   • 1 correct answer
//   • 3 difficult distractors
//   • A brief explanation of the correct answer
//   • A short hint to guide the student (but without revealing the answer)
// - Difficulty: only "hard" or "extreme".
// - Return valid JSON only.

// Format:
// [
//   {
//     "question": "string",
//     "options": ["opt1", "opt2", "opt3", "opt4"],
//     "correctAnswer": "string",
//     "difficulty": "hard|extreme",
//     "explanation": "string",
//     "hint": "string"
//   }
// ]
// `;

//     // 🧩 Step 4: Generate quiz from OpenAI
//     const response = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [
//         { role: "system", content: "Return valid JSON only, no markdown." },
//         { role: "user", content: prompt },
//       ],
//       temperature: 0.7,
//       max_tokens: 900,
//     });

//     let raw = response.choices[0].message.content.trim();
//     if (raw.startsWith("```")) raw = raw.replace(/```json|```/g, "").trim();

//     let questions;
//     try {
//       questions = JSON.parse(raw);
//       if (!Array.isArray(questions)) throw new Error("Invalid JSON array");
//     } catch (err) {
//       return res.status(500).json({
//         error: "Invalid JSON from OpenAI",
//         details: err.message,
//         raw,
//       });
//     }

//     // 🧩 Step 5: Create new quiz
//     const quiz = await HardcoreQuiz.create({
//       comicId,
//       user_id: req.user.login_data._id,
//       status: "draft",
//       mode: "hardcore",
//     });

//     await Comic.findByIdAndUpdate(comicId, { hasHardcoreQuiz: true });

//     // 🧩 Step 6: Save questions
//     const savedQuestions = [];
//     for (const q of questions) {
//       const newQ = await HardcoreQuizQuestion.create({
//         quizId: quiz._id,
//         question: q.question,
//         options: q.options,
//         correctAnswer: q.correctAnswer,
//         difficulty: q.difficulty,
//         explanation: q.explanation,
//         hint: q.hint,
//       });
//       savedQuestions.push(newQ._id);
//     }

//     quiz.questions = savedQuestions;
//     await quiz.save();

//     // 🧩 Step 7: Return response
//     res.json({
//       message: "Hardcore quiz successfully created.",
//       quizId: quiz._id,
//       questions,
//       alreadyExists: false,
//     });
//   } catch (error) {
//     console.error("Hardcore Quiz Generation Error:", error);
//     res.status(500).json({
//       error: "Failed to generate hardcore quiz",
//       details: error.message,
//     });
//   }
// };

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

    // 🧩 Step 2: Extract text from comic script
    let storyText = "";
    if (Array.isArray(script)) {
      storyText = script
        .map((page) =>
          page.panels
            .map(
              (p) => `Scene: ${p.scene || ""}. Caption: ${p.caption || ""}`
            )
            .join("\n")
        )
        .join("\n\n");
    } else {
      storyText = script || "";
    }

    // 🧠 Step 3: Prompt for OpenAI
    const prompt = `
You are an expert educational AI quiz generator.

Context:
- Subject: ${subject}
- Concept: ${concept}
- Grade: ${grade}
- Reference Story (ignore dialogues):
${storyText}

Task:
Create **6–8 adaptive multiple-choice questions (MCQs)** that gradually increase in difficulty:
1. 2 easy
2. 2 medium
3. 2 hard
4. 1–2 extreme

Rules:
- Each question must have **6–7 options**.
- Only **one correct answer**.
- Include:
  - "difficulty": one of ["easy", "medium", "hard", "extreme"]
  - "explanation": short conceptual reasoning
  - "hint": small tip without giving answer
- Each question should test progressively deeper understanding.

Return **strict JSON array**, sorted from easy → extreme.

Format:
[
  {
    "question": "string",
    "options": ["opt1", "opt2", "opt3", "opt4", "opt5", "opt6", "opt7"],
    "correctAnswer": "string",
    "difficulty": "easy|medium|hard|extreme",
    "explanation": "string",
    "hint": "string"
  }
]
`;

    // 🧩 Step 4: Generate quiz from OpenAI
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Return valid JSON only, no markdown." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 1300,
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
      mode: "adaptive", // changed mode name to reflect all levels
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

    // 🧩 Step 7: Return response
    res.json({
      message: "Adaptive quiz successfully created (easy → extreme).",
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



const getHardcoreQuizByComic = async (req, res) => {
  try {
    const { id } = req.params; // comicId
    const userId = req.query.userId || req.params.userId;

    // 🎯 Always read from primary to get fresh data
    const quiz = await HardcoreQuiz.findOne({ comicId: id })
      .read("primary")
      .populate({
        path: "questions",
        options: { lean: true },
      })
      .lean();

    if (!quiz) {
      return res.status(404).json({ error: "Hardcore Quiz not found" });
    }

    let hasAttempted = false;
    let attemptedAnswers = {}; // questionId -> { selectedAnswer, isCorrect, coins, exp }

    if (userId) {
      // 🧩 Fetch *all* submissions ever made by this user for this quiz
      const submissions = await HardcoreQuizSubmission.find({
        quizId: quiz._id,
        userId: new mongoose.Types.ObjectId(userId),
      })
        .sort({ createdAt: -1 })
        .lean();

      // 🔹 Merge all answers from all submissions
      if (submissions.length > 0) {
        hasAttempted = true;
        for (const submission of submissions) {
          for (const ans of submission.answers || []) {
            // ensure latest submission overwrites older ones
            attemptedAnswers[ans.questionId.toString()] = {
              selectedAnswer: ans.selectedAnswer,
              isCorrect: ans.isCorrect,
              coins: ans.coins,
              exp: ans.exp,
            };
          }
        }
      }
    }

    // 🧠 Merge question data with attempt info
    const questionsWithAttemptStatus = quiz.questions.map((q) => {
      const attempt = attemptedAnswers[q._id.toString()];
      return {
        ...q,
        hasAttempted: !!attempt,
        selectedAnswer: attempt ? attempt.selectedAnswer : null,
        isCorrect: attempt ? attempt.isCorrect : null,
        coins: attempt ? attempt.coins : 0,
        exp: attempt ? attempt.exp : 0,
      };
    });

    // ✅ Response
    res.json({
      quiz: {
        ...quiz,
        questions: questionsWithAttemptStatus,
      },
      hasAttempted,
    });
  } catch (error) {
    console.error("Error fetching Hardcore Quiz:", error);
    res.status(500).json({ error: "Failed to fetch hardcore quiz" });
  }
};




const COINS_PER_GEM = 1800;
const getGemsFromCoins = (coins) => Math.floor(coins / COINS_PER_GEM);

// const submitHardcoreQuiz = async (req, res) => {
//   try {
//     const { quizId, questionId, selectedAnswer, doubleChoice } = req.body;
//     const userId = req.user.login_data._id;

//     //  Fetch quiz & question
//     const quiz = await HardcoreQuiz.findById(quizId).populate("questions");
//     if (!quiz)
//       return res.status(404).json({ error: "Hardcore Quiz not found" });

//     const question = quiz.questions.find(
//       (q) => q._id.toString() === questionId
//     );
//     if (!question)
//       return res.status(404).json({ error: "Question not found in this quiz" });

//     //  Daily limit: 2 hardcore attempts per day
//     const todayStart = new Date();
//     todayStart.setHours(0, 0, 0, 0);
//     const todayEnd = new Date();
//     todayEnd.setHours(23, 59, 59, 999);

//     const attemptsToday = await HardcoreQuizSubmission.countDocuments({
//       userId,
//       createdAt: { $gte: todayStart, $lte: todayEnd },
//     });

//     if (attemptsToday >= 2) {
//       return res.status(403).json({
//         error: true,
//         message: "You can only attempt 2 hardcore quizzes per day.",
//       });
//     }

//     // 🔹 Find or create submission
//     let submission = await HardcoreQuizSubmission.findOne({ quizId, userId });
//     if (!submission) {
//       submission = await HardcoreQuizSubmission.create({
//         quizId,
//         userId,
//         answers: [],
//         score: 0,
//         coinsEarned: 0,
//         expEarned: 0,
//         currentMultiplier: 1, // start with base 1×
//       });
//     }

//     const isCorrect = question.correctAnswer === selectedAnswer;

//     // 🧠 Hardcore Reward Logic
//     let coins = 0;
//     let exp = 0;

//     if (isCorrect) {
//       if (submission.answers.length === 0) {
//         // 🟢 First correct → base reward
//         coins = 40;
//         exp = 20;
//         submission.currentMultiplier = 1;
//       } else {
//         if (doubleChoice === true) {
//           // 🟢 User risked double → multiply rewards
//           submission.currentMultiplier *= 2;
//           coins = 40 * submission.currentMultiplier;
//           exp = 20 * submission.currentMultiplier;
//         } else {
//           // 🟢 Safe choice → keep same multiplier
//           coins = 40 * submission.currentMultiplier;
//           exp = 20 * submission.currentMultiplier;
//         }
//       }

//       submission.score += 1;
//       submission.coinsEarned = coins;
//       submission.expEarned = exp;
//     } else {
//       // 🔴 Wrong → lose all session rewards
//       coins = 0;
//       exp = 0;
//       submission.coinsEarned = 0;
//       submission.expEarned = 0;
//       submission.currentMultiplier = 1;
//     }

//     // 🔹 Save answer record
//     submission.answers.push({
//       questionId,
//       selectedAnswer,
//       isCorrect,
//       coins,
//       exp,
//     });
//     await submission.save();

//     // 🔹 Update user wallet if correct
//     if (isCorrect) {
//       const user = await User.findById(userId);
//       user.coins += coins;
//       user.exp += exp;
//       user.gems = getGemsFromCoins(user.coins);
//       await user.save();
//     }

//     // ✅ Final response (matching your structure)
//     return res.json({
//       message: "Question submitted successfully.",
//       result: {
//         questionId,
//         isCorrect,
//         correctAnswer: question.correctAnswer,
//         explanation: question.explanation,
//         hint: question.hint,
//         coins,
//         exp,
//       },
//       currentScore: submission.score,
//       totalQuestions: quiz.questions.length,
//       coinsEarned: submission.coinsEarned,
//       expEarned: submission.expEarned,
//     });
//   } catch (error) {
//     console.error("❌ Submit Hardcore Quiz Error:", error);
//     return res.status(500).json({
//       error: "Failed to submit hardcore question",
//       details: error.message,
//     });
//   }
// };


const submitHardcoreQuiz = async (req, res) => {
  try {
    const { quizId, questionId, selectedAnswer, doubleChoice } = req.body;
    const userId = req.user.login_data._id;

    // 🎯 Fetch quiz & question
    const quiz = await HardcoreQuiz.findById(quizId).populate("questions");
    if (!quiz)
      return res.status(404).json({ error: "Hardcore Quiz not found" });

    const question = quiz.questions.find(
      (q) => q._id.toString() === questionId
    );
    if (!question)
      return res.status(404).json({ error: "Question not found in this quiz" });

    // 🧠 Limit: Only 2 attempts per comic per day
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Count full quiz attempts (submissions) today
    const attemptsForComicToday = await HardcoreQuizSubmission.countDocuments({
      userId,
      quizId,
      createdAt: { $gte: todayStart, $lte: todayEnd },
    });

    // if (attemptsForComicToday >= 2) {
    //   return res.status(403).json({
    //     error: true,
    //     message:
    //       "You can only attempt this comic’s hardcore quiz 2 times per day.",
    //   });
    // }

    // 🔹 Always create a new submission if user starts a new quiz attempt
    let submission = await HardcoreQuizSubmission.findOne({
      quizId,
      userId,
      isActive: true, // current ongoing attempt
    });

    // If no active submission or user finished all questions, start new attempt
    if (!submission || submission.isFinished) {
      submission = await HardcoreQuizSubmission.create({
        quizId,
        userId,
        answers: [],
        score: 0,
        coinsEarned: 0,
        expEarned: 0,
        currentMultiplier: 1,
        isActive: true,
      });
    }

    const isCorrect = question.correctAnswer === selectedAnswer;

    // 🧮 Reward Logic
    let coins = 0;
    let exp = 0;

    if (isCorrect) {
      if (submission.answers.length === 0) {
        coins = 40;
        exp = 20;
        submission.currentMultiplier = 1;
      } else {
        if (doubleChoice === true) {
          submission.currentMultiplier *= 2;
          coins = 40 * submission.currentMultiplier;
          exp = 20 * submission.currentMultiplier;
        } else {
          coins = 40 * submission.currentMultiplier;
          exp = 20 * submission.currentMultiplier;
        }
      }

      submission.score += 1;
      submission.coinsEarned += coins;
      submission.expEarned += exp;
    } else {
      coins = 0;
      exp = 0;
      submission.currentMultiplier = 1;
    }

    submission.answers.push({
      questionId,
      selectedAnswer,
      isCorrect,
      coins,
      exp,
    });

    // Mark finished if all questions answered
    if (submission.answers.length >= quiz.questions.length) {
      submission.isFinished = true;
      submission.isActive = false;
    }

    await submission.save();

    // 🔹 Update user wallet if correct
    if (isCorrect) {
      const user = await User.findById(userId);
      user.coins += coins;
      user.exp += exp;
      user.gems = getGemsFromCoins(user.coins);
      await user.save();
    }

    return res.json({
      message: "Question submitted successfully.",
      result: {
        questionId,
        isCorrect,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        hint: question.hint,
        coins,
        exp,
      },
      currentScore: submission.score,
      totalQuestions: quiz.questions.length,
      coinsEarned: submission.coinsEarned,
      expEarned: submission.expEarned,
      attemptCountToday: attemptsForComicToday + 1,
    });
  } catch (error) {
    console.error("❌ Submit Hardcore Quiz Error:", error);
    return res.status(500).json({
      error: "Failed to submit hardcore question",
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


// const buyPowerCard = async (req, res) => {
//   try {
//     const { powerType, quantity = 1 } = req.body;
//     const userId = req.user.login_data._id;

//     if (!POWER_CARD_COSTS[powerType]) {
//       return res.status(400).json({ error: true, message: "Invalid power card type." });
//     }

//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ error: true, message: "User not found" });

//     const cost = POWER_CARD_COSTS[powerType] * quantity;

//     if (user.coins < cost) {
//       return res.status(400).json({
//         error: true,
//         message: `Not enough coins. You need ${cost} coins.`,
//       });
//     }

//     // Deduct coins and add card(s)
//     user.coins -= cost;
//     user.gems = getGemsFromCoins(user.coins);
//     user.powerCards[powerType] = (user.powerCards[powerType] || 0) + quantity;
//     await user.save();

//     res.json({
//       message: `Purchased ${quantity} ${powerType} power card(s) successfully.`,
//       powerType,
//       quantity,
//       cost,
//       wallet: { coins: user.coins, gems: user.gems },
//       powerCards: user.powerCards,
//     });
//   } catch (error) {
//     console.error("Buy Power Card Error:", error);
//     res.status(500).json({ error: true, message: "Failed to buy power card", details: error.message });
//   }
// };



// const usePowerCard = async (req, res) => {
//   try {
//     const { quizId, questionId, powerType } = req.body;
//     const userId = req.user.login_data._id;

//     const user = await User.findById(userId);
//     if (!user) return res.status(404).json({ error: true, message: "User not found" });

//     if (!POWER_CARD_COSTS[powerType]) {
//       return res.status(400).json({ error: true, message: "Invalid power card type" });
//     }

//     // 🔹 If user has none, auto-buy if enough coins
//     if ((user.powerCards[powerType] || 0) <= 0) {
//       const cost = POWER_CARD_COSTS[powerType];
//       if (user.coins < cost) {
//         return res.status(400).json({
//           error: true,
//           message: `You don’t have this power card and not enough coins (${cost} required).`,
//         });
//       }
//       user.coins -= cost;
//       user.gems = getGemsFromCoins(user.coins);
//     } else {
//       // 🔹 Consume one card
//       user.powerCards[powerType] -= 1;
//     }

//     await user.save();

//     // 🔹 Apply effect
//     let effect = {};
//     if (powerType === "hint") {
//       const quiz = await HardcoreQuiz.findById(quizId).populate("questions");
//       const question = quiz.questions.find((q) => q._id.toString() === questionId);
//       effect = { hint: question?.hint || "No hint available." };
//     } else if (powerType === "reduceOptions") {
//       const quiz = await HardcoreQuiz.findById(quizId).populate("questions");
//       const question = quiz.questions.find((q) => q._id.toString() === questionId);
//       const correct = question.correctAnswer;
//       const wrongs = question.options.filter((opt) => opt !== correct);
//       const reduced = [correct, wrongs[Math.floor(Math.random() * wrongs.length)]];
//       effect = { reducedOptions: reduced.sort(() => Math.random() - 0.5) };
//     } else if (powerType === "timeExtend") {
//       effect = { timeAdded: 10 };
//     } else if (powerType === "changeQuestion") {
//       effect = { message: "Question skipped, fetch new one." };
//     }

//     res.json({
//       message: `Used power card ${powerType} successfully.`,
//       powerUsed: powerType,
//       effect,
//       updatedWallet: { coins: user.coins, gems: user.gems },
//       remainingCards: user.powerCards,
//     });
//   } catch (error) {
//     console.error("Use Power Card Error:", error);
//     res.status(500).json({ error: true, message: "Failed to use power card" });
//   }
// };

const buyPowerCard = async (req, res) => {
  try {
    const { powerType, quantity = 1 } = req.body;
    const userId = req.user.login_data._id;

    // 🧠 Validate input key
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

    if (user.coins < cost) {
      return res.status(400).json({
        error: true,
        message: `Not enough coins. You need ${cost} coins.`,
      });
    }

    // 🪙 Deduct coins and add the card(s)
    user.coins -= cost;
    user.gems = getGemsFromCoins(user.coins);
    user.powerCards[powerType] =
      (user.powerCards[powerType] || 0) + quantity;

    await user.save();

    res.json({
      message: `Purchased ${quantity} ${powerType} power card(s) successfully.`,
      powerType,
      quantity,
      cost,
      wallet: { coins: user.coins, gems: user.gems },
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




const getPowerCards = async (req, res) => {
  try {
    const user = await User.findById(req.user.login_data._id).lean();
    const powerCards = [
      { type: "hint", name: "Hint", cost: 300, description: "Show hint for the current question" },
      { type: "timeExtend", name: "Time Extend", cost: 250, description: "Add +10 seconds to timer" },
      { type: "reduceOptions", name: "Reduce Options", cost: 400, description: "Remove two wrong answers" },
      { type: "changeQuestion", name: "Change Question", cost: 600, description: "Skip current question" },
    ];

    res.json({
      message: "Power cards fetched successfully.",
      availablePowerCards: powerCards,
      userPowerCards: user.powerCards,
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



module.exports = { generateHardcoreQuiz, getHardcoreQuizByComic, submitHardcoreQuiz, buyPowerCard, usePowerCard, getPowerCards };