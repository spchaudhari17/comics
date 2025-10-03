const Quiz = require("../../models/Quiz");
const QuizQuestion = require("../../models/QuizQuestion");
const QuizSubmission = require("../../models/QuizSubmission");

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


// Difficulty base rewards


const rewardTable = {
  easy: { coins: 30, exp: 15 },
  medium: { coins: 50, exp: 20 },
  hard: { coins: 80, exp: 30 }
};

// Speed multipliers
const getMultiplier = (timeTaken) => {
  if (timeTaken <= 3.75) return 1.5;   // Very Fast
  if (timeTaken <= 7.5) return 1.2;    // Fast
  if (timeTaken <= 12) return 1.0;     // Normal
  return 0.8;                          // Slow
};


const submitQuiz = async (req, res) => {
  try {
    const { quizId, answers } = req.body;
    const userId = req.user.login_data._id;

    // Get quiz with questions
    const quiz = await Quiz.findById(quizId).populate("questions");
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    let score = 0;
    let totalCoins = 0;
    let totalExp = 0;

    const evaluatedAnswers = answers.map(ans => {
      const q = quiz.questions.find(q => q._id.toString() === ans.questionId);
      if (!q) return null;

      const isCorrect = q.correctAnswer === ans.selectedAnswer;
      let coins = 0, exp = 0;

      // Round time taken (frontend already sends in seconds)
      const timeTaken = Math.round(ans.timeTaken || 0);

      if (isCorrect) {
        score++;

        // Base rewards
        const reward = rewardTable[q.difficulty.toLowerCase()] || { coins: 0, exp: 0 };

        // Speed multiplier
        const multiplier = getMultiplier(timeTaken);

        // Final reward
        coins = Math.round(reward.coins * multiplier);
        exp = Math.round(reward.exp * multiplier);

        totalCoins += coins;
        totalExp += exp;
      }

      return {
        questionId: ans.questionId,
        selectedAnswer: ans.selectedAnswer,
        isCorrect,
        timeTaken,  // already rounded
        coins,
        exp
      };
    }).filter(Boolean);



    // Save submission
    const submission = await QuizSubmission.create({
      quizId,
      userId,
      answers: evaluatedAnswers,
      score,
      coinsEarned: totalCoins,
      expEarned: totalExp,
    });

    // Final response
    res.json({
      message: "Quiz submitted successfully",
      score,
      total: quiz.questions.length,
      coinsEarned: totalCoins,
      expEarned: totalExp,
      submission
    });
  } catch (error) {
    console.error("❌ Submit Quiz Error:", error);
    res.status(500).json({ error: "Failed to submit quiz" });
  }
};


module.exports = { submitQuiz }