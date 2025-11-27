const Quiz = require("../../models/Quiz");
const QuizQuestion = require("../../models/QuizQuestion");
const QuizSubmission = require("../../models/QuizSubmission");
const User = require("../../models/User");


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

    // 🔍 1. Validate quiz
    const quiz = await Quiz.findById(quizId).populate("questions");
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    // 🧩 2. Check if already attempted
    const existingSubmission = await QuizSubmission.findOne({ quizId, userId });
    const isFirstAttempt = !existingSubmission;

    let score = 0;
    let totalCoins = 0;
    let totalExp = 0;

    // 🧠 3. Evaluate answers
    const evaluatedAnswers = answers.map((ans) => {
      const q = quiz.questions.find((q) => q._id.toString() === ans.questionId);
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
        exp,
      };
    }).filter(Boolean);

    // 💾 4. Save or update submission
    let submission;
    if (existingSubmission) {
      // Already attempted → update existing submission (but no rewards)
      submission = await QuizSubmission.findByIdAndUpdate(
        existingSubmission._id,
        {
          $set: {
            answers: evaluatedAnswers,
            score,
            updatedAt: new Date(),
          },
        },
        { new: true }
      );
    } else {
      // First attempt → create new submission
      submission = await QuizSubmission.create({
        quizId,
        userId,
        answers: evaluatedAnswers,
        score,
        coinsEarned: totalCoins,
        expEarned: totalExp,
      });
    }

    // 👛 5. Reward user only for first attempt
    let coinsEarned = 0;
    let expEarned = 0;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (isFirstAttempt) {
      coinsEarned = totalCoins;
      expEarned = totalExp;

      user.coins += totalCoins;
      user.exp += totalExp;
      user.gems = getGemsFromCoins(user.coins);

      await user.save();
    }

    // 🎯 6. Response (same format)
    res.json({
      message: "Quiz submitted successfully",
      score,
      total: quiz.questions.length,
      coinsEarned,
      expEarned,
      currentWallet: {
        coins: user.coins,
        exp: user.exp,
        gems: user.gems,
      },
      submission: {
        _id: submission._id,
        quizId: submission.quizId,
        userId: submission.userId,
        answers: submission.answers,
        score: submission.score,
        coinsEarned: submission.coinsEarned,
        expEarned: submission.expEarned,
        submittedAt: submission.createdAt || submission.submittedAt || new Date(),
        __v: submission.__v || 0,
      },
    });
  } catch (error) {
    console.error("❌ Submit Quiz Error:", error);
    res.status(500).json({ error: "Failed to submit quiz" });
  }
};


// for kitne bi baar api ko call karega tab hai double coins add hote rayenge
// const doubleRewards = async (req, res) => {
//   try {
//     const { quizId } = req.body;
//     const userId = req.user.login_data._id;

//     // 1️⃣ Find previous submission
//     const submission = await QuizSubmission.findOne({ quizId, userId });

//     if (!submission) {
//       return res.status(400).json({
//         error: true,
//         message: "Quiz not attempted yet. Cannot double rewards."
//       });
//     }

//     // 2️⃣ Calculate double rewards
//     const doubleScore = submission.score * 2;
//     const doubleCoins = submission.coinsEarned * 2;
//     const doubleExp = submission.expEarned * 2;

//     // 3️⃣ Update user wallet
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({ error: "User not found" });
//     }

//     // Add double rewards into wallet
//     user.coins += doubleCoins;
//     user.exp += doubleExp;

//     // Update gems
//     const prevGems = user.gems;

//     await user.save();

//     // 4️⃣ Update submission (optional: mark as doubled)
//     submission.score = doubleScore;
//     submission.coinsEarned += doubleCoins;
//     submission.expEarned += doubleExp;
//     submission.isDoubleRewardApplied = true;
//     await submission.save();

//     // 5️⃣ Return new wallet & doubled rewards
//     return res.json({
//       message: "Rewards doubled successfully!",
//       doubled: {
//         score: doubleScore,
//         coins: doubleCoins,
//         exp: doubleExp,
//         newGemsEarned: user.gems - prevGems
//       },
//       currentWallet: {
//         coins: user.coins,
//         exp: user.exp,
//         gems: user.gems
//       }
//     });

//   } catch (error) {
//     console.error("❌ Double Reward Error:", error);
//     res.status(500).json({ error: "Failed to apply double rewards" });
//   }
// };

// sirf ek hi baar coins double hoga
const doubleRewards = async (req, res) => {
  try {
    const { quizId } = req.body;
    const userId = req.user.login_data._id;

    // 1️⃣ Get submission
    const submission = await QuizSubmission.findOne({ quizId, userId });

    if (!submission) {
      return res.status(400).json({
        error: true,
        message: "You must attempt the quiz first to apply double rewards."
      });
    }

    // 2️⃣ Already applied? stop here
    if (submission.isDoubleRewardApplied === true) {
      const user = await User.findById(userId);

      return res.json({
        error: false,
        message: "Double reward already applied.",
        coinsEarned: 0,
        expEarned: 0,
        score: submission.score,
        currentWallet: {
          coins: user.coins,
          exp: user.exp,
          gems: user.gems,
        }
      });
    }

    // 3️⃣ Calculate double
    const doubleScore = submission.score * 2;
    const doubleCoins = submission.coinsEarned;
    const doubleExp = submission.expEarned;

    // 4️⃣ Update submission with double reward
    submission.score = doubleScore;
    submission.isDoubleRewardApplied = true;
    await submission.save();

    // 5️⃣ Update user wallet
    const user = await User.findById(userId);
    user.coins += doubleCoins;
    user.exp += doubleExp;
    await user.save();

    return res.json({
      error: false,
      message: "Double Rewards applied successfully!",
      score: doubleScore,
      coinsEarned: doubleCoins,
      expEarned: doubleExp,
      currentWallet: {
        coins: user.coins,
        exp: user.exp,
        gems: user.gems,
      }
    });

  } catch (error) {
    console.error("❌ Double Reward Error:", error);
    res.status(500).json({ error: "Failed to apply double rewards" });
  }
};






module.exports = { submitQuiz, doubleRewards }