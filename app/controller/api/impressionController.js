const mongoose = require("mongoose");
const AdImpression = require("../../models/AdImpression");
const Comic = require("../../models/Comic");
const AdEcpm = require("../../models/AdEcpm");

const createImpression = async (req, res) => {
    try {
        const { comic_id, ad_unit_id, ad_type } = req.body;

        if (!comic_id || !ad_unit_id || !ad_type) {
            return res.status(400).json({ success: false, message: "comic_id, ad_unit_id, ad_type required" });
        }

        if (!mongoose.Types.ObjectId.isValid(comic_id)) {
            return res.status(400).json({ success: false, message: "Invalid comic_id" });
        }

        // (Optional) verify comic exists – safe layer
        const comicExists = await Comic.exists({ _id: comic_id });
        if (!comicExists) {
            return res.status(404).json({ success: false, message: "Comic not found" });
        }

        await AdImpression.create({
            comic: comic_id,
            ad_unit_id,
            ad_type
        });

        return res.json({ success: true });
    } catch (err) {
        console.error("createImpression error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};



const upsertEcpm = async (req, res) => {
    try {
        const { ad_unit_id, ecpm, currency } = req.body;

        if (!ad_unit_id || typeof ecpm !== "number") {
            return res.status(400).json({ success: false, message: "ad_unit_id and ecpm (number) required" });
        }

        const doc = await AdEcpm.findOneAndUpdate(
            { ad_unit_id },
            {
                ad_unit_id,
                ecpm,
                currency: currency || "USD",
                updatedAt: new Date()
            },
            { upsert: true, new: true }
        );

        return res.json({ success: true, data: doc });
    } catch (err) {
        console.error("upsertEcpm error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

const listEcpm = async (req, res) => {
    try {
        const docs = await AdEcpm.find({}).sort({ ad_unit_id: 1 });
        res.json({ success: true, data: docs });
    } catch (err) {
        console.error("listEcpm error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};



const comicRevenueReport = async (req, res) => {
    try {
        const { start_date, end_date } = req.query;

        const match = {};
        if (start_date || end_date) {
            match.createdAt = {};
            if (start_date) match.createdAt.$gte = new Date(start_date);
            if (end_date) {
                const end = new Date(end_date);
                end.setHours(23, 59, 59, 999);
                match.createdAt.$lte = end;
            }
        }

        const pipeline = [
            { $match: match },
            {
                $group: {
                    _id: {
                        comic: "$comic",
                        ad_unit_id: "$ad_unit_id",
                        ad_type: "$ad_type",
                    },
                    impressions: { $sum: 1 }
                }
            },
            {
                $lookup: {
                    from: "ad_ecpms",
                    localField: "_id.ad_unit_id",
                    foreignField: "ad_unit_id",
                    as: "ecpmDoc"
                }
            },
            { $unwind: { path: "$ecpmDoc", preserveNullAndEmptyArrays: true } },
            {
                $addFields: {
                    ecpm: { $ifNull: ["$ecpmDoc.ecpm", 0] },
                    estimated_revenue: {
                        $multiply: [
                            { $divide: ["$impressions", 1000] },
                            { $ifNull: ["$ecpmDoc.ecpm", 0] }
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: "$_id.comic",
                    total_impressions: { $sum: "$impressions" },
                    total_revenue: { $sum: "$estimated_revenue" },
                    breakdown: {
                        $push: {
                            ad_unit_id: "$_id.ad_unit_id",
                            ad_type: "$_id.ad_type",
                            impressions: "$impressions",
                            ecpm: "$ecpm",
                            revenue: "$estimated_revenue"
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: "comics",
                    localField: "_id",
                    foreignField: "_id",
                    as: "comic"
                }
            },
            { $unwind: { path: "$comic", preserveNullAndEmptyArrays: true } },
            {
                $project: {
                    _id: 0,
                    comic_id: "$_id",
                    title: "$comic.title",
                    thumbnailUrl: "$comic.thumbnailUrl",
                    subject: "$comic.subject",
                    country: "$comic.country",
                    total_impressions: 1,
                    total_revenue: 1,
                    breakdown: 1
                }
            },
            { $sort: { total_revenue: -1 } }
        ];

        const data = await AdImpression.aggregate(pipeline);
        return res.json({ success: true, data });
    } catch (err) {
        console.error("comicRevenueReport error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
};



module.exports = { createImpression, upsertEcpm, listEcpm, comicRevenueReport }
