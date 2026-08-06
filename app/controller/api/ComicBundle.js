const ComicBundle = require("../../models/ComicBundle");
const Comic = require("../../models/Comic");
const Purchase = require("../../models/Purchase");
const ComicPage = require("../../models/ComicPage");
const FAQ = require("../../models/FAQ");
const DidYouKnow = require("../../models/DidYouKnow");
const Quiz = require("../../models/Quiz");
const HardcoreQuiz = require("../../models/HardcoreQuiz");
const BundleRating = require("../../models/BundleRating");
const User = require("../../models/User");
const ComicSeries = require("../../models/ComicSeries");

const createBundle = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const { title, description, comics, price } = req.body;

        // ✅ validations
        if (!title || !comics || comics.length === 0 || !price) {
            return res.status(400).json({
                error: true,
                message: "Title, comics and price are required"
            });
        }

        // ✅ check comics exist
        const foundComics = await Comic.find({
            _id: { $in: comics },
            user_id: userId
        });

        if (foundComics.length !== comics.length) {
            return res.status(400).json({
                error: true,
                message: "Invalid comics or not owned by teacher"
            });
        }

        // ✅ create bundle
        const bundle = await ComicBundle.create({
            title,
            description,
            teacherId: userId,
            comics,
            price,
            isBundle: comics.length > 1
        });

        return res.status(200).json({
            error: false,
            message: "Bundle created successfully",
            data: bundle
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            error: true,
            message: "Something went wrong"
        });
    }
};

// const getBundleDetails = async (req, res) => {
//     try {
//         const { bundleId } = req.params;

//         const bundle = await ComicBundle.findById(bundleId)
//             .populate("teacherId", "firstname lastname")
//             .populate("comics");

//         if (!bundle) {
//             return res.status(404).json({
//                 error: true,
//                 message: "Bundle not found"
//             });
//         }

//         // 🔥 attach thumbnail + extra info
//         const comicsWithDetails = await Promise.all(
//             bundle.comics.map(async (comic) => {

//                 const page = await ComicPage.findOne({ comicId: comic._id });

//                 return {
//                     ...comic.toObject(),
//                     thumbnail: page?.imageUrl || null
//                 };
//             })
//         );

//         return res.json({
//             error: false,
//             data: {
//                 ...bundle.toObject(),
//                 comics: comicsWithDetails
//             }
//         });

//     } catch (error) {
//         console.log(error);
//         return res.status(500).json({
//             error: true,
//             message: "Server error"
//         });
//     }
// };

