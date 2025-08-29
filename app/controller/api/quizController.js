
const OpenAI = require("openai");
const axios = require("axios");
const { upload_files, deleteFiles } = require("../../../helper/helper");
const sharp = require("sharp");
const PDFDocument = require("pdfkit");
const Quiz = require("../../models/Quiz");
const QuizQuestion = require("../../models/QuizQuestion");
const Comic = require("../../models/Comic");



const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const generateQuiz = async (req, res) => {
    const { comicId, script } = req.body;

    try {
        const prompt = `
        You are an educational quiz generator.
        Based on the following comic script, generate 5 multiple-choice questions.
        - Each question should test conceptual understanding.
        - Each question must have 1 correct answer and 3 incorrect but plausible answers.
        - Label each with a difficulty (easy, medium, hard).
        - Return in JSON format only.

        Script:
        ${script}

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
            // model: "gpt-4o",
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.5,
            max_tokens: 1000,
        });

        let raw = response.choices[0].message.content.trim();
        if (raw.startsWith("```")) {
            raw = raw.replace(/```json|```/g, "").trim();
        }

        const questions = JSON.parse(raw);

        // Save Quiz in DB
        const quiz = await Quiz.create({
            comicId,
            user_id: req.user.login_data._id,
            status: "draft",
        });

        // mark comic as having quiz
        await Comic.findByIdAndUpdate(comicId, { hasQuiz: true });

        // Save Questions
        const savedQuestions = await Promise.all(
            questions.map(async (q) => {
                const qq = await QuizQuestion.create({
                    quizId: quiz._id,
                    question: q.question,
                    options: q.options,
                    correctAnswer: q.correctAnswer,
                    difficulty: q.difficulty,
                });
                return qq._id;
            })
        );

        quiz.questions = savedQuestions;
        await quiz.save();

        res.json({ quizId: quiz._id, questions });
    } catch (error) {
        console.error("Quiz Generation Error:", error);
        res.status(500).json({ error: "Failed to generate quiz" });
    }
};


const getQuizByComic = async (req, res) => {
    try {
        const { id } = req.params;
        const quiz = await Quiz.findOne({ comicId: id }).populate("questions");

        if (!quiz) return res.status(404).json({ error: "Quiz not found" });

        res.json({ quiz });
    } catch (error) {
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
