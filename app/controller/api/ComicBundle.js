const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const PDFDocument = require("pdfkit"); // npm i pdfkit

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

// =====================================================================
// Shared helpers
// =====================================================================

// Admin panel ke roles (owner na ho tab bhi comic dekh sakte hain)
const ADMIN_ROLES = ["admin", "moderator"];

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isValidId = (v) => mongoose.Types.ObjectId.isValid(v);
const getConceptName = (c) => c?.conceptId?.name || c?.concept || "N/A";

// Har comic ka pehla page (thumbnail) + page count, ek hi query me
const getPageStats = async (comicIds) => {
    if (!comicIds.length) return new Map();

    const stats = await ComicPage.aggregate([
        { $match: { comicId: { $in: comicIds } } },
        { $sort: { pageNumber: 1, createdAt: 1 } },
        {
            $group: {
                _id: "$comicId",
                pageCount: { $sum: 1 },
                thumbnail: { $first: "$imageUrl" }
            }
        }
    ]);

    return new Map(stats.map((s) => [String(s._id), s]));
};

// Comic ka access: owner teacher, admin/moderator, ya kisi bundle ka buyer
const hasComicAccess = async (user, comic) => {
    if (!user?._id) return false;
    if (String(comic.user_id) === String(user._id)) return true;
    if (ADMIN_ROLES.includes(user.userType)) return true;

    // Ek comic multiple bundles me ho sakti hai
    const bundleIds = await ComicBundle.find({ comics: comic._id }).distinct("_id");
    if (!bundleIds.length) return false;

    const purchase = await Purchase.exists({
        userId: user._id,
        bundleId: { $in: bundleIds },
        paymentStatus: "success"
    });

    return !!purchase;
};


// =====================================================================
// Bundles (teacher)
// =====================================================================

const createBundle = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const { title, description, comics, price } = req.body;

        // ✅ validations
        if (!title || !Array.isArray(comics) || comics.length === 0 || !price) {
            return res.status(400).json({
                error: true,
                message: "Title, comics and price are required"
            });
        }

        const priceNumber = Number(price);
        if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
            return res.status(400).json({ error: true, message: "Price must be greater than 0" });
        }

        const uniqueIds = [...new Set(comics.map(String))];
        if (uniqueIds.some((id) => !isValidId(id))) {
            return res.status(400).json({ error: true, message: "Invalid comic id" });
        }

        // ✅ comics is teacher ki honi chahiye
        const foundComics = await Comic.find({
            _id: { $in: uniqueIds },
            user_id: userId
        })
            .select("_id status concept conceptId")
            .populate("conceptId", "name")
            .lean();

        if (foundComics.length !== uniqueIds.length) {
            return res.status(400).json({
                error: true,
                message: "Invalid comics or not owned by teacher"
            });
        }

        // ✅ Sirf approved comics (pehle sirf frontend pe check tha)
        if (foundComics.some((c) => c.status !== "approved")) {
            return res.status(400).json({
                error: true,
                message: "Only approved comics can be added to a bundle"
            });
        }

        // ✅ Saari comics ek hi concept ki
        if (new Set(foundComics.map(getConceptName)).size > 1) {
            return res.status(400).json({
                error: true,
                message: "All comics in a bundle must belong to the same concept"
            });
        }

        // ✅ create bundle
        const bundle = await ComicBundle.create({
            title: String(title).trim(),
            description,
            teacherId: userId,
            comics: uniqueIds,
            price: priceNumber,
            isBundle: uniqueIds.length > 1
        });

        return res.status(200).json({
            error: false,
            message: "Bundle created successfully",
            data: bundle
        });

    } catch (error) {
        console.log("createBundle error:", error);
        return res.status(500).json({
            error: true,
            message: "Something went wrong"
        });
    }
};


const deleteBundle = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const { bundleId } = req.params;

        if (!isValidId(bundleId)) {
            return res.status(400).json({ error: true, message: "Invalid bundle id" });
        }

        const bundle = await ComicBundle.findById(bundleId);

        if (!bundle) {
            return res.status(404).json({
                error: true,
                message: "Bundle not found"
            });
        }

        // Check ownership
        if (bundle.teacherId.toString() !== userId.toString()) {
            return res.status(403).json({
                error: true,
                message: "You are not authorized to delete this bundle"
            });
        }

        // Published bundle delete nahi hoga (frontend bhi yahi kehta hai,
        // warna buyers ka access chala jayega)
        if (bundle.status === "published") {
            return res.status(400).json({
                error: true,
                message: "Published bundles can't be deleted"
            });
        }

        await ComicBundle.findByIdAndDelete(bundleId);

        return res.status(200).json({
            error: false,
            message: "Bundle deleted successfully"
        });

    } catch (error) {
        console.log("deleteBundle error:", error);
        return res.status(500).json({
            error: true,
            message: "Something went wrong"
        });
    }
};


