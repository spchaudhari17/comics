const OpenAI = require("openai");
const HardcoreQuiz = require("../../models/HardcoreQuiz");
const HardcoreQuizQuestion = require("../../models/HardcoreQuizQuestion");
const Comic = require("../../models/Comic");
const HardcoreQuizSubmission = require("../../models/HardcoreQuizSubmission");
const { default: mongoose } = require("mongoose");

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
                message: "Hardcore quiz already exists for this comic.",
                quizId: existingQuiz._id,
                quiz: existingQuiz,
                alreadyExists: true,
            });
        }

        // 🧩 Step 2: Prepare story text
        let storyText = "";
        if (Array.isArray(script)) {
            storyText = script
                .map((page) =>
                    page.panels
                        .map((p) => `Scene: ${p.scene || ""}. Caption: ${p.caption || ""}`)
                        .join("\n")
                )
                .join("\n\n");
        } else {
            storyText = script || "";
        }

        // 🧠 Step 3: Prompt for OpenAI
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

        // 🧩 Step 4: Generate quiz from OpenAI
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

        // 🧩 Step 5: Create new quiz
        const quiz = await HardcoreQuiz.create({
            comicId,
            user_id: req.user.login_data._id,
            status: "draft",
            mode: "hardcore",
        });

        await Comic.findByIdAndUpdate(comicId, { hasHardcoreQuiz: true });

        // 🧩 Step 6: Save questions
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
            message: "Hardcore quiz successfully created.",
            quizId: quiz._id,
            questions,
            alreadyExists: false,
        });
    } catch (error) {
        console.error("Hardcore Quiz Generation Error:", error);
        res.status(500).json({
            error: "Failed to generate hardcore quiz",
            details: error.message,
        });
    }
};



// const getHardcoreQuizByComic = async (req, res) => {
//   try {

//     const { id } = req.params; // comicId, userId (optional)

//     const userId = req.query.userId || req.params.userId;

//     // 🎯 Always fresh read from primary
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
//     let attemptedQuestionIds = [];

//     // 🧩 Check submission
//     if (userId) {
//       // 🔸 Force async queue flush before reading
//       await new Promise((r) => setImmediate(r));

//       // 🔹 Step 1 — Read from primary only
//       let submission = await HardcoreQuizSubmission.findOne({
//         quizId: quiz._id,
//         userId: new mongoose.Types.ObjectId(userId),
//       })
//         .read("primary")
//         .lean();

//       // 🔹 Step 2 — Retry fallback if not found (replica delay)
//       if (!submission) {
//         await new Promise((r) => setTimeout(r, 150));
//         submission = await HardcoreQuizSubmission.findOne({
//           quizId: quiz._id,
//           userId: new mongoose.Types.ObjectId(userId),
//         })
//           .read("primary")
//           .lean();
//       }

//       if (submission) {
//         hasAttempted = true;
//         attemptedQuestionIds = submission.answers.map((a) =>
//           a.questionId.toString()
//         );
//       }
//     }

//     // 🧠 Add hasAttempted for each question
//     const questionsWithAttemptStatus = quiz.questions.map((q) => ({
//       ...q,
//       hasAttempted: attemptedQuestionIds.includes(q._id.toString()),
//     }));

//     // ✅ Return updated response
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





// const submitHardcoreQuiz = async (req, res) => {
//     try {
//         const { quizId, answers } = req.body;
//         const userId = req.user.login_data._id;

//         // 🧠 Find the quiz and its questions
//         const quiz = await HardcoreQuiz.findById(quizId).populate("questions");
//         if (!quiz) return res.status(404).json({ error: "Hardcore Quiz not found" });

//         let score = 0;

//         // ✅ Evaluate answers
//         const evaluatedAnswers = answers.map((ans) => {
//             const q = quiz.questions.find(
//                 (q) => q._id.toString() === ans.questionId
//             );

//             const isCorrect = q?.correctAnswer === ans.selectedAnswer;
//             if (isCorrect) score++;