const getBundleDetails = async (req, res) => {
    try {
        const { bundleId } = req.params;

        const bundle = await ComicBundle.findById(bundleId)
            .populate({
                path: "teacherId",
                select: "firstname lastname email"
            })
            .populate({
                path: "comics",
                populate: [
                    {
                        path: "subjectId",
                        select: "name"
                    },
                    {
                        path: "conceptId",
                        select: "name"
                    },
                    {
                        path: "seriesId",
                        select: "title concept grade country subjectId conceptId"
                    },
                    {
                        path: "themeId",
                        select: "name"
                    },
                    {
                        path: "styleId",
                        select: "name"
                    }
                ]
            });

        if (!bundle) {
            return res.status(404).json({
                error: true,
                message: "Bundle not found"
            });
        }

        // 🔥 attach thumbnail
        const comicsWithThumb = await Promise.all(
            bundle.comics.map(async (comic) => {
                const page = await ComicPage.findOne({ comicId: comic._id });

                let seriesDetails = null;
                if (comic.seriesId) {
                    const series = await ComicSeries.findById(comic.seriesId)
                        .populate("subjectId", "name")
                        .populate("conceptId", "name");
                    seriesDetails = series;
                }

                return {
                    ...comic.toObject(),
                    thumbnail: page?.imageUrl || null,
                    series: seriesDetails ? {
                        _id: seriesDetails._id,
                        title: seriesDetails.title,
                        concept: seriesDetails.concept,
                        conceptName: seriesDetails.conceptId?.name || null,
                        grade: seriesDetails.grade,
                        country: seriesDetails.country,
                        countries: seriesDetails.countries,
                        subjectName: seriesDetails.subjectId?.name || null,
                        partNumber: comic.partNumber
                    } : null,
                    subjectName: comic.subjectId?.name || comic.subject || "N/A",
                    conceptName: comic.conceptId?.name || comic.concept || "N/A"
                };
            })
        );

        const response = {
            ...bundle.toObject(),
            comics: comicsWithThumb
        };

        return res.json({
            error: false,
            data: response
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};

const publishBundle = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const { bundleId } = req.body;

        const bundle = await ComicBundle.findOne({
            _id: bundleId,
            teacherId: userId
        });

        if (!bundle) {
            return res.status(404).json({
                error: true,
                message: "Bundle not found"
            });
        }

        bundle.status = "published";
        await bundle.save();

        return res.json({
            error: false,
            message: "Bundle published successfully"
        });

    } catch (error) {
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};



const getMyPurchases = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        // 🔥 purchases fetch
        const purchases = await Purchase.find({ userId })
            .populate({
                path: "bundleId",
                populate: [
                    {
                        path: "teacherId",
                        select: "firstname lastname"
                    },
                    {
                        path: "comics"
                    }
                ]
            })
            .sort({ createdAt: -1 });

        // 🔥 thumbnail attach karo
        const updatedPurchases = await Promise.all(
            purchases.map(async (purchase) => {

                const bundle = purchase.bundleId;

                if (!bundle) return purchase;

                const comicsWithThumb = await Promise.all(
                    bundle.comics.map(async (comic) => {

                        const page = await ComicPage.findOne({ comicId: comic._id });

                        return {
                            ...comic.toObject(),
                            thumbnail: page?.imageUrl || null
                        };
                    })
                );

                return {
                    ...purchase.toObject(),
                    bundleId: {
                        ...bundle.toObject(),
                        comics: comicsWithThumb
                    }
                };
            })
        );

        return res.json({
            error: false,
            data: updatedPurchases
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};



const getTeacherBundles = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        const bundles = await ComicBundle.find({ teacherId: userId })
            .populate("comics")
            .sort({ createdAt: -1 });

        return res.json({
            error: false,
            data: bundles
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};


const getMarketplace = async (req, res) => {
    try {
        const bundles = await ComicBundle.find({ status: "published" })
            .populate("comics")
            .populate("teacherId", "firstname lastname")
            .populate({
                path: "comics",
                select: "title subject concept subjectId conceptId grade country",
                populate: [
                    {
                        path: "subjectId",
                        select: "name"
                    },
                    {
                        path: "conceptId",
                        select: "name"
                    }
                ]
            })
            .sort({ createdAt: -1 });

        const bundlesWithThumbnails = await Promise.all(
            bundles.map(async (bundle) => {

                const comicsWithThumb = await Promise.all(
                    bundle.comics.map(async (comic) => {

                        const page = await ComicPage.findOne({ comicId: comic._id });

                        return {
                            ...comic.toObject(),
                            thumbnail: page?.imageUrl || null
                        };
                    })
                );

                return {
                    ...bundle.toObject(),
                    comics: comicsWithThumb
                };
            })
        );

        return res.json({
            error: false,
            data: bundlesWithThumbnails
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};




const getMarketplaceStatus = async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                error: true,
                message: "User ID is required"
            });
        }

        // User exists?
        const user = await User.findById(userId).select("_id");

        if (!user) {
            return res.status(404).json({
                error: true,
                message: "User not found"
            });
        }

        // Purchased Bundles
        const purchasedBundleIds = await Purchase.find({ userId })
            .distinct("bundleId");

        // Own Bundles
        const ownBundleIds = await ComicBundle.find({
            teacherId: userId
        }).distinct("_id");

        return res.json({
            error: false,
            purchasedBundleIds,
            ownBundleIds
        });

    } catch (err) {
        console.log(err);

        return res.status(500).json({
            error: true,
            message: "Server Error"
        });
    }
};



// const purchaseBundle = async (req, res) => {
//     try {
//         const userId = req.user.login_data._id;
//         const { bundleId } = req.body;

//         const bundle = await ComicBundle.findById(bundleId);

//         if (!bundle || bundle.status !== "published") {
//             return res.status(404).json({
//                 error: true,
//                 message: "Bundle not available"
//             });
//         }

//         // check already purchased
//         const alreadyPurchased = await Purchase.findOne({
//             userId,
//             bundleId
//         });

//         if (alreadyPurchased) {
//             return res.status(400).json({
//                 error: true,
//                 message: "Already purchased"
//             });
//         }

//         // create purchase
//         const purchase = await Purchase.create({
//             userId,
//             bundleId,
//             amount: bundle.price,
//             paymentStatus: "success" // for now
//         });

//         return res.json({
//             error: false,
//             message: "Bundle purchased successfully",
//             data: purchase
//         });

//     } catch (error) {
//         return res.status(500).json({
//             error: true,
//             message: "Server error"
//         });
//     }
// };

const getMySales = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        const bundles = await ComicBundle.find({ teacherId: userId });
        const bundleIds = bundles.map(b => b._id);

        const sales = await Purchase.find({
            bundleId: { $in: bundleIds }
        })
            .populate("userId", "firstname email")
            .populate("bundleId", "title price")
            .sort({ createdAt: -1 });

        return res.json({
            error: false,
            data: sales
        });

    } catch (error) {
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};


const getTransactions = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        const transactions = await Purchase.find({ userId })
            .populate("bundleId", "title")
            .sort({ createdAt: -1 });

        return res.json({
            error: false,
            data: transactions
        });

    } catch (error) {
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};