const getBundleDetails = async (req, res) => {
    try {
        const { bundleId } = req.params;

        if (!isValidId(bundleId)) {
            return res.status(400).json({ error: true, message: "Invalid bundle id" });
        }

        const bundle = await ComicBundle.findById(bundleId)
            .select("_id title price description teacherId comics createdAt averageRating totalRatings")
            .populate({
                path: "teacherId",
                select: "_id firstname lastname email username"
            })
            .populate({
                path: "comics",
                select: "_id title subject concept subjectId conceptId seriesId themeId styleId hasQuiz createdAt partNumber",
                populate: [
                    { path: "subjectId", select: "name" },
                    { path: "conceptId", select: "name" },
                    {
                        path: "seriesId",
                        select: "title concept grade country countries subjectId conceptId",
                        populate: [
                            { path: "subjectId", select: "name" },
                            { path: "conceptId", select: "name" }
                        ]
                    },
                    { path: "themeId", select: "name" },
                    { path: "styleId", select: "name" }
                ]
            })
            .lean();

        if (!bundle) {
            return res.status(404).json({
                error: true,
                message: "Bundle not found"
            });
        }

        // Thumbnails ek hi query me (pehle har comic ke liye alag query thi)
        const pageMap = await getPageStats((bundle.comics || []).map((c) => c._id));

        const comics = (bundle.comics || []).map((comic) => {
            const series = comic.seriesId;

            return {
                _id: comic._id,
                title: comic.title,
                thumbnail: pageMap.get(String(comic._id))?.thumbnail || null,
                subjectName: comic.subjectId?.name || comic.subject || "N/A",
                conceptName: getConceptName(comic),
                theme: comic.themeId?.name || "N/A",
                style: comic.styleId?.name || "N/A",
                hasQuiz: comic.hasQuiz || false,
                createdAt: comic.createdAt,
                series: series
                    ? {
                        _id: series._id,
                        title: series.title,
                        concept: series.concept,
                        conceptName: series.conceptId?.name || null,
                        grade: series.grade,
                        country: series.country,
                        countries: series.countries,
                        subjectName: series.subjectId?.name || null,
                        partNumber: comic.partNumber || null
                    }
                    : null
            };
        });

        return res.json({
            error: false,
            data: {
                _id: bundle._id,
                title: bundle.title,
                price: bundle.price,
                description: bundle.description,
                createdAt: bundle.createdAt,
                averageRating: bundle.averageRating || 0,
                totalRatings: bundle.totalRatings || 0,
                teacher: bundle.teacherId
                    ? {
                        _id: bundle.teacherId._id,
                        firstname: bundle.teacherId.firstname,
                        lastname: bundle.teacherId.lastname,
                        email: bundle.teacherId.email,
                        username: bundle.teacherId.username
                    }
                    : null,
                comics
            }
        });

    } catch (error) {
        console.error("getBundleDetails error:", error);
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

        if (!isValidId(bundleId)) {
            return res.status(400).json({ error: true, message: "Invalid bundle id" });
        }

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
        console.log("publishBundle error:", error);
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};


const getTeacherBundles = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        // Sirf zaroori comic fields (pehle prompt/story jaise bade fields bhi aate the)
        const bundles = await ComicBundle.find({ teacherId: userId })
            .populate("comics", "_id title concept conceptId status")
            .sort({ createdAt: -1 });

        return res.json({
            error: false,
            data: bundles
        });

    } catch (error) {
        console.log("getTeacherBundles error:", error);
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};


const getMyComicsForBundle = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        const comics = await Comic.find({ user_id: userId })
            .select("_id title subject concept subjectId conceptId status createdAt")
            .populate("subjectId", "name")
            .populate("conceptId", "name")
            .sort({ createdAt: -1 })
            .lean();

        const pageMap = await getPageStats(comics.map((c) => c._id));

        const data = comics.map((c) => ({
            _id: c._id,
            title: c.title,
            subjectName: c.subjectId?.name || c.subject || "N/A",
            conceptName: getConceptName(c),
            thumbnail: pageMap.get(String(c._id))?.thumbnail || null,
            status: c.status, // frontend sirf "approved" dikhayega (createBundle jaisa)
            createdAt: c.createdAt
        }));

        return res.json({ error: false, data });
    } catch (error) {
        console.log("getMyComicsForBundle error:", error);
        return res.status(500).json({ error: true, message: "Server error" });
    }
};


// ---------------------------------------------------------------------
// Bundle edit: title / description / price / comics (add + remove)
// Rule: published bundle me comics ADD ho sakti hain, REMOVE nahi
// ---------------------------------------------------------------------
const updateBundle = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const { bundleId } = req.params;
        const { title, description, comics, price } = req.body;

        if (!isValidId(bundleId)) {
            return res.status(400).json({ error: true, message: "Invalid bundle id" });
        }

        const bundle = await ComicBundle.findOne({ _id: bundleId, teacherId: userId });

        if (!bundle) {
            return res.status(404).json({ error: true, message: "Bundle not found" });
        }

        // ---- Title ----
        if (title !== undefined) {
            if (!String(title).trim()) {
                return res.status(400).json({ error: true, message: "Title is required" });
            }
            bundle.title = String(title).trim();
        }

        // ---- Description ----
        if (description !== undefined) {
            bundle.description = description;
        }

        // ---- Price ----
        if (price !== undefined) {
            const priceNumber = Number(price);
            if (!Number.isFinite(priceNumber) || priceNumber <= 0) {
                return res.status(400).json({ error: true, message: "Price must be greater than 0" });
            }
            bundle.price = priceNumber;
        }

        // ---- Comics ----
        if (comics !== undefined) {
            if (!Array.isArray(comics) || comics.length === 0) {
                return res.status(400).json({ error: true, message: "Select at least one comic" });
            }

            const newIds = [...new Set(comics.map(String))];

            if (newIds.some((id) => !isValidId(id))) {
                return res.status(400).json({ error: true, message: "Invalid comic id" });
            }

            const ownedComics = await Comic.find({
                _id: { $in: newIds },
                user_id: userId
            })
                .select("_id status concept conceptId")
                .populate("conceptId", "name")
                .lean();

            if (ownedComics.length !== newIds.length) {
                return res.status(400).json({
                    error: true,
                    message: "Invalid comics or not owned by teacher"
                });
            }

            const oldIds = bundle.comics.map(String);

            // Naya add hone wala comic "approved" hona chahiye
            const notApproved = ownedComics.filter(
                (c) => !oldIds.includes(String(c._id)) && c.status !== "approved"
            );

            if (notApproved.length > 0) {
                return res.status(400).json({
                    error: true,
                    message: "Only approved comics can be added to a bundle"
                });
            }

            // Bundle ka concept FIXED hai (pehle se jo comics hain unka)
            const oldComic = await Comic.findOne({ _id: { $in: bundle.comics } })
                .select("concept conceptId")
                .populate("conceptId", "name")
                .lean();

            const bundleConcept = oldComic ? getConceptName(oldComic) : null;

            const wrongConcept = bundleConcept
                ? ownedComics.some((c) => getConceptName(c) !== bundleConcept)
                : new Set(ownedComics.map(getConceptName)).size > 1;

            if (wrongConcept) {
                return res.status(400).json({
                    error: true,
                    message: bundleConcept
                        ? `Only "${bundleConcept}" comics can be added to this bundle`
                        : "All comics in a bundle must belong to the same concept"
                });
            }

            // Published bundle se comic remove karna allowed nahi
            const removedIds = oldIds.filter((id) => !newIds.includes(id));

            if (bundle.status === "published" && removedIds.length > 0) {
                return res.status(400).json({
                    error: true,
                    message: "Comics can't be removed from a published bundle. You can only add new comics."
                });
            }

            bundle.comics = newIds;
            bundle.isBundle = newIds.length > 1;
        }

        await bundle.save();

        // Same shape jo getTeacherBundles deta hai
        const updated = await ComicBundle.findById(bundle._id)
            .populate("comics", "_id title concept conceptId status");

        return res.json({
            error: false,
            message: "Bundle updated successfully",
            data: updated
        });
    } catch (error) {
        console.log("updateBundle error:", error);
        return res.status(500).json({ error: true, message: "Server error" });
    }
};