//             return {
//                 questionId: ans.questionId,
//                 selectedAnswer: ans.selectedAnswer,
//                 isCorrect,
//             };
//         });

//         // 🧾 Save submission
//         const submission = await HardcoreQuizSubmission.create({
//             quizId,
//             userId,
//             answers: evaluatedAnswers,
//             score,
//         });

//         res.json({
//             message: "Hardcore Quiz submitted successfully",
//             score,
//             total: quiz.questions.length,
//             submission,
//         });
//     } catch (error) {
//         console.error("Submit Hardcore Quiz Error:", error);
//         res.status(500).json({ error: "Failed to submit hardcore quiz" });
//     }
// };


// const submitHardcoreQuiz = async (req, res) => {
//   try {
//     const { quizId, questionId, selectedAnswer } = req.body;
//     const userId = req.user.login_data._id;

//     // 🧠 Find the quiz and question
//     const quiz = await HardcoreQuiz.findById(quizId).populate("questions");
//     if (!quiz) return res.status(404).json({ error: "Hardcore Quiz not found" });

//     const question = quiz.questions.find(
//       (q) => q._id.toString() === questionId
//     );

//     if (!question) {
//       return res.status(404).json({ error: "Question not found in this quiz" });
//     }

//     // ✅ Check if user has an existing submission for this quiz
//     let submission = await HardcoreQuizSubmission.findOne({
//       quizId,
//       userId,
//     });

//     if (!submission) {
//       // If no submission yet, create a new one
//       submission = await HardcoreQuizSubmission.create({
//         quizId,
//         userId,
//         answers: [],
//         score: 0,
//         coinsEarned: 0,
//         expEarned: 0,
//       });
//     }

//     // ❌ Prevent double submission for the same question
//     const alreadyAnswered = submission.answers.some(
//       (a) => a.questionId.toString() === questionId
//     );
//     if (alreadyAnswered) {
//       return res.status(400).json({
//         message: "You have already submitted this question.",
//       });
//     }

//     // 🧮 Evaluate this question
//     const isCorrect = question.correctAnswer === selectedAnswer;

//     // 🎯 Calculate reward points (you can adjust this logic)
//     const coins = isCorrect
//       ? question.difficulty === "extreme"
//         ? 20
//         : 10
//       : 0;
//     const exp = isCorrect
//       ? question.difficulty === "extreme"
//         ? 15
//         : 8
//       : 0;

//     if (isCorrect) submission.score += 1;
//     submission.coinsEarned += coins;
//     submission.expEarned += exp;

//     // Add this question's answer
//     submission.answers.push({
//       questionId,
//       selectedAnswer,
//       isCorrect,
//       coins,
//       exp,
//     });

//     await submission.save();

//     // 🧾 Find next question (if any)
//     const currentIndex = quiz.questions.findIndex(
//       (q) => q._id.toString() === questionId
//     );
//     const nextQuestion = quiz.questions[currentIndex + 1] || null;

//     // ✅ Return response
//     res.json({
//       message: "Question submitted successfully.",
//       currentQuestion: {
//         questionId,
//         isCorrect,
//         correctAnswer: question.correctAnswer,
//         explanation: question.explanation,
//         hint: question.hint,
//         coins,
//         exp,
//       },
//       nextQuestion: nextQuestion
//         ? {
//             id: nextQuestion._id,
//             question: nextQuestion.question,
//             options: nextQuestion.options,
//             difficulty: nextQuestion.difficulty,
//           }
//         : null,
//       quizCompleted: !nextQuestion,
//       currentScore: submission.score,
//       totalQuestions: quiz.questions.length,
//       coinsEarned: submission.coinsEarned,
//       expEarned: submission.expEarned,
//     });
//   } catch (error) {
//     console.error("Submit Hardcore Question Error:", error);
//     res.status(500).json({
//       error: "Failed to submit hardcore question",
//       details: error.message,
//     });
//   }
// };


