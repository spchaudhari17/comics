const ComicBundle = require("../../models/ComicBundle");
const Comic = require("../../models/Comic");
const Purchase = require("../../models/Purchase");
const ComicPage = require("../../models/ComicPage");
const FAQ = require("../../models/FAQ");
const DidYouKnow = require("../../models/DidYouKnow");
const Quiz = require("../../models/Quiz");
const HardcoreQuiz = require("../../models/HardcoreQuiz");

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

const getBundleDetails = async (req, res) => {
    try {
        const { bundleId } = req.params;

        const bundle = await ComicBundle.findById(bundleId)
            .populate("teacherId", "firstname lastname")
            .populate("comics");

        if (!bundle) {
            return res.status(404).json({
                error: true,
                message: "Bundle not found"
            });
        }

        // 🔥 attach thumbnail + extra info
        const comicsWithDetails = await Promise.all(
            bundle.comics.map(async (comic) => {

                const page = await ComicPage.findOne({ comicId: comic._id });

                return {
                    ...comic.toObject(),
                    thumbnail: page?.imageUrl || null
                };
            })
        );

        return res.json({
            error: false,
            data: {
                ...bundle.toObject(),
                comics: comicsWithDetails
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
            .populate("comics") // ✅ FIX
            .populate("teacherId", "firstname lastname");

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

        // 🔒 check purchase
        const isPurchased = await Purchase.findOne({
            userId,
            bundleId,
            paymentStatus: "success"
        });

        if (!isPurchased) {
            return res.status(403).json({
                error: true,
                message: "Access denied. Please purchase this bundle."
            });
        }

        // 📦 get bundle
        const bundle = await ComicBundle.findById(bundleId)
            .populate({
                path: "teacherId",
                select: "firstname lastname"
            })
            .populate({
                path: "comics"
            });

        if (!bundle) {
            return res.status(404).json({
                error: true,
                message: "Bundle not found"
            });
        }

        // 🔥 attach pages + thumbnail
        const comicsWithDetails = await Promise.all(
            bundle.comics.map(async (comic) => {

                const pages = await ComicPage.find({ comicId: comic._id });

                return {
                    ...comic.toObject(),
                    pages, // 🔥 full pages
                    thumbnail: pages?.[0]?.imageUrl || null
                };
            })
        );

        const response = {
            ...bundle.toObject(),
            comics: comicsWithDetails
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
        const quiz = await Quiz.find({ comicId });

        // 🔥 Hardcore Quiz
        const hardcoreQuiz = await HardcoreQuiz.find({ comicId });

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




module.exports = {
    createBundle, getBundleDetails, publishBundle, getMarketplace, getTeacherBundles, getTransactions, getMySales,
    getMyPurchases, getPurchasedBundleDetails, getComicReader
}