// =====================================================================
// Marketplace
// =====================================================================

const MARKETPLACE_SORTS = {
    latest: { createdAt: -1, _id: -1 },
    oldest: { createdAt: 1, _id: 1 },
    price_low: { price: 1, _id: -1 },
    price_high: { price: -1, _id: -1 },
    rating: { averageRating: -1, totalRatings: -1, _id: -1 },
    title: { title: 1, _id: 1 }
};

// Ek label ke liye ek hi option rakho; id wala value naam wale se behtar hai
const addOption = (map, label, value, hasId) => {
    if (!label) return;
    const existing = map.get(label);
    if (!existing || (!existing.hasId && hasId)) {
        map.set(label, { value: String(value), label, hasId });
    }
};

const sortOptions = (map) =>
    [...map.values()]
        .map(({ value, label }) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));

// Filter dropdowns ke options: published bundles ki saari comics se
const buildMarketplaceFacets = async () => {
    const comicIds = await ComicBundle.find({ status: "published" }).distinct("comics");

    const comics = await Comic.find({ _id: { $in: comicIds } })
        .select("subject subjectId concept conceptId grade country countries")
        .populate("subjectId", "name")
        .populate("conceptId", "name")
        .lean();

    const subjects = new Map();
    const concepts = new Map();
    const grades = new Set();
    const countries = new Set();

    comics.forEach((c) => {
        const subjectName = c.subjectId?.name || c.subject;
        addOption(subjects, subjectName, c.subjectId?._id || subjectName, !!c.subjectId?._id);

        const conceptName = c.conceptId?.name || c.concept;
        addOption(concepts, conceptName, c.conceptId?._id || conceptName, !!c.conceptId?._id);

        if (c.grade) grades.add(c.grade);

        [c.country, ...(c.countries || [])]
            .filter((code) => code && code !== "ALL")
            .forEach((code) => countries.add(String(code).toUpperCase()));
    });

    const byText = (a, b) => a.localeCompare(b, undefined, { numeric: true });

    return {
        subjects: sortOptions(subjects),
        concepts: sortOptions(concepts),
        grades: [...grades].sort(byText),
        countries: [...countries].sort(byText)
    };
};

