const ComicBundle = require("../../models/ComicBundle");
const Comic = require("../../models/Comic");
const Purchase = require("../../models/Purchase");
const ComicPage = require("../../models/ComicPage");

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

const purchaseBundle = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const { bundleId } = req.body;

        const bundle = await ComicBundle.findById(bundleId);

        if (!bundle || bundle.status !== "published") {
            return res.status(404).json({
                error: true,
                message: "Bundle not available"
            });
        }

        // check already purchased
        const alreadyPurchased = await Purchase.findOne({
            userId,
            bundleId
        });

        if (alreadyPurchased) {
            return res.status(400).json({
                error: true,
                message: "Already purchased"
            });
        }

        // create purchase
        const purchase = await Purchase.create({
            userId,
            bundleId,
            amount: bundle.price,
            paymentStatus: "success" // for now
        });

        return res.json({
            error: false,
            message: "Bundle purchased successfully",
            data: purchase
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

        const purchases = await Purchase.find({ userId })
            .populate({
                path: "bundleId",
                populate: [
                    { path: "teacherId", select: "firstname lastname" },
                    { path: "comics" }
                ]
            })
            .sort({ createdAt: -1 });

        return res.json({
            error: false,
            data: purchases
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};

module.exports = { createBundle, publishBundle, getMarketplace, purchaseBundle, getTeacherBundles, getMyPurchases }