const getPurchasedBundleDetails = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const { bundleId } = req.params;

        // 🔒 check purchase and get purchase details
        const purchase = await Purchase.findOne({
            userId,
            bundleId,
            paymentStatus: "success"
        });

        if (!purchase) {
            return res.status(403).json({
                error: true,
                message: "Access denied. Please purchase this bundle."
            });
        }

        // 📦 get bundle
        const bundle = await ComicBundle.findById(bundleId)
            .populate({
                path: "teacherId",
                select: "firstname lastname email"
            })
            .populate({
                path: "comics",
                populate: [
                    {
                        path: "subjectId",
                        select: "name"
                    },
                    {
                        path: "conceptId",
                        select: "name"
                    },
                    {
                        path: "seriesId",
                        select: "title concept grade country subjectId conceptId"
                    },
                    {
                        path: "themeId",
                        select: "name"
                    },
                    {
                        path: "styleId",
                        select: "name"
                    }
                ]
            });

        if (!bundle) {
            return res.status(404).json({
                error: true,
                message: "Bundle not found"
            });
        }

        // 🔥 attach pages + thumbnail + enriched data
        const comicsWithDetails = await Promise.all(
            bundle.comics.map(async (comic) => {
                const pages = await ComicPage.find({ comicId: comic._id });

                let seriesDetails = null;
                if (comic.seriesId) {
                    const series = await ComicSeries.findById(comic.seriesId)
                        .populate("subjectId", "name")
                        .populate("conceptId", "name");
                    seriesDetails = series;
                }

                return {
                    ...comic.toObject(),
                    pages,
                    thumbnail: pages?.[0]?.imageUrl || null,
                    series: seriesDetails ? {
                        _id: seriesDetails._id,
                        title: seriesDetails.title,
                        concept: seriesDetails.concept,
                        conceptName: seriesDetails.conceptId?.name || null,
                        grade: seriesDetails.grade,
                        country: seriesDetails.country,
                        countries: seriesDetails.countries,
                        subjectName: seriesDetails.subjectId?.name || null,
                        partNumber: comic.partNumber
                    } : null,
                    subjectName: comic.subjectId?.name || comic.subject || "N/A",
                    conceptName: comic.conceptId?.name || comic.concept || "N/A"
                };
            })
        );

        const response = {
            ...bundle.toObject(),
            comics: comicsWithDetails,
            // ✅ Add purchase details
            purchaseDate: purchase.createdAt,
            purchaseId: purchase._id,
            transactionId: purchase.transactionId || null
        };

        return res.json({
            error: false,
            data: response
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};


const getComicReader = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const { comicId } = req.params;

        const comic = await Comic.findById(comicId);

        if (!comic) {
            return res.status(404).json({
                error: true,
                message: "Comic not found"
            });
        }

        // 🔥 find bundle
        const bundle = await ComicBundle.findOne({
            comics: comicId
        });

        // 🔒 check purchase
        const isPurchased = await Purchase.findOne({
            userId,
            bundleId: bundle?._id,
            paymentStatus: "success"
        });

        // if (!isPurchased) {
        //     return res.status(403).json({
        //         error: true,
        //         message: "Access denied"
        //     });
        // }

        // 📄 pages
        const pages = await ComicPage.find({ comicId }).sort({ createdAt: 1 });

        // ❓ FAQs
        const faqs = await FAQ.find({ comicId });

        // 💡 Did You Know
        const facts = await DidYouKnow.find({ comicId });

        // 🧠 Quiz
        const quiz = await Quiz.find({ comicId })
            .populate({
                path: "questions",
                select: "question options correctAnswer explanation difficulty"
            });

        // 🔥 Hardcore Quiz
        const hardcoreQuiz = await HardcoreQuiz.find({ comicId })
            .populate({
                path: "questions",
                select: "question options correctAnswer explanation difficulty hint"
            });

        return res.json({
            error: false,
            data: {
                comic,
                pages,
                faqs,
                facts,
                quiz,
                hardcoreQuiz
            }
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};

const rateBundle = async (req, res) => {

    try {

        const { bundleId, rating } = req.body;
        const userId = req.user.id;

        await BundleRating.findOneAndUpdate(
            {
                bundleId,
                userId
            },
            {
                rating
            },
            {
                upsert: true,
                new: true
            }
        );

        const ratings = await BundleRating.find({ bundleId });

        const totalRatings = ratings.length;

        const averageRating =
            ratings.reduce((sum, item) => sum + item.rating, 0) /
            totalRatings;

        await ComicBundle.findByIdAndUpdate(
            bundleId,
            {
                averageRating: Number(averageRating.toFixed(1)),
                totalRatings
            }
        );

        return res.json({
            success: true,
            message: "Rating submitted successfully"
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

const getBundleRatings = async (req, res) => {
    try {

        const bundle = await ComicBundle.findById(req.params.bundleId).select(
            "averageRating totalRatings"
        );

        return res.json({
            success: true,
            data: bundle
        });

    } catch (err) {
        return res.status(500).json({
            success: false,
            message: err.message
        });
    }
};



const getTeacherSalesDashboard = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        // 🔥 Get all bundles of this teacher
        const bundles = await ComicBundle.find({ teacherId: userId });
        const bundleIds = bundles.map(b => b._id);

        // 🔥 Get all purchases for these bundles
        const purchases = await Purchase.find({
            bundleId: { $in: bundleIds },
            paymentStatus: "success"
        })
            .populate("userId", "firstname lastname email")
            .populate("bundleId", "title")
            .sort({ createdAt: -1 });

        // 🔥 Calculate statistics
        const totalSales = purchases.length;
        const totalRevenue = purchases.reduce((sum, p) => sum + p.teacherAmount, 0);
        const pendingPayouts = purchases.filter(p => p.teacherPayoutStatus === "pending");
        const failedPayouts = purchases.filter(p => p.teacherPayoutStatus === "failed");

        // 🔥 Group by bundle
        const bundleSales = {};
        purchases.forEach(p => {
            const bundleTitle = p.bundleId.title;
            if (!bundleSales[bundleTitle]) {
                bundleSales[bundleTitle] = {
                    count: 0,
                    revenue: 0
                };
            }
            bundleSales[bundleTitle].count++;
            bundleSales[bundleTitle].revenue += p.teacherAmount;
        });

        return res.json({
            error: false,
            data: {
                summary: {
                    totalSales,
                    totalRevenue,
                    pendingPayouts: pendingPayouts.length,
                    failedPayouts: failedPayouts.length
                },
                bundleSales,
                recentSales: purchases.slice(0, 20)
            }
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            error: true,
            message: "Error fetching sales dashboard"
        });
    }
};

module.exports = {
    createBundle, getBundleDetails, publishBundle, getMarketplace, getTeacherBundles, getTransactions, getMySales,
    getMyPurchases, getPurchasedBundleDetails, getComicReader, rateBundle, getBundleRatings, getTeacherSalesDashboard,
    getMarketplaceStatus
}