const getMarketplace = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 10,
            search,
            subjectId,
            conceptId,
            grade,
            country,
            teacherId,
            sort = "latest",
            includeFacets
        } = req.query;

        const pageNumber = Math.max(parseInt(page) || 1, 1);
        const limitNumber = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
        const skip = (pageNumber - 1) * limitNumber;

        // ---- Comic filters (subject / concept / grade / country) ----
        const comicConditions = [];

        if (subjectId) {
            comicConditions.push(isValidId(subjectId) ? { subjectId } : { subject: subjectId });
        }

        if (conceptId) {
            comicConditions.push(isValidId(conceptId) ? { conceptId } : { concept: conceptId });
        }

        if (grade) {
            comicConditions.push({ grade });
        }

        if (country) {
            // Us country ki comics + jo "ALL" countries ke liye hain
            const code = String(country).trim().toUpperCase();
            comicConditions.push({
                $or: [
                    { country: code },
                    { countries: code },
                    { country: "ALL" },
                    { countries: "ALL" }
                ]
            });
        }

        // ---- Bundle filter ----
        const bundleFilter = { status: "published" };

        if (teacherId && isValidId(teacherId)) {
            bundleFilter.teacherId = teacherId;
        }

        if (comicConditions.length) {
            const matchingComicIds = await Comic.find({ $and: comicConditions }).distinct("_id");
            bundleFilter.comics = { $in: matchingComicIds };
        }

        // ---- Search (OR): bundle title/description, comic, teacher ----
        if (search && String(search).trim() !== "") {
            const rx = new RegExp(escapeRegex(String(search).trim()), "i");

            const [searchComicIds, teacherIds] = await Promise.all([
                Comic.find({ $or: [{ title: rx }, { concept: rx }, { subject: rx }] }).distinct("_id"),
                User.find({ $or: [{ firstname: rx }, { lastname: rx }, { username: rx }] }).distinct("_id")
            ]);

            bundleFilter.$or = [
                { title: rx },
                { description: rx },
                { comics: { $in: searchComicIds } },
                { teacherId: { $in: teacherIds } }
            ];
        }

        const sortOption = MARKETPLACE_SORTS[sort] || MARKETPLACE_SORTS.latest;

        const [totalItems, bundles, facets] = await Promise.all([
            ComicBundle.countDocuments(bundleFilter),

            ComicBundle.find(bundleFilter)
                .populate({ path: "teacherId", select: "firstname lastname" })
                .populate({
                    path: "comics",
                    select: "title subject concept subjectId conceptId grade country countries",
                    populate: [
                        { path: "subjectId", select: "name" },
                        { path: "conceptId", select: "name" }
                    ]
                })
                .collation({ locale: "en", strength: 2 }) // title A-Z case-insensitive
                .sort(sortOption)
                .skip(skip)
                .limit(limitNumber)
                .lean(),

            includeFacets ? buildMarketplaceFacets() : null
        ]);

        const totalPages = Math.ceil(totalItems / limitNumber);

        // Thumbnails: ek hi query
        const pageMap = await getPageStats(bundles.flatMap((b) => (b.comics || []).map((c) => c._id)));

        const data = bundles.map((bundle) => ({
            ...bundle,
            comics: (bundle.comics || []).map((comic) => ({
                ...comic,
                thumbnail: pageMap.get(String(comic._id))?.thumbnail || null
            }))
        }));

        const response = {
            error: false,
            data,
            pagination: {
                currentPage: pageNumber,
                limit: limitNumber,
                totalItems,
                totalPages,
                hasNextPage: pageNumber < totalPages,
                hasPrevPage: pageNumber > 1
            }
        };

        if (facets) response.facets = facets;

        return res.json(response);

    } catch (error) {
        console.log("getMarketplace Error:", error);
        return res.status(500).json({ error: true, message: "Server error" });
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


// =====================================================================
// Purchases / Sales
// =====================================================================

const PURCHASE_SORTS = {
    latest: { createdAt: -1, _id: -1 },
    oldest: { createdAt: 1, _id: 1 },
    price_high: { paidAmount: -1, createdAt: -1 },
    price_low: { paidAmount: 1, createdAt: -1 },
    title: { "bundle.title": 1, createdAt: -1 }
};

const getMyPurchases = async (req, res) => {
    try {
        // Aggregate me string id cast nahi hota
        const userId = new mongoose.Types.ObjectId(String(req.user.login_data._id));

        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || (req.query.page ? 9 : 50), 1), 100);
        const sortOption = PURCHASE_SORTS[req.query.sort] || PURCHASE_SORTS.latest;
        const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

        // ---- Search ke liye teacher + comic ids ----
        let searchMatch = null;
        if (search) {
            const rx = new RegExp(escapeRegex(search), "i");
            const [teacherIds, comicIds] = await Promise.all([
                User.find({ $or: [{ firstname: rx }, { lastname: rx }, { username: rx }] }).distinct("_id"),
                Comic.find({ title: rx }).distinct("_id")
            ]);

            searchMatch = {
                $or: [
                    { "bundle.title": rx },
                    { "bundle.teacherId": { $in: teacherIds } },
                    { "bundle.comics": { $in: comicIds } }
                ]
            };
        }

        // ---- Purchases + bundle (ek query) ----
        const pipeline = [
            { $match: { userId, paymentStatus: "success" } },
            {
                $lookup: {
                    from: ComicBundle.collection.name,
                    localField: "bundleId",
                    foreignField: "_id",
                    as: "bundle"
                }
            },
            // Delete ho chuke bundles hata do
            { $unwind: "$bundle" },
            { $addFields: { paidAmount: { $ifNull: ["$amount", "$bundle.price"] } } }
        ];

        if (searchMatch) pipeline.push({ $match: searchMatch });

        pipeline.push(
            { $sort: sortOption },
            {
                $facet: {
                    items: [{ $skip: (page - 1) * limit }, { $limit: limit }],
                    total: [{ $count: "count" }]
                }
            }
        );

        const [result] = await Purchase.aggregate(pipeline)
            .collation({ locale: "en", strength: 2 });

        const items = result?.items || [];
        const totalItems = result?.total?.[0]?.count || 0;
        const totalPages = Math.ceil(totalItems / limit);

        // ---- Teacher + comics (sirf zaroori fields) ----
        const bundles = items.map((p) => p.bundle);
        await ComicBundle.populate(bundles, [
            { path: "teacherId", select: "firstname lastname", options: { lean: true } },
            { path: "comics", select: "title subject concept grade seriesId partNumber", options: { lean: true } }
        ]);

        const pageMap = await getPageStats(bundles.flatMap((b) => (b.comics || []).map((c) => c._id)));

        // Response ka shape pehle jaisa: purchase + bundleId (populated)
        const data = items.map(({ bundle, paidAmount, ...purchase }) => ({
            ...purchase,
            amount: paidAmount,
            bundleId: {
                ...bundle,
                comics: (bundle.comics || []).map((comic) => ({
                    ...(comic.toObject ? comic.toObject() : comic),
                    thumbnail: pageMap.get(String(comic._id))?.thumbnail || null
                }))
            }
        }));

        return res.json({
            error: false,
            data,
            pagination: {
                currentPage: page,
                limit,
                totalItems,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });

    } catch (error) {
        console.log("getMyPurchases error:", error);
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};


const getMySales = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        const bundleIds = await ComicBundle.find({ teacherId: userId }).distinct("_id");

        // Sirf successful payments hi "sale" hain
        const sales = await Purchase.find({
            bundleId: { $in: bundleIds },
            paymentStatus: "success"
        })
            .populate("userId", "firstname email")
            .populate("bundleId", "title price")
            .sort({ createdAt: -1 });

        return res.json({
            error: false,
            data: sales
        });

    } catch (error) {
        console.log("getMySales error:", error);
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
        console.log("getTransactions error:", error);
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};


const COMIC_DETAIL_FIELDS = [
    "_id", "title", "subject", "concept", "subjectId", "conceptId",
    "seriesId", "partNumber", "themeId", "styleId", "grade",
    "country", "countries", "hasQuiz", "pdfUrl", "createdAt"
].join(" ");