const getHardcoreQuizByComic = async (req, res) => {
    try {
        const { id } = req.params; // comicId
        const userId = req.query.userId || req.params.userId;

        // 🎯 Always fresh read from primary
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
        let attemptedAnswers = {}; // 👈 map of questionId → selectedAnswer

        // 🧩 Check submission
        if (userId) {
            await new Promise((r) => setImmediate(r));

            let submission = await HardcoreQuizSubmission.findOne({
                quizId: quiz._id,
                userId: new mongoose.Types.ObjectId(userId),
            })
                .read("primary")
                .lean();

            // Retry fallback (replica delay)
            if (!submission) {
                await new Promise((r) => setTimeout(r, 150));
                submission = await HardcoreQuizSubmission.findOne({
                    quizId: quiz._id,
                    userId: new mongoose.Types.ObjectId(userId),
                })
                    .read("primary")
                    .lean();
            }

            if (submission) {
                hasAttempted = true;

                // 👇 Store answers in a map for quick lookup
                for (const ans of submission.answers) {
                    attemptedAnswers[ans.questionId.toString()] = {
                        selectedAnswer: ans.selectedAnswer,
                        isCorrect: ans.isCorrect,
                    };
                }
            }
        }

        // 🧠 Combine question data with attempt info
        const questionsWithAttemptStatus = quiz.questions.map((q) => {
            const attempt = attemptedAnswers[q._id.toString()];
            return {
                ...q,
                hasAttempted: !!attempt,
                selectedAnswer: attempt ? attempt.selectedAnswer : null,
                isCorrect: attempt ? attempt.isCorrect : null, // 👈 optional if you want
            };
        });

        // ✅ Return response
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



const submitHardcoreQuiz = async (req, res) => {
    try {
        const { quizId, questionId, selectedAnswer } = req.body;
        const userId = req.user.login_data._id;

        //  Find the quiz and question
        const quiz = await HardcoreQuiz.findById(quizId).populate("questions");
        if (!quiz) return res.status(404).json({ error: "Hardcore Quiz not found" });

        const question = quiz.questions.find(
            (q) => q._id.toString() === questionId
        );

        if (!question) {
            return res.status(404).json({ error: "Question not found in this quiz" });
        }

        //  Check if user has an existing submission for this quiz
        let submission = await HardcoreQuizSubmission.findOne({
            quizId,
            userId,
        });

        if (!submission) {
            // If no submission yet, create a new one
            submission = await HardcoreQuizSubmission.create({
                quizId,
                userId,
                answers: [],
                score: 0,
                coinsEarned: 0,
                expEarned: 0,
            });
        }

        //  Prevent double submission for the same question
        // const alreadyAnswered = submission.answers.some(
        //   (a) => a.questionId.toString() === questionId
        // );

        // if (alreadyAnswered) {
        //   return res.status(400).json({
        //     message: "You have already submitted this question.",
        //   });
        // }

        //  Evaluate this question
        const isCorrect = question.correctAnswer === selectedAnswer;

        //  Calculate reward points (you can adjust this logic)
        const coins = isCorrect
            ? question.difficulty === "extreme"
                ? 20
                : 10
            : 0;
        const exp = isCorrect
            ? question.difficulty === "extreme"
                ? 15
                : 8
            : 0;

        // Update submission totals
        if (isCorrect) submission.score += 1;
        submission.coinsEarned += coins;
        submission.expEarned += exp;

        // Add this question's answer
        submission.answers.push({
            questionId,
            selectedAnswer,
            isCorrect,
            coins,
            exp,
        });

        await submission.save();

        // ✅ Return only current question result (no next question)
        res.json({
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
        });
    } catch (error) {
        console.error("Submit Hardcore Question Error:", error);
        res.status(500).json({
            error: "Failed to submit hardcore question",
            details: error.message,
        });
    }
};




module.exports = { generateHardcoreQuiz, getHardcoreQuizByComic, submitHardcoreQuiz };