const Quiz = require("../../models/Quiz");
const QuizQuestion = require("../../models/QuizQuestion");
const QuizSubmission = require("../../models/QuizSubmission");
const User = require("../../models/User");

// const submitQuiz = async (req, res) => {
//   try {
//     const { quizId, answers } = req.body; 


//     const userId = req.user.login_data._id;


//     const quiz = await Quiz.findById(quizId).populate("questions");
//     if (!quiz) return res.status(404).json({ error: "Quiz not found" });

//     let score = 0;
//     const evaluatedAnswers = answers.map(ans => {
//       const q = quiz.questions.find(q => q._id.toString() === ans.questionId);
//       const isCorrect = q?.correctAnswer === ans.selectedAnswer;
//       if (isCorrect) score++;
//       return {
//         questionId: ans.questionId,
//         selectedAnswer: ans.selectedAnswer,
//         isCorrect
//       };
//     });


//     const submission = await QuizSubmission.create({
//       quizId,
//       userId,
//       answers: evaluatedAnswers,
//       score
//     });

//     res.json({
//       message: "Quiz submitted successfully",
//       score,
//       total: quiz.questions.length,
//       submission
//     });
//   } catch (error) {
//     console.error("Submit Quiz Error:", error);
//     res.status(500).json({ error: "Failed to submit quiz" });
//   }
// };



// utils/rewardUtils.js

// 1️⃣ Base reward table
const rewardTable = {
  easy: { coins: 30, exp: 15 },
  medium: { coins: 50, exp: 20 },
  hard: { coins: 80, exp: 30 }
};

// 2️⃣ Speed multiplier logic
const getMultiplier = (timeTaken) => {
  if (timeTaken <= 3.75) return 1.5;   // Very Fast
  if (timeTaken <= 7.5) return 1.2;    // Fast
  if (timeTaken <= 12) return 1.0;     // Normal
  return 0.8;                          // Slow
};

// 3️⃣ Reward calculation for each question
const calculateReward = (difficulty, timeTaken, isCorrect) => {
  if (!isCorrect) return { coins: 0, exp: 0 };

  const base = rewardTable[difficulty.toLowerCase()] || { coins: 0, exp: 0 };
  const multiplier = getMultiplier(timeTaken);

  const coins = Math.round(base.coins * multiplier);
  const exp = Math.round(base.exp * multiplier);

  return { coins, exp };
};

// 4️⃣ Gem conversion (1800 coins = 1 gem)
const COINS_PER_GEM = 1800;

const getGemsFromCoins = (coins) => {
  return Math.floor(coins / COINS_PER_GEM);
};


const calculateGemReward = (previousCoins, newTotalCoins) => {
  const prevGems = Math.floor(previousCoins / COINS_PER_GEM);
  const newGems = Math.floor(newTotalCoins / COINS_PER_GEM);
  return newGems - prevGems; // new gems earned this time
};





const submitQuiz = async (req, res) => {
  try {
    const { quizId, answers } = req.body;
    const userId = req.user.login_data._id;

    const quiz = await Quiz.findById(quizId).populate("questions");
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    let score = 0;
    let totalCoins = 0;
    let totalExp = 0;

    // ✅ Evaluate answers
    const evaluatedAnswers = answers.map(ans => {
      const q = quiz.questions.find(q => q._id.toString() === ans.questionId);
      if (!q) return null;

      const isCorrect = q.correctAnswer === ans.selectedAnswer;
      const timeTaken = Math.round(ans.timeTaken || 0);

      const { coins, exp } = calculateReward(q.difficulty, timeTaken, isCorrect);

      if (isCorrect) {
        score++;
        totalCoins += coins;
        totalExp += exp;
      }

      return {
        questionId: ans.questionId,
        selectedAnswer: ans.selectedAnswer,
        isCorrect,
        timeTaken,
        coins,
        exp
      };
    }).filter(Boolean);

    // ✅ Save submission
    const submission = await QuizSubmission.create({
      quizId,
      userId,
      answers: evaluatedAnswers,
      score,
      coinsEarned: totalCoins,
      expEarned: totalExp,
    });

    // ✅ Update user wallet
    const user = await Users.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Add earned rewards
    user.coins += totalCoins;
    user.exp += totalExp;

    // ✅ Gems = coins / 1800 (live recalculation)
    user.gems = getGemsFromCoins(user.coins);

    await user.save();

    res.json({
      message: "Quiz submitted successfully",
      score,
      total: quiz.questions.length,
      coinsEarned: totalCoins,
      expEarned: totalExp,
      currentWallet: {
        coins: user.coins,
        exp: user.exp,
        gems: user.gems
      },
      submission
    });

  } catch (error) {
    console.error("❌ Submit Quiz Error:", error);
    res.status(500).json({ error: "Failed to submit quiz" });
  }
};


module.exports = { submitQuiz }