const getPurchasedBundleDetails = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const { bundleId } = req.params;

        if (!isValidId(bundleId)) {
            return res.status(400).json({ error: true, message: "Invalid bundle id" });
        }

        // 🔒 Purchase check + bundle ek saath (parallel)
        const [purchase, bundle] = await Promise.all([
            Purchase.findOne({ userId, bundleId, paymentStatus: "success" })
                .select("_id createdAt transactionId amount")
                .lean(),

            ComicBundle.findById(bundleId)
                .select("_id title description price teacherId comics createdAt averageRating totalRatings status")
                .populate({ path: "teacherId", select: "firstname lastname email" })
                .populate({
                    path: "comics",
                    select: COMIC_DETAIL_FIELDS,
                    populate: [
                        { path: "subjectId", select: "name" },
                        { path: "conceptId", select: "name" },
                        {
                            path: "seriesId",
                            select: "title concept grade country countries subjectId conceptId",
                            populate: [
                                { path: "subjectId", select: "name" },
                                { path: "conceptId", select: "name" }
                            ]
                        },
                        { path: "themeId", select: "name" },
                        { path: "styleId", select: "name" }
                    ]
                })
                .lean()
        ]);

        if (!purchase) {
            return res.status(403).json({
                error: true,
                message: "Access denied. Please purchase this bundle."
            });
        }

        if (!bundle) {
            return res.status(404).json({
                error: true,
                message: "Bundle not found"
            });
        }

        const pageMap = await getPageStats((bundle.comics || []).map((c) => c._id));

        const comics = (bundle.comics || []).map((comic) => {
            const series = comic.seriesId;
            const stats = pageMap.get(String(comic._id));

            return {
                ...comic,
                seriesId: series?._id || null,
                pageCount: stats?.pageCount || 0,
                thumbnail: stats?.thumbnail || null,
                series: series
                    ? {
                        _id: series._id,
                        title: series.title,
                        concept: series.concept,
                        conceptName: series.conceptId?.name || null,
                        grade: series.grade,
                        country: series.country,
                        countries: series.countries,
                        subjectName: series.subjectId?.name || null,
                        partNumber: comic.partNumber
                    }
                    : null,
                subjectName: comic.subjectId?.name || comic.subject || "N/A",
                conceptName: getConceptName(comic)
            };
        });

        return res.json({
            error: false,
            data: {
                ...bundle,
                comics,
                purchaseDate: purchase.createdAt,
                purchaseId: purchase._id,
                transactionId: purchase.transactionId || null,
                amountPaid: purchase.amount ?? bundle.price
            }
        });

    } catch (error) {
        console.log("getPurchasedBundleDetails error:", error);
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};


// =====================================================================
// Comic Reader
// =====================================================================

const getComicReader = async (req, res) => {
    try {
        const { comicId } = req.params;

        if (!isValidId(comicId)) {
            return res.status(400).json({ error: true, message: "Invalid comic id" });
        }

        const comic = await Comic.findById(comicId).select("-prompt -story -userStory").lean();

        if (!comic) {
            return res.status(404).json({
                error: true,
                message: "Comic not found"
            });
        }

        // 🔒 Access check (pehle comment out tha: koi bhi kisi ki bhi
        //    comic + quiz answers dekh sakta tha)
        if (!(await hasComicAccess(req.user.login_data, comic))) {
            return res.status(403).json({
                error: true,
                message: "Access denied. Please purchase this bundle."
            });
        }

        // Saara content parallel me
        const [pages, faqs, facts, quiz, hardcoreQuiz] = await Promise.all([
            ComicPage.find({ comicId }).sort({ pageNumber: 1, createdAt: 1 }).lean(),
            FAQ.find({ comicId }).lean(),
            DidYouKnow.find({ comicId }).lean(),
            Quiz.find({ comicId })
                .populate({
                    path: "questions",
                    select: "question options correctAnswer explanation difficulty"
                })
                .lean(),
            HardcoreQuiz.find({ comicId })
                .populate({
                    path: "questions",
                    select: "question options correctAnswer explanation difficulty hint"
                })
                .lean()
        ]);

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
        console.log("getComicReader error:", error);
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};


// =====================================================================
// Comic PDF: comic pages + FAQ + Did You Know + Quiz + Hardcore Quiz
// GET /user/comic-pdf/:comicId
// =====================================================================

// Hindi / dusri languages ke liye Unicode font yahan rakho (optional)
const FONT_DIR = path.join(__dirname, "../../assets/fonts"); // apne project ke hisaab se path badlo
const CUSTOM_FONT = {
    regular: path.join(FONT_DIR, "NotoSans-Regular.ttf"),
    bold: path.join(FONT_DIR, "NotoSans-Bold.ttf")
};
const hasCustomFont = fs.existsSync(CUSTOM_FONT.regular) && fs.existsSync(CUSTOM_FONT.bold);

const FONT = {
    regular: hasCustomFont ? "Body" : "Helvetica",
    bold: hasCustomFont ? "BodyBold" : "Helvetica-Bold"
};

// Helvetica emoji / non-Latin nahi dikha pata, custom font na ho to hata do
const cleanText = (value) => {
    const text = String(value ?? "").trim();
    if (hasCustomFont) return text;
    return text
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2013\u2014]/g, "-")
        .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "")
        .trim();
};

// A4 ki chaudai (points me). Comic pages bhi isi width pe aate hain.
const PDF_PAGE_WIDTH = 595.28;
const SECTION_PAGE = { size: "A4", margin: 40 };

// FAQ / facts / quiz pages ke font sizes (bachchon ke liye thode bade)
const PDF_TEXT = {
    title: 28,       // Section heading (pehle 24)
    subtitle: 13,    // Heading ke neeche "5 questions..." (pehle 11)
    subHeading: 20,  // "Quiz - Answer Key" (pehle 17)
    question: 17,    // Q1. Question (pehle 14)
    body: 15,        // Answer / fact / correct answer (pehle 13)
    option: 15,      // A. B. C. D. options (pehle 13)
    small: 13,       // Explanation, "Fact 1" (pehle 11)
    tiny: 12         // Difficulty (pehle 10)
};
const PDF_COLORS = {
    heading: "#1f2937",
    text: "#111827",
    muted: "#6b7280",
    line: "#e5e7eb",
    correct: "#15803d",
    hint: "#b45309",
    accent: "#4f46e5"
};

// ---------------------------------------------------------------------
// Watermark (har page pe): beech me tircha "Kridemy" + niche-right "© Kridemy"
// ---------------------------------------------------------------------
const WATERMARK = {
    text: "Kridemy",
    color: "#6b7280",
    angle: -35,
    textPageOpacity: 0.07,  // FAQ / quiz pages (text ke peeche)
    imagePageOpacity: 0.16  // comic pages (image ke upar, isliye thoda gehra)
};

