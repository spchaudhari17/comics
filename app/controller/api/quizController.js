
const OpenAI = require("openai");
const axios = require("axios");
const { upload_files, deleteFiles } = require("../../../helper/helper");
const sharp = require("sharp");
const PDFDocument = require("pdfkit");
const Quiz = require("../../models/Quiz");
const QuizQuestion = require("../../models/QuizQuestion");
const Comic = require("../../models/Comic");
const QuizSubmission = require("../../models/QuizSubmission");



const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});


//old code working fine
// const generateQuiz = async (req, res) => {
//     const { comicId, script } = req.body;

//     try {
//         const prompt = `
//         You are an educational quiz generator.
//         Based on the following comic script, generate 5 multiple-choice questions.
//         - Each question should test conceptual understanding.
//         - Each question must have 1 correct answer and 3 incorrect but plausible answers.
//         - Label each with a difficulty (easy, medium, hard).
//         - Return in JSON format only.

//         Script:
//         ${script}

//         Format:
//         [
//           {
//             "question": "string",
//             "options": ["opt1", "opt2", "opt3", "opt4"],
//             "correctAnswer": "string",
//             "difficulty": "easy|medium|hard"
//           }
//         ]
//         `;

//         const response = await openai.chat.completions.create({
//             // model: "gpt-4o",
//             model: "gpt-3.5-turbo",
//             messages: [{ role: "user", content: prompt }],
//             temperature: 0.5,
//             max_tokens: 1000,
//         });

//         let raw = response.choices[0].message.content.trim();
//         if (raw.startsWith("```")) {
//             raw = raw.replace(/```json|```/g, "").trim();
//         }

//         const questions = JSON.parse(raw);

//         // Save Quiz in DB
//         const quiz = await Quiz.create({
//             comicId,
//             user_id: req.user.login_data._id,
//             status: "draft",
//         });

//         // mark comic as having quiz
//         await Comic.findByIdAndUpdate(comicId, { hasQuiz: true });

//         // Save Questions
//         const savedQuestions = await Promise.all(
//             questions.map(async (q) => {
//                 const qq = await QuizQuestion.create({
//                     quizId: quiz._id,
//                     question: q.question,
//                     options: q.options,
//                     correctAnswer: q.correctAnswer,
//                     difficulty: q.difficulty,
//                 });
//                 return qq._id;
//             })
//         );

//         quiz.questions = savedQuestions;
//         await quiz.save();

//         res.json({ quizId: quiz._id, questions });
//     } catch (error) {
//         console.error("Quiz Generation Error:", error);
//         res.status(500).json({ error: "Failed to generate quiz" });
//     }
// };



const generateQuiz = async (req, res) => {
  const { comicId, script } = req.body;

  try {
    // -------- Clean script (skip dialogues) --------
    let storyText = "";
    if (Array.isArray(script)) {
      storyText = script
        .map(page =>
          page.panels
            .map(p => `Scene: ${p.scene}. Caption: ${p.caption || ""}`)
            .join("\n")
        )
        .join("\n\n");
    } else {
      storyText = script;
    }

    // -------- Prompt --------
    const prompt = `
    You are an educational quiz generator.
    Based on the following comic content, generate 5 multiple-choice questions.
    - Each question should test conceptual understanding (not characters or dialogues).
    - Each question must have 1 correct answer and 3 incorrect but plausible answers.
    - Label each with a difficulty (easy, medium, hard).
    - Return ONLY valid JSON.

    Content:
    ${storyText}

    Format:
    [
      {
        "question": "string",
        "options": ["opt1", "opt2", "opt3", "opt4"],
        "correctAnswer": "string",
        "difficulty": "easy|medium|hard"
      }
    ]
    `;

    const response = await openai.chat.completions.create({
    //   model: "gpt-3.5-turbo",
      model: "gpt-4o",
      messages: [
        { role: "system", content: "You are a strict JSON generator. Always return only valid JSON that can be parsed." },
        { role: "user", content: prompt }
      ],
      temperature: 0.5,
      max_tokens: 1000,
    });

    // -------- Parse response --------
    let raw = response.choices[0].message.content.trim();
    if (raw.startsWith("```")) raw = raw.replace(/```json|```/g, "").trim();

    let questions;
    try {
      questions = JSON.parse(raw);
      if (!Array.isArray(questions)) throw new Error("Not an array");
    } catch (err) {
      return res.status(500).json({ error: "Invalid JSON from OpenAI", details: err.message });
    }

    // -------- Create Quiz --------
    const quiz = await Quiz.create({
      comicId,
      user_id: req.user.login_data._id,
      status: "draft",
    });

    // Mark comic as having quiz
    await Comic.findByIdAndUpdate(comicId, { hasQuiz: true });

    // -------- Save Questions --------
    const savedQuestions = [];
    for (const q of questions) {
      if (!q.question || !q.options || !q.correctAnswer) continue; // skip invalid
      const newQ = await QuizQuestion.create({
        quizId: quiz._id,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        difficulty: q.difficulty || "medium",
      });
      savedQuestions.push(newQ._id);
    }

    quiz.questions = savedQuestions;
    await quiz.save();

    res.json({ quizId: quiz._id, questions });
  } catch (error) {
    console.error("Quiz Generation Error:", error);
    res.status(500).json({ error: "Failed to generate quiz", details: error.message });
  }
};



// const getQuizByComic = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const quiz = await Quiz.findOne({ comicId: id }).populate("questions");

//         if (!quiz) return res.status(404).json({ error: "Quiz not found" });

//         res.json({ quiz });
//     } catch (error) {
//         res.status(500).json({ error: "Failed to fetch quiz" });
//     }
// };


const getQuizByComic = async (req, res) => {
  try {
    const { id } = req.params;       // comicId
    const {userId} = req.params     // userId

    // Quiz nikalna
    const quiz = await Quiz.findOne({ comicId: id }).populate("questions");
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    // Check agar user ne attempt kiya hai
    let hasAttempted = false;
    if (userId) {
      const submission = await QuizSubmission.findOne({
        quizId: quiz._id,
        userId: userId,
      });

      hasAttempted = !!submission;
    }

    res.json({
      quiz,
      hasAttempted, 
    });
  } catch (error) {
    console.error("Error fetching quiz:", error);
    res.status(500).json({ error: "Failed to fetch quiz" });
  }
};


const publishQuiz = async (req, res) => {
    try {
        const { quizId } = req.body;

        const quiz = await Quiz.findOneAndUpdate(
            { _id: quizId, user_id: req.user.login_data._id },
            { status: "published" },
            { new: true }
        );

        if (!quiz) return res.status(404).json({ error: "Quiz not found or unauthorized" });

        res.json({ message: "Quiz published successfully", quiz });
    } catch (error) {
        res.status(500).json({ error: "Failed to publish quiz" });
    }
};


module.exports = { generateQuiz, getQuizByComic, publishQuiz }
