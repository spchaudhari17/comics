const OpenAI = require("openai");
const HardcoreQuiz = require("../../models/HardcoreQuiz");
const HardcoreQuizQuestion = require("../../models/HardcoreQuizQuestion");
const Comic = require("../../models/Comic");
const HardcoreQuizSubmission = require("../../models/HardcoreQuizSubmission");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const generateHardcoreQuiz = async (req, res) => {
    const { comicId, script, subject, concept, grade } = req.body;

    try {
        let storyText = "";
        if (Array.isArray(script)) {
            storyText = script
                .map(page =>
                    page.panels
                        .map(p => `Scene: ${p.scene || ""}. Caption: ${p.caption || ""}`)
                        .join("\n")
                )
                .join("\n\n");
        } else {
            storyText = script || "";
        }

        const prompt = `
You are an expert educational AI. Create a **hardcore-level quiz**.

Context:
- Subject: ${subject}
- Concept: ${concept}
- Grade: ${grade}
- Reference Story (ignore dialogues):
${storyText}

Instructions:
- Create 5 very challenging MCQs.
- Questions should require deep conceptual reasoning, analysis, and problem-solving.
- Each question must have:
  • 1 correct answer
  • 3 difficult distractors
  • A brief explanation of the correct answer
   • A short hint to guide the student (but without revealing the answer)
- Difficulty: only "hard" or "extreme".
- Return valid JSON only.

Format:
[
  {
    "question": "string",
    "options": ["opt1", "opt2", "opt3", "opt4"],
    "correctAnswer": "string",
    "difficulty": "hard|extreme",
    "explanation": "string",
     "hint": "string"
  }
]
`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "Return valid JSON only, no markdown." },
                { role: "user", content: prompt },
            ],
            temperature: 0.7,
            max_tokens: 900,
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

        const quiz = await HardcoreQuiz.create({
            comicId,
            user_id: req.user.login_data._id,
            status: "draft",
        });

        await Comic.findByIdAndUpdate(comicId, { hasHardcoreQuiz: true });

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

        res.json({ quizId: quiz._id, questions });
    } catch (error) {
        console.error("Hardcore Quiz Generation Error:", error);
        res.status(500).json({
            error: "Failed to generate hardcore quiz",
            details: error.message,
        });
    }
};


const getHardcoreQuizByComic = async (req, res) => {
    try {
        const { id, userId } = req.params; // comicId, userId (optional)

        // Find quiz
        const quiz = await HardcoreQuiz.findOne({ comicId: id })
            .populate("questions")
            .lean();

        if (!quiz) {
            return res.status(404).json({ error: "Hardcore Quiz not found" });
        }

        let hasAttempted = false;

        // Check if user attempted
        if (userId) {
            const submission = await HardcoreQuizSubmission.findOne({
                quizId: quiz._id,
                userId: new mongoose.Types.ObjectId(userId),
            });
            hasAttempted = !!submission;
        }

        res.json({ quiz, hasAttempted });
    } catch (error) {
        console.error("Error fetching Hardcore Quiz:", error);
        res.status(500).json({ error: "Failed to fetch hardcore quiz" });
    }
};



const submitHardcoreQuiz = async (req, res) => {
    try {
        const { quizId, answers } = req.body;
        const userId = req.user.login_data._id;

        // 🧠 Find the quiz and its questions
        const quiz = await HardcoreQuiz.findById(quizId).populate("questions");
        if (!quiz) return res.status(404).json({ error: "Hardcore Quiz not found" });

        let score = 0;

        // ✅ Evaluate answers
        const evaluatedAnswers = answers.map((ans) => {
            const q = quiz.questions.find(
                (q) => q._id.toString() === ans.questionId
            );

            const isCorrect = q?.correctAnswer === ans.selectedAnswer;
            if (isCorrect) score++;

            return {
                questionId: ans.questionId,
                selectedAnswer: ans.selectedAnswer,
                isCorrect,
            };
        });

        // 🧾 Save submission
        const submission = await HardcoreQuizSubmission.create({
            quizId,
            userId,
            answers: evaluatedAnswers,
            score,
        });

        res.json({
            message: "Hardcore Quiz submitted successfully",
            score,
            total: quiz.questions.length,
            submission,
        });
    } catch (error) {
        console.error("Submit Hardcore Quiz Error:", error);
        res.status(500).json({ error: "Failed to submit hardcore quiz" });
    }
};



module.exports = { generateHardcoreQuiz, getHardcoreQuizByComic, submitHardcoreQuiz };