const drawWatermark = (doc, opacity) => {
    const { width, height } = doc.page;

    // Pehle ki state yaad rakho, warna aage ka text galat jagah / galat font me aayega
    const prev = {
        x: doc.x,
        y: doc.y,
        font: doc._font,
        fontSize: doc._fontSize,
        bottomMargin: doc.page.margins.bottom
    };

    // Neeche footer likhne pe pdfkit apne aap naya page na bana de
    doc.page.margins.bottom = 0;

    // Beech me bada tircha naam
    const size = Math.min(width, height) * 0.18;
    doc.save();
    doc.font(FONT.bold).fontSize(size).fillColor(WATERMARK.color).fillOpacity(opacity);
    const textWidth = doc.widthOfString(WATERMARK.text);
    doc.rotate(WATERMARK.angle, { origin: [width / 2, height / 2] });
    doc.text(WATERMARK.text, width / 2 - textWidth / 2, height / 2 - size / 2, { lineBreak: false });
    doc.restore();

    // Niche-right chhota label
    const footerText = `\u00A9 ${WATERMARK.text}`;
    const footerSize = Math.max(8, Math.min(width, height) * 0.018);
    doc.save();
    doc.font(FONT.bold).fontSize(footerSize).fillColor(WATERMARK.color)
        .fillOpacity(Math.min(opacity * 4, 0.6));
    const footerWidth = doc.widthOfString(footerText);
    doc.text(footerText, width - footerWidth - footerSize * 1.5, height - footerSize * 2.5, { lineBreak: false });
    doc.restore();

    // State wapas
    doc.page.margins.bottom = prev.bottomMargin;
    doc._font = prev.font;
    doc._fontSize = prev.fontSize;
    doc.x = prev.x;
    doc.y = prev.y;
};

// Image download; fail ho to null
const fetchImage = async (url) => {
    if (!url) return null;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        return Buffer.from(await response.arrayBuffer());
    } catch {
        return null;
    }
};

const contentWidth = (doc) => doc.page.width - doc.page.margins.left - doc.page.margins.right;

const ensureSpace = (doc, needed) => {
    if (doc.y + needed > doc.page.height - doc.page.margins.bottom) {
        doc.addPage(SECTION_PAGE);
    }
};

const addSectionPage = (doc, title, subtitle) => {
    doc.addPage(SECTION_PAGE);

    doc.font(FONT.bold).fontSize(PDF_TEXT.title).fillColor(PDF_COLORS.heading).text(cleanText(title));
    if (subtitle) {
        doc.moveDown(0.2).font(FONT.regular).fontSize(PDF_TEXT.subtitle).fillColor(PDF_COLORS.muted).text(cleanText(subtitle));
    }

    doc.moveDown(0.6);
    const y = doc.y;
    doc.moveTo(doc.page.margins.left, y)
        .lineTo(doc.page.width - doc.page.margins.right, y)
        .lineWidth(1)
        .strokeColor(PDF_COLORS.line)
        .stroke();
    doc.moveDown(1);
};

const addSubHeading = (doc, text) => {
    ensureSpace(doc, 60);
    doc.moveDown(0.5);
    doc.font(FONT.bold).fontSize(PDF_TEXT.subHeading).fillColor(PDF_COLORS.accent).text(cleanText(text));
    doc.moveDown(0.6);
};

const writeLabelled = (doc, label, value, color = PDF_COLORS.text) => {
    const text = cleanText(value);
    if (!text) return;
    doc.font(FONT.bold).fontSize(PDF_TEXT.body).fillColor(color).text(`${cleanText(label)} `, { continued: true });
    doc.font(FONT.regular).fillColor(PDF_COLORS.text).text(text);
};

// Image ko max size me fit karo (JPEG/PNG ke alawa skip)
// FAQ / Did You Know images: poori chaudai (page ki margin ke andar)
// Height max page ke usable hisse ka 70% -> isse lambi image page se bahar nahi jayegi
const IMAGE_MAX_HEIGHT_RATIO = 0.7;

const drawImage = (doc, buffer) => {
    if (!buffer) return;
    try {
        const img = doc.openImage(buffer);

        const usableHeight = doc.page.height - doc.page.margins.top - doc.page.margins.bottom;
        const maxWidth = contentWidth(doc);
        const maxHeight = usableHeight * IMAGE_MAX_HEIGHT_RATIO;

        // Choti image bhi badi hogi (poori chaudai tak), lambi image height limit pe rukegi
        const scale = Math.min(maxWidth / img.width, maxHeight / img.height);
        const width = img.width * scale;
        const height = img.height * scale;

        // Jagah nahi bachi to naya page (phir x calculate karo)
        ensureSpace(doc, height + 12);

        // Height limit ki wajah se image patli hui to beech me rakho
        const x = doc.page.margins.left + (contentWidth(doc) - width) / 2;

        doc.image(img, x, doc.y, { width, height });
        doc.y += height + 12;
    } catch {
        // unsupported image format (sirf JPEG/PNG chalte hain)
    }
};

const optionLetter = (index) => String.fromCharCode(65 + index);

const formatCorrectAnswer = (question) => {
    const index = (question.options || []).findIndex((o) => o === question.correctAnswer);
    return index >= 0
        ? `${optionLetter(index)}. ${question.correctAnswer}`
        : question.correctAnswer;
};

const writeFaqSection = (doc, faqs, imageMap) => {
    addSectionPage(doc, "Frequently Asked Questions", `${faqs.length} questions`);

    faqs.forEach((faq, i) => {
        ensureSpace(doc, 70);
        doc.font(FONT.bold).fontSize(PDF_TEXT.question).fillColor(PDF_COLORS.text)
            .text(`Q${i + 1}. ${cleanText(faq.question)}`, { width: contentWidth(doc) });
        doc.moveDown(0.3);

        drawImage(doc, imageMap.get(faq.imageUrl));

        doc.font(FONT.regular).fontSize(PDF_TEXT.body).fillColor(PDF_COLORS.text)
            .text(cleanText(faq.answer), { width: contentWidth(doc) });
        doc.moveDown(1);
    });
};

