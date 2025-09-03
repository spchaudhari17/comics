const Quiz = require("../../models/Quiz");
const QuizQuestion = require("../../models/QuizQuestion");
const QuizSubmission = require("../../models/QuizSubmission");

const submitQuiz = async (req, res) => {
  try {
    const { quizId, answers } = req.body; 
 

    const userId = req.user.login_data._id;


    const quiz = await Quiz.findById(quizId).populate("questions");
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    let score = 0;
    const evaluatedAnswers = answers.map(ans => {
      const q = quiz.questions.find(q => q._id.toString() === ans.questionId);
      const isCorrect = q?.correctAnswer === ans.selectedAnswer;
      if (isCorrect) score++;
      return {
        questionId: ans.questionId,
        selectedAnswer: ans.selectedAnswer,
        isCorrect
      };
    });

   
    const submission = await QuizSubmission.create({
      quizId,
      userId,
      answers: evaluatedAnswers,
      score
    });

    res.json({
      message: "Quiz submitted successfully",
      score,
      total: quiz.questions.length,
      submission
    });
  } catch (error) {
    console.error("Submit Quiz Error:", error);
    res.status(500).json({ error: "Failed to submit quiz" });
  }
};


module.exports = {submitQuiz}