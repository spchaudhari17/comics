
const mongoose = require("mongoose");
const User = require("../../models/User");
const Comic = require("../../models/Comic");
const ComicView = require("../../models/ComicView");
const Quiz = require("../../models/Quiz");
const QuizSubmission = require("../../models/QuizSubmission");
const HardcoreQuiz = require("../../models/HardcoreQuiz");
const HardcoreQuizSubmission = require("../../models/HardcoreQuizSubmission");

// Utility: convert array -> map by _id
const arrayToMap = (arr) =>
    arr.reduce((acc, item) => {
        acc[item._id.toString()] = item;
        return acc;
    }, {});

const getChildActivity = async (req, res) => {
    try {
        const { childId } = req.body;

        if (!mongoose.Types.ObjectId.isValid(childId)) {
            return res.status(400).json({ error: "Invalid childId" });
        }

        // 1️⃣ Child info
        const child = await User.findById(childId).lean();
        if (!child) {
            return res.status(404).json({ error: "Child not found" });
        }

        // ---------------------------------------------------
        // 2️⃣ Fetch raw data in parallel
        // ---------------------------------------------------
        const [views, quizSubs, hardcoreSubs] = await Promise.all([
            ComicView.find({ userId: childId })
                .populate("comicId", "title subject concept thumbnailUrl createdAt")
                .lean(),

            QuizSubmission.find({ userId: childId })
                .populate("quizId", "comicId")
                .lean(),

            HardcoreQuizSubmission.find({ userId: childId })
                .populate("quizId", "comicId")
                .sort({ createdAt: -1 })
                .lean(),
        ]);

        // ---------------------------------------------------
        // 3️⃣ Collect all comicIds used in quizzes & hardcore
        // ---------------------------------------------------
        const quizComicIds = quizSubs
            .filter((s) => s.quizId && s.quizId.comicId)
            .map((s) => s.quizId.comicId.toString());

        const hardcoreComicIds = hardcoreSubs
            .filter((s) => s.quizId && s.quizId.comicId)
            .map((s) => s.quizId.comicId.toString());

        const viewedComicIds = views
            .filter((v) => v.comicId)
            .map((v) => v.comicId._id.toString());

        const allComicIds = Array.from(
            new Set([...quizComicIds, ...hardcoreComicIds, ...viewedComicIds])
        ).map((id) => new mongoose.Types.ObjectId(id));

        const comics = await Comic.find({ _id: { $in: allComicIds } })
            .select("title subject concept thumbnailUrl seriesId partNumber")
            .lean();

        const comicsMap = arrayToMap(comics);

        // ---------------------------------------------------
        // 4️⃣ Comic views activity
        // ---------------------------------------------------
        const comicsViewed = views
            .filter((v) => v.comicId)
            .map((v) => ({
                comicId: v.comicId._id,
                title: v.comicId.title,
                subject: v.comicId.subject,
                concept: v.comicId.concept,
                thumbnail: v.comicId.thumbnailUrl,
                viewedAt: v.createdAt,
            }));

        // ---------------------------------------------------
        // 5️⃣ Normal quiz activity
        // ---------------------------------------------------
        const normalQuizActivity = quizSubs
            .filter((sub) => sub.quizId && sub.quizId.comicId)
            .map((sub) => {
                const comic = comicsMap[sub.quizId.comicId.toString()];
                return {
                    quizId: sub.quizId._id,
                    comicId: comic?._id,
                    title: comic?.title,
                    subject: comic?.subject,
                    concept: comic?.concept,
                    thumbnail: comic?.thumbnailUrl || null,
                    score: sub.score,
                    coinsEarned: sub.coinsEarned,
                    expEarned: sub.expEarned,
                    submittedAt: sub.submittedAt,
                };
            });

        // ---------------------------------------------------
        // 6️⃣ Hardcore quiz activity
        // ---------------------------------------------------
        const hardcoreQuizActivity = hardcoreSubs
            .filter((sub) => sub.quizId && sub.quizId.comicId)
            .map((sub) => {
                const comic = comicsMap[sub.quizId.comicId.toString()];

                let status = "active";
                if (sub.isFinished) {
                    status = sub.score > 0 ? "completed" : "failed";
                }

                return {
                    quizId: sub.quizId._id,
                    comicId: comic?._id,
                    title: comic?.title,
                    subject: comic?.subject,
                    concept: comic?.concept,
                    thumbnail: comic?.thumbnailUrl || null,

                    attemptNumber: sub.attemptNumber,
                    score: sub.score,
                    coinsEarned: sub.coinsEarned,
                    expEarned: sub.expEarned,
                    status,
                    submittedAt: sub.createdAt,
                };
            });

        // ---------------------------------------------------
        // 7️⃣ Wallet & Rewards summary
        // ---------------------------------------------------
        const wallet = {
            coins: child.coins || 0,
            exp: child.exp || 0,
            gems: child.gems || 0,
        };

        const totalCoinsFromNormal = normalQuizActivity.reduce(
            (sum, q) => sum + (q.coinsEarned || 0),
            0
        );
        const totalCoinsFromHardcore = hardcoreQuizActivity.reduce(
            (sum, q) => sum + (q.coinsEarned || 0),
            0
        );

        const totalExpFromNormal = normalQuizActivity.reduce(
            (sum, q) => sum + (q.expEarned || 0),
            0
        );
        const totalExpFromHardcore = hardcoreQuizActivity.reduce(
            (sum, q) => sum + (q.expEarned || 0),
            0
        );

        const rewardsInsight = {
            totalCoinsEarned: totalCoinsFromNormal + totalCoinsFromHardcore,
            totalCoinsNormal: totalCoinsFromNormal,
            totalCoinsHardcore: totalCoinsFromHardcore,
            totalExpEarned: totalExpFromNormal + totalExpFromHardcore,
            currentWallet: wallet,
        };

        // ---------------------------------------------------
        // 8️⃣ Progress & performance summary
        // ---------------------------------------------------
        const progressSummary = {
            totalComicsViewed: comicsViewed.length,
            totalNormalQuizzesAttempted: normalQuizActivity.length,
            totalHardcoreQuizzesAttempted: hardcoreQuizActivity.length,
            overallEngagementScore:
                comicsViewed.length * 2 +
                normalQuizActivity.length * 5 +
                hardcoreQuizActivity.length * 10,
        };

        // Subject-wise breakdown (for dashboard graphs)
        const subjectStatsMap = {};
        comicsViewed.forEach((c) => {
            if (!c.subject) return;
            const key = c.subject;
            if (!subjectStatsMap[key]) {
                subjectStatsMap[key] = {
                    subject: key,
                    comicsViewed: 0,
                    quizzesAttempted: 0,
                    hardcoreAttempted: 0,
                    coinsEarned: 0,
                };
            }
            subjectStatsMap[key].comicsViewed += 1;
        });

        normalQuizActivity.forEach((q) => {
            if (!q.subject) return;
            const key = q.subject;
            if (!subjectStatsMap[key]) {
                subjectStatsMap[key] = {
                    subject: key,
                    comicsViewed: 0,
                    quizzesAttempted: 0,
                    hardcoreAttempted: 0,
                    coinsEarned: 0,
                };
            }
            subjectStatsMap[key].quizzesAttempted += 1;
            subjectStatsMap[key].coinsEarned += q.coinsEarned || 0;
        });

        hardcoreQuizActivity.forEach((q) => {
            if (!q.subject) return;
            const key = q.subject;
            if (!subjectStatsMap[key]) {
                subjectStatsMap[key] = {
                    subject: key,
                    comicsViewed: 0,
                    quizzesAttempted: 0,
                    hardcoreAttempted: 0,
                    coinsEarned: 0,
                };
            }
            subjectStatsMap[key].hardcoreAttempted += 1;
            subjectStatsMap[key].coinsEarned += q.coinsEarned || 0;
        });

        const subjectStats = Object.values(subjectStatsMap);

        // ---------------------------------------------------
        // ✅ FINAL RESPONSE
        // ---------------------------------------------------
        res.json({
            child: {
                id: child._id,
                // firstname: child.firstname,
                // lastname: child.lastname,
                username:child.username,
                grade: child.grade,
                country: child.country,
            },
            wallet,
            progressSummary,
            rewardsInsight,
            subjectStats,
            activity: {
                comicsViewed,
                normalQuizzes: normalQuizActivity,
                hardcoreQuizzes: hardcoreQuizActivity,
            },
        });
    } catch (error) {
        console.error("❌ getChildActivity Error:", error);
        res.status(500).json({ error: "Failed to fetch child activity" });
    }
};

module.exports = { getChildActivity };