const writeFactsSection = (doc, facts, imageMap) => {
    addSectionPage(doc, "Did You Know?", `${facts.length} facts`);

    facts.forEach((fact, i) => {
        ensureSpace(doc, 60);
        drawImage(doc, imageMap.get(fact.imageUrl));

        doc.font(FONT.bold).fontSize(PDF_TEXT.small).fillColor(PDF_COLORS.accent).text(`Fact ${i + 1}`);
        doc.moveDown(0.2);
        doc.font(FONT.regular).fontSize(PDF_TEXT.body).fillColor(PDF_COLORS.text)
            .text(cleanText(fact.fact), { width: contentWidth(doc) });
        doc.moveDown(1);
    });
};

const writeQuizSection = (doc, title, questions, { showHints = false } = {}) => {
    addSectionPage(doc, title, `${questions.length} questions - answers are at the end of this section`);

    questions.forEach((q, i) => {
        const optionCount = q.options?.length || 0;
        // ensureSpace(doc, 60 + optionCount * 22);
        ensureSpace(doc, 70 + optionCount * 26);

        doc.font(FONT.bold).fontSize(PDF_TEXT.question).fillColor(PDF_COLORS.text)
            .text(`Q${i + 1}. ${cleanText(q.question)}`, { width: contentWidth(doc) });

        if (q.difficulty) {
            doc.font(FONT.regular).fontSize(PDF_TEXT.tiny).fillColor(PDF_COLORS.muted)
                .text(`Difficulty: ${cleanText(q.difficulty).toUpperCase()}`);
        }
        doc.moveDown(0.3);

        (q.options || []).forEach((option, optIndex) => {
            doc.font(FONT.regular).fontSize(PDF_TEXT.option).fillColor(PDF_COLORS.text)
                .text(`${optionLetter(optIndex)}. ${cleanText(option)}`, {
                    indent: 15,
                    width: contentWidth(doc) - 15
                });
        });

        if (showHints && q.hint) {
            doc.moveDown(0.3);
            writeLabelled(doc, "Hint:", q.hint, PDF_COLORS.hint);
        }

        doc.moveDown(1);
    });

    addSubHeading(doc, `${title} - Answer Key`);

    questions.forEach((q, i) => {
        ensureSpace(doc, 45);
        doc.font(FONT.bold).fontSize(PDF_TEXT.body).fillColor(PDF_COLORS.correct)
            .text(`Q${i + 1}. ${cleanText(formatCorrectAnswer(q))}`, { width: contentWidth(doc) });

        if (q.explanation) {
            doc.font(FONT.regular).fontSize(PDF_TEXT.small).fillColor(PDF_COLORS.muted)
                .text(cleanText(q.explanation), { width: contentWidth(doc) });
        }
        doc.moveDown(0.7);
    });
};

const downloadComicPdf = async (req, res) => {
    try {
        const { comicId } = req.params;

        if (!isValidId(comicId)) {
            return res.status(400).json({ error: true, message: "Invalid comic id" });
        }

        const comic = await Comic.findById(comicId).select("_id title user_id").lean();

        if (!comic) {
            return res.status(404).json({ error: true, message: "Comic not found" });
        }

        if (!(await hasComicAccess(req.user.login_data, comic))) {
            return res.status(403).json({
                error: true,
                message: "Access denied. Please purchase this bundle."
            });
        }

        const [pages, faqs, facts, quizzes, hardcoreQuizzes] = await Promise.all([
            ComicPage.find({ comicId })
                .sort({ pageNumber: 1, createdAt: 1 })
                .select("imageUrl")
                .lean(),
            FAQ.find({ comicId }).lean(),
            DidYouKnow.find({ comicId }).lean(),
            Quiz.find({ comicId })
                .populate({ path: "questions", select: "question options correctAnswer explanation difficulty" })
                .lean(),
            HardcoreQuiz.find({ comicId })
                .populate({ path: "questions", select: "question options correctAnswer explanation difficulty hint" })
                .lean()
        ]);

        const pageUrls = pages.map((p) => p.imageUrl).filter(Boolean);

        if (!pageUrls.length) {
            return res.status(404).json({ error: true, message: "This comic has no pages yet" });
        }

        const quizQuestions = quizzes.flatMap((q) => q.questions || []).filter((q) => q?.question);
        const hardcoreQuestions = hardcoreQuizzes.flatMap((q) => q.questions || []).filter((q) => q?.question);
        const validFaqs = faqs.filter((f) => f.question || f.answer);
        const validFacts = facts.filter((f) => f.fact);

        const extraImageUrls = [...new Set(
            [...validFaqs, ...validFacts].map((item) => item.imageUrl).filter(Boolean)
        )];

        const [pageBuffers, extraBuffers] = await Promise.all([
            Promise.all(pageUrls.map(async (url) => {
                const buffer = await fetchImage(url);
                if (!buffer) throw new Error(`Page image fetch failed: ${url}`);
                return buffer;
            })),
            Promise.all(extraImageUrls.map(fetchImage))
        ]);

        const imageMap = new Map(extraImageUrls.map((url, i) => [url, extraBuffers[i]]));

        const doc = new PDFDocument({
            autoFirstPage: false,
            size: "A4",
            margin: 50,
            info: { Title: cleanText(comic.title) || "Comic" }
        });

        if (hasCustomFont) {
            doc.registerFont(FONT.regular, CUSTOM_FONT.regular);
            doc.registerFont(FONT.bold, CUSTOM_FONT.bold);
        }

        // 💧 Har naye text page (FAQ / facts / quiz, aur text lamba hone pe
        // apne aap bane pages) pe watermark, content ke PEECHE
        let isComicImagePage = false;
        doc.on("pageAdded", () => {
            if (!isComicImagePage) drawWatermark(doc, WATERMARK.textPageOpacity);
        });

        // Pages pehle open karo: kharab image ho to stream se pehle error aaye
        const pageImages = pageBuffers.map((buf) => doc.openImage(buf));

        const safeName =
            (comic.title || "comic")
                .replace(/[^a-z0-9-_ ]/gi, "")
                .trim()
                .replace(/\s+/g, "_") || "comic";

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${safeName}.pdf"`);

        doc.pipe(res);

        // 1. Comic pages: A4 width pe fit (FAQ/quiz pages ke barabar chaudai),
        //    taaki viewer me sab pages ek jaise size me dikhein.
        //    Image ki asli resolution PDF me waisi hi rehti hai, quality nahi girti.
        //    Watermark image ke UPAR (peeche hota to image chhupa deti)
        pageImages.forEach((img) => {
            const pageHeight = img.height * (PDF_PAGE_WIDTH / img.width);

            isComicImagePage = true;
            doc.addPage({ size: [PDF_PAGE_WIDTH, pageHeight], margin: 0 });
            doc.image(img, 0, 0, { width: PDF_PAGE_WIDTH, height: pageHeight });
            drawWatermark(doc, WATERMARK.imagePageOpacity);
            isComicImagePage = false;
        });

        // 2-5. Learning content (khali section skip)
        if (validFaqs.length) writeFaqSection(doc, validFaqs, imageMap);
        if (validFacts.length) writeFactsSection(doc, validFacts, imageMap);
        if (quizQuestions.length) writeQuizSection(doc, "Quiz", quizQuestions);
        if (hardcoreQuestions.length) {
            writeQuizSection(doc, "Hardcore Quiz", hardcoreQuestions, { showHints: true });
        }

        doc.end();
    } catch (error) {
        console.error("downloadComicPdf error:", error);
        if (!res.headersSent) {
            return res.status(500).json({ error: true, message: "Failed to generate PDF" });
        }
        res.end();
    }
};


