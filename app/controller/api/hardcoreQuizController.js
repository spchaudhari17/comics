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



// const getHardcoreQuizByComic = async (req, res) => {
//   try {
//     const { id } = req.params; // comicId
//     const userId = req.query.userId || req.params.userId;

//     // 🎯 Always read from primary to get fresh data
//     const quiz = await HardcoreQuiz.findOne({ comicId: id })
//       .read("primary")
//       .populate({
//         path: "questions",
//         options: { lean: true },
//       })
//       .lean();

//     if (!quiz) {
//       return res.status(404).json({ error: "Hardcore Quiz not found" });
//     }

//     let hasAttempted = false;
//     let attemptedAnswers = {}; // questionId -> { selectedAnswer, isCorrect, coins, exp }

//     if (userId) {
//       // 🧩 Fetch *all* submissions ever made by this user for this quiz
//       const submissions = await HardcoreQuizSubmission.find({
//         quizId: quiz._id,
//         userId: new mongoose.Types.ObjectId(userId),
//       })
//         .sort({ createdAt: -1 })
//         .lean();

//       // 🔹 Merge all answers from all submissions
//       if (submissions.length > 0) {
//         hasAttempted = true;
//         for (const submission of submissions) {
//           for (const ans of submission.answers || []) {
//             // ensure latest submission overwrites older ones
//             attemptedAnswers[ans.questionId.toString()] = {
//               selectedAnswer: ans.selectedAnswer,
//               isCorrect: ans.isCorrect,
//               coins: ans.coins,
//               exp: ans.exp,
//             };
//           }
//         }
//       }
//     }

//     // 🧠 Merge question data with attempt info
//     const questionsWithAttemptStatus = quiz.questions.map((q) => {
//       const attempt = attemptedAnswers[q._id.toString()];
//       return {
//         ...q,
//         hasAttempted: !!attempt,
//         selectedAnswer: attempt ? attempt.selectedAnswer : null,
//         isCorrect: attempt ? attempt.isCorrect : null,
//         coins: attempt ? attempt.coins : 0,
//         exp: attempt ? attempt.exp : 0,
//       };
//     });

//     // ✅ Response
//     res.json({
//       quiz: {
//         ...quiz,
//         questions: questionsWithAttemptStatus,
//       },
//       hasAttempted,
//     });
//   } catch (error) {
//     console.error("Error fetching Hardcore Quiz:", error);
//     res.status(500).json({ error: "Failed to fetch hardcore quiz" });
//   }
// };


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
    let unlocked = []; // 🔹 initialize unlocked questions list

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

        // 🔸 pick latest submission (to get unlocked questions)
        const latestSubmission = submissions[0];
        unlocked = latestSubmission.unlockedQuestions
          ? latestSubmission.unlockedQuestions.map((q) => q.toString())
          : [];

        for (const submission of submissions) {
          for (const ans of submission.answers || []) {
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

    // 🧠 Merge question data with attempt + unlock info
    const questionsWithAttemptStatus = quiz.questions.map((q) => {
      const attempt = attemptedAnswers[q._id.toString()];
      const isUnlocked = unlocked.includes(q._id.toString());
      return {
        ...q,
        locked: !isUnlocked, // 👈 add locked status
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

    // 2️⃣ Get or create submission
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

    // 3️⃣ Already unlocked?
    if (submission.unlockedQuestions?.includes(questionId)) {
      return res.json({ message: "Question already purchased." });
    }

    // 4️⃣ Check gems
    if (user.gems < 1) {
      return res.status(400).json({
        error: true,
        message: "Not enough gems. 1 gem required to buy this question.",
      });
    }

    // 5️⃣ Deduct gem
    user.gems -= 1;
    await user.save();

    // 6️⃣ Mark question as unlocked
    submission.unlockedQuestions.push(questionId);
    await submission.save();

    // 7️⃣ Return purchased question details
    const boughtQuestion = quiz.questions.find(
      (q) => q._id.toString() === questionId
    );

    res.json({
      success: true,
      message: "Question purchased successfully.",
      unlockedQuestion: {
        _id: boughtQuestion._id,
        question: boughtQuestion.question,
        options: boughtQuestion.options,
        difficulty: boughtQuestion.difficulty,
        correctAnswer: boughtQuestion.correctAnswer,
      },
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
  generateHardcoreQuiz, getHardcoreQuizByComic, submitHardcoreQuiz,
  buyPowerCard, usePowerCard, getPowerCards, buyGems, buyHardcoreQuestion, getBoughtQuestions, getAllBoughtQuestions
};