// =====================================================================
// Ratings
// =====================================================================

const rateBundle = async (req, res) => {
    try {
        const { bundleId } = req.body;
        const rating = Number(req.body.rating);

        // Pehle `req.user.id` tha jo undefined aata tha (baaki sab jagah login_data._id)
        const userId = req.user.login_data._id;

        if (!isValidId(bundleId)) {
            return res.status(400).json({ success: false, message: "Invalid bundle id" });
        }

        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: "Rating must be between 1 and 5" });
        }

        // Sirf kharidne wala hi rate kar sake
        const purchase = await Purchase.exists({ userId, bundleId, paymentStatus: "success" });
        if (!purchase) {
            return res.status(403).json({ success: false, message: "Only buyers can rate this bundle" });
        }

        await BundleRating.findOneAndUpdate(
            { bundleId, userId },
            { rating },
            { upsert: true, new: true }
        );

        // Average DB me hi calculate (saari ratings memory me load nahi)
        const [summary] = await BundleRating.aggregate([
            { $match: { bundleId: new mongoose.Types.ObjectId(String(bundleId)) } },
            { $group: { _id: null, average: { $avg: "$rating" }, total: { $sum: 1 } } }
        ]);

        await ComicBundle.findByIdAndUpdate(bundleId, {
            averageRating: Number((summary?.average || 0).toFixed(1)),
            totalRatings: summary?.total || 0
        });

        return res.json({
            success: true,
            message: "Rating submitted successfully"
        });

    } catch (err) {
        console.log("rateBundle error:", err);
        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};


const getBundleRatings = async (req, res) => {
    try {
        if (!isValidId(req.params.bundleId)) {
            return res.status(400).json({ success: false, message: "Invalid bundle id" });
        }

        const bundle = await ComicBundle.findById(req.params.bundleId)
            .select("averageRating totalRatings")
            .lean();

        return res.json({
            success: true,
            data: bundle
        });

    } catch (err) {
        console.log("getBundleRatings error:", err);
        return res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
};


// =====================================================================
// Teacher sales dashboard
// =====================================================================

const getTeacherSalesDashboard = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        const bundleIds = await ComicBundle.find({ teacherId: userId }).distinct("_id");

        const purchases = await Purchase.find({
            bundleId: { $in: bundleIds },
            paymentStatus: "success"
        })
            .populate("userId", "firstname lastname email")
            .populate("bundleId", "title")
            .sort({ createdAt: -1 });

        // teacherAmount kabhi missing ho to NaN na aaye
        const amountOf = (p) => Number(p.teacherAmount) || 0;

        const totalSales = purchases.length;
        const totalRevenue = purchases.reduce((sum, p) => sum + amountOf(p), 0);
        const pendingPayouts = purchases.filter((p) => p.teacherPayoutStatus === "pending").length;
        const failedPayouts = purchases.filter((p) => p.teacherPayoutStatus === "failed").length;

        // Group by bundle (deleted bundle pe crash na ho)
        const bundleSales = {};
        purchases.forEach((p) => {
            const bundleTitle = p.bundleId?.title || "Deleted bundle";
            if (!bundleSales[bundleTitle]) {
                bundleSales[bundleTitle] = { count: 0, revenue: 0 };
            }
            bundleSales[bundleTitle].count++;
            bundleSales[bundleTitle].revenue += amountOf(p);
        });

        return res.json({
            error: false,
            data: {
                summary: {
                    totalSales,
                    totalRevenue,
                    pendingPayouts,
                    failedPayouts
                },
                bundleSales,
                recentSales: purchases.slice(0, 20)
            }
        });

    } catch (error) {
        console.log("getTeacherSalesDashboard error:", error);
        return res.status(500).json({
            error: true,
            message: "Error fetching sales dashboard"
        });
    }
};


module.exports = {
    createBundle,
    getBundleDetails,
    publishBundle,
    getMarketplace,
    getTeacherBundles,
    getTransactions,
    getMySales,
    getMyPurchases,
    getPurchasedBundleDetails,
    getComicReader,
    downloadComicPdf,
    rateBundle,
    getBundleRatings,
    getTeacherSalesDashboard,
    getMarketplaceStatus,
    deleteBundle,
    getMyComicsForBundle,
    updateBundle
};