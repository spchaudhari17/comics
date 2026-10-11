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


const deleteBundle = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const { bundleId } = req.params;

        // Find bundle
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

        // Delete bundle
        await ComicBundle.findByIdAndDelete(bundleId);

        return res.status(200).json({
            error: false,
            message: "Bundle deleted successfully"
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
//             .populate({
//                 path: "teacherId",
//                 select: "firstname lastname email"
//             })
//             .populate({
//                 path: "comics",
//                 populate: [
//                     {
//                         path: "subjectId",
//                         select: "name"
//                     },
//                     {
//                         path: "conceptId",
//                         select: "name"
//                     },
//                     {
//                         path: "seriesId",
//                         select: "title concept grade country subjectId conceptId"
//                     },
//                     {
//                         path: "themeId",
//                         select: "name"
//                     },
//                     {
//                         path: "styleId",
//                         select: "name"
//                     }
//                 ]
//             });

//         if (!bundle) {
//             return res.status(404).json({
//                 error: true,
//                 message: "Bundle not found"
//             });
//         }

//         // 🔥 attach thumbnail
//         const comicsWithThumb = await Promise.all(
//             bundle.comics.map(async (comic) => {
//                 const page = await ComicPage.findOne({ comicId: comic._id });

//                 let seriesDetails = null;
//                 if (comic.seriesId) {
//                     const series = await ComicSeries.findById(comic.seriesId)
//                         .populate("subjectId", "name")
//                         .populate("conceptId", "name");
//                     seriesDetails = series;
//                 }

//                 return {
//                     ...comic.toObject(),
//                     thumbnail: page?.imageUrl || null,
//                     series: seriesDetails ? {
//                         _id: seriesDetails._id,
//                         title: seriesDetails.title,
//                         concept: seriesDetails.concept,
//                         conceptName: seriesDetails.conceptId?.name || null,
//                         grade: seriesDetails.grade,
//                         country: seriesDetails.country,
//                         countries: seriesDetails.countries,
//                         subjectName: seriesDetails.subjectId?.name || null,
//                         partNumber: comic.partNumber
//                     } : null,
//                     subjectName: comic.subjectId?.name || comic.subject || "N/A",
//                     conceptName: comic.conceptId?.name || comic.concept || "N/A"
//                 };
//             })
//         );

//         const response = {
//             ...bundle.toObject(),
//             comics: comicsWithThumb
//         };

//         return res.json({
//             error: false,
//             data: response
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
            .select(
                "_id title price description teacherId comics createdAt averageRating totalRatings"
            )
            .populate({
                path: "teacherId",
                select: "_id firstname lastname email username"
            })
            .populate({
                path: "comics",
                select: `
                    _id
                    title
                    subject
                    concept
                    subjectId
                    conceptId
                    seriesId
                    themeId
                    styleId
                    hasQuiz
                    createdAt
                    partNumber
                `,
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
                        select: "title concept grade country countries subjectId conceptId",
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

        // Attach thumbnail + required comic details
        const comics = await Promise.all(
            bundle.comics.map(async (comic) => {
                const page = await ComicPage.findOne(
                    { comicId: comic._id },
                    { imageUrl: 1 }
                ).lean();

                const series = comic.seriesId;

                return {
                    _id: comic._id,
                    title: comic.title,

                    thumbnail: page?.imageUrl || null,

                    subjectName:
                        comic.subjectId?.name ||
                        comic.subject ||
                        "N/A",

                    conceptName:
                        comic.conceptId?.name ||
                        comic.concept ||
                        "N/A",

                    theme: comic.themeId?.name || "N/A",
                    style: comic.styleId?.name || "N/A",

                    hasQuiz: comic.hasQuiz || false,
                    createdAt: comic.createdAt,

                    series: series
                        ? {
                            _id: series._id,
                            title: series.title,
                            concept: series.concept,
                            conceptName:
                                series.conceptId?.name || null,
                            grade: series.grade,
                            country: series.country,
                            countries: series.countries,
                            subjectName:
                                series.subjectId?.name || null,
                            partNumber: comic.partNumber || null
                        }
                        : null
                };
            })
        );

        // Only send required bundle data
        const response = {
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
        };

        return res.json({
            error: false,
            data: response
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

        // ---------------- Search ke liye teacher + comic ids ----------------
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

        // ---------------- Purchases + bundle (ek query) ----------------
        const pipeline = [
            // Sirf successful payments (purchasedBundleDetails bhi yahi check karta hai,
            // warna "Open" pe 403 aata)
            { $match: { userId, paymentStatus: "success" } },
            {
                $lookup: {
                    from: ComicBundle.collection.name,
                    localField: "bundleId",
                    foreignField: "_id",
                    as: "bundle"
                }
            },
            // Delete ho chuke bundles ko hata do (pehle inse frontend crash hota tha)
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
            .collation({ locale: "en", strength: 2 }); // title A-Z case-insensitive

        const items = result?.items || [];
        const totalItems = result?.total?.[0]?.count || 0;
        const totalPages = Math.ceil(totalItems / limit);

        // ---------------- Teacher + comics (sirf zaroori fields) ----------------
        const bundles = items.map((p) => p.bundle);
        await ComicBundle.populate(bundles, [
            { path: "teacherId", select: "firstname lastname" },
            { path: "comics", select: "title subject concept grade seriesId partNumber" }
        ]);

        // ---------------- Thumbnails: ek hi query ----------------
        const allComicIds = bundles.flatMap((b) => (b.comics || []).map((c) => c._id));
        const thumbs = allComicIds.length
            ? await ComicPage.aggregate([
                { $match: { comicId: { $in: allComicIds } } },
                { $sort: { pageNumber: 1, createdAt: 1 } },
                { $group: { _id: "$comicId", imageUrl: { $first: "$imageUrl" } } }
            ])
            : [];
        const thumbMap = new Map(thumbs.map((t) => [String(t._id), t.imageUrl]));

        // Response ka shape pehle jaisa: purchase + bundleId (populated)
        const data = items.map(({ bundle, paidAmount, ...purchase }) => ({
            ...purchase,
            amount: paidAmount,
            bundleId: {
                ...bundle,
                comics: (bundle.comics || []).map((comic) => ({
                    ...(comic.toObject ? comic.toObject() : comic),
                    thumbnail: thumbMap.get(String(comic._id)) || null
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


const mongoose = require("mongoose");

// const getMarketplace = async (req, res) => {
//     try {
//         const {
//             page = 1,
//             limit = 10,
//             search,
//             subjectId,
//             conceptId,
//             grade,
//             country,
//             teacherId,
//             sort = "latest"
//         } = req.query;

//         const pageNumber = Math.max(parseInt(page) || 1, 1);
//         const limitNumber = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
//         const skip = (pageNumber - 1) * limitNumber;

//         // --------------------------------
//         // 1. Build Comic Filter
//         // --------------------------------
//         const comicFilter = {};
//         const andConditions = [];

//         // Helper: valid ObjectId?
//         const isValidId = (v) => mongoose.Types.ObjectId.isValid(v);

//         // ---- Subject ----
//         if (subjectId) {
//             if (isValidId(subjectId)) {
//                 andConditions.push({ subjectId });
//             } else {
//                 // match by name on populated ref OR plain 'subject' field
//                 andConditions.push({
//                     $or: [
//                         { subject: subjectId },
//                         // we can't query populated name directly; but if Comic
//                         // also stores subject as a string, this works.
//                     ]
//                 });
//             }
//         }

//         // ---- Concept ----
//         if (conceptId) {
//             if (isValidId(conceptId)) {
//                 andConditions.push({ conceptId });
//             } else {
//                 andConditions.push({
//                     $or: [
//                         { concept: conceptId }
//                     ]
//                 });
//             }
//         }

//         // ---- Grade ----
//         if (grade) {
//             andConditions.push({ grade });
//         }

//         // ---- Country ----
//         if (country) {
//             andConditions.push({ country });
//         }

//         // ---- Search (comic title) ----
//         if (search) {
//             andConditions.push({
//                 title: { $regex: search, $options: "i" }
//             });
//         }

//         if (andConditions.length) {
//             comicFilter.$and = andConditions;
//         }

//         // --------------------------------
//         // 2. Find Comics based on filters
//         // --------------------------------
//         let filteredComicIds = null;

//         if (Object.keys(comicFilter).length > 0) {
//             const comics = await Comic.find(comicFilter).select("_id");
//             filteredComicIds = comics.map((c) => c._id);

//             if (filteredComicIds.length === 0) {
//                 return res.json({
//                     error: false,
//                     data: [],
//                     pagination: {
//                         currentPage: pageNumber,
//                         limit: limitNumber,
//                         totalItems: 0,
//                         totalPages: 0,
//                         hasNextPage: false,
//                         hasPrevPage: pageNumber > 1
//                     }
//                 });
//             }
//         }

//         // --------------------------------
//         // 3. Build Bundle Filter
//         // --------------------------------
//         const bundleFilter = { status: "published" };

//         if (teacherId) bundleFilter.teacherId = teacherId;

//         if (filteredComicIds) {
//             bundleFilter.comics = { $in: filteredComicIds };
//         }

//         // Search bundle title too
//         if (search) {
//             bundleFilter.$or = [
//                 { title: { $regex: search, $options: "i" } }
//             ];
//             // If you also want to match comics by title, the $in above already handles it.
//         }

//         // --------------------------------
//         // 4. Total Count
//         // --------------------------------
//         const totalItems = await ComicBundle.countDocuments(bundleFilter);
//         const totalPages = Math.ceil(totalItems / limitNumber);

//         // --------------------------------
//         // 5. Sorting
//         // --------------------------------
//         let sortOption = { createdAt: -1 };
//         if (sort === "oldest") sortOption = { createdAt: 1 };

//         // --------------------------------
//         // 6. Paginated Bundles
//         // --------------------------------
//         const bundles = await ComicBundle.find(bundleFilter)
//             .populate({ path: "teacherId", select: "firstname lastname" })
//             .populate({
//                 path: "comics",
//                 select: "title subject concept subjectId conceptId grade country",
//                 populate: [
//                     { path: "subjectId", select: "name" },
//                     { path: "conceptId", select: "name" }
//                 ]
//             })
//             .sort(sortOption)
//             .skip(skip)
//             .limit(limitNumber);

//         // --------------------------------
//         // 7. Add Thumbnails
//         // --------------------------------
//         const bundlesWithThumbnails = await Promise.all(
//             bundles.map(async (bundle) => {
//                 const comicsWithThumb = await Promise.all(
//                     bundle.comics.map(async (comic) => {
//                         const pageDoc = await ComicPage.findOne({ comicId: comic._id }).select("imageUrl");
//                         return {
//                             ...comic.toObject(),
//                             thumbnail: pageDoc?.imageUrl || null
//                         };
//                     })
//                 );
//                 return { ...bundle.toObject(), comics: comicsWithThumb };
//             })
//         );

//         // --------------------------------
//         // 8. Response
//         // --------------------------------
//         return res.json({
//             error: false,
//             data: bundlesWithThumbnails,
//             pagination: {
//                 currentPage: pageNumber,
//                 limit: limitNumber,
//                 totalItems,
//                 totalPages,
//                 hasNextPage: pageNumber < totalPages,
//                 hasPrevPage: pageNumber > 1
//             }
//         });

//     } catch (error) {
//         console.log("getMarketplace Error:", error);
//         return res.status(500).json({ error: true, message: "Server error" });
//     }
// };


const MARKETPLACE_SORTS = {
    latest: { createdAt: -1, _id: -1 },
    oldest: { createdAt: 1, _id: 1 },
    price_low: { price: 1, _id: -1 },
    price_high: { price: -1, _id: -1 },
    rating: { averageRating: -1, totalRatings: -1, _id: -1 },
    title: { title: 1, _id: 1 }
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isValidId = (v) => mongoose.Types.ObjectId.isValid(v);

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

        // --------------------------------
        // 1. Comic filters (subject / concept / grade / country)
        // --------------------------------
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

        // --------------------------------
        // 2. Bundle filter
        // --------------------------------
        const bundleFilter = { status: "published" };

        if (teacherId && isValidId(teacherId)) {
            bundleFilter.teacherId = teacherId;
        }

        if (comicConditions.length) {
            const matchingComicIds = await Comic.find({ $and: comicConditions }).distinct("_id");
            bundleFilter.comics = { $in: matchingComicIds };
        }

        // --------------------------------
        // 3. Search (OR): bundle title/description, comic, teacher
        //    Pehle ye AND ban raha tha (bundle title + comic title dono match
        //    hone chahiye the), isliye zyada tar search khali aata tha
        // --------------------------------
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

        // --------------------------------
        // 4. Sorting
        // --------------------------------
        const sortOption = MARKETPLACE_SORTS[sort] || MARKETPLACE_SORTS.latest;

        // --------------------------------
        // 5. Count + paginated bundles (+ facets agar maange)
        // --------------------------------
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

        // --------------------------------
        // 6. Thumbnails: saari comics ka pehla page, ek hi query me
        // --------------------------------
        const allComicIds = bundles.flatMap((b) => (b.comics || []).map((c) => c._id));

        const thumbs = allComicIds.length
            ? await ComicPage.aggregate([
                { $match: { comicId: { $in: allComicIds } } },
                { $sort: { pageNumber: 1, createdAt: 1 } },
                { $group: { _id: "$comicId", imageUrl: { $first: "$imageUrl" } } }
            ])
            : [];

        const thumbMap = new Map(thumbs.map((t) => [String(t._id), t.imageUrl]));

        const data = bundles.map((bundle) => ({
            ...bundle,
            comics: (bundle.comics || []).map((comic) => ({
                ...comic,
                thumbnail: thumbMap.get(String(comic._id)) || null
            }))
        }));

        // --------------------------------
        // 7. Response
        // --------------------------------
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






const COMIC_FIELDS = [
    "_id", "title", "subject", "concept", "subjectId", "conceptId",
    "seriesId", "partNumber", "themeId", "styleId", "grade",
    "country", "countries", "hasQuiz", "pdfUrl", "createdAt"
].join(" ");

const getPurchasedBundleDetails = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const { bundleId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(bundleId)) {
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
                    select: COMIC_FIELDS,
                    populate: [
                        { path: "subjectId", select: "name" },
                        { path: "conceptId", select: "name" },
                        {
                            // Series ek hi baar, uske subject/concept ke saath
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

        // 📄 Har comic ka page count + pehla page (thumbnail) -> ek hi query
        const comicIds = (bundle.comics || []).map((c) => c._id);

        const pageStats = comicIds.length
            ? await ComicPage.aggregate([
                { $match: { comicId: { $in: comicIds } } },
                { $sort: { pageNumber: 1, createdAt: 1 } },
                {
                    $group: {
                        _id: "$comicId",
                        pageCount: { $sum: 1 },
                        thumbnail: { $first: "$imageUrl" }
                    }
                }
            ])
            : [];

        const pageMap = new Map(pageStats.map((p) => [String(p._id), p]));

        const comics = (bundle.comics || []).map((comic) => {
            const series = comic.seriesId;
            const stats = pageMap.get(String(comic._id));

            return {
                ...comic,
                // seriesId ko pehle jaisa sirf id rakho (frontend `comic.seriesId` id maanta hai)
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
                conceptName: comic.conceptId?.name || comic.concept || "N/A"
            };
        });

        return res.json({
            error: false,
            data: {
                ...bundle,
                comics,
                // ✅ Purchase details
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


const getMyComicsForBundle = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        const comics = await Comic.find({ user_id: userId })
            .select("_id title subject concept subjectId conceptId status createdAt")
            .populate("subjectId", "name")
            .populate("conceptId", "name")
            .sort({ createdAt: -1 })
            .lean();

        const comicIds = comics.map((c) => c._id);

        // Har comic ka pehla page = thumbnail (ek hi query me, N+1 nahi)
        const thumbs = await ComicPage.aggregate([
            { $match: { comicId: { $in: comicIds } } },
            { $sort: { createdAt: 1 } },
            { $group: { _id: "$comicId", imageUrl: { $first: "$imageUrl" } } }
        ]);
        const thumbMap = new Map(thumbs.map((t) => [String(t._id), t.imageUrl]));

        const data = comics.map((c) => ({
            _id: c._id,
            title: c.title,
            subjectName: c.subjectId?.name || c.subject || "N/A",
            conceptName: c.conceptId?.name || c.concept || "N/A",
            thumbnail: thumbMap.get(String(c._id)) || null,
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
//       (warna jinhone kharida hai unka access chala jayega)
// ---------------------------------------------------------------------
const updateBundle = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const { bundleId } = req.params;
        const { title, description, comics, price } = req.body;

        if (!mongoose.Types.ObjectId.isValid(bundleId)) {
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

            if (newIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
                return res.status(400).json({ error: true, message: "Invalid comic id" });
            }

            // Saari comics is teacher ki honi chahiye
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

            // Naya add hone wala comic "approved" hona chahiye (createBundle wala rule)
            // Purani comics ko dobara check nahi kar rahe, taaki purane bundles break na ho
            const notApproved = ownedComics.filter(
                (c) => !oldIds.includes(String(c._id)) && c.status !== "approved"
            );

            if (notApproved.length > 0) {
                return res.status(400).json({
                    error: true,
                    message: "Only approved comics can be added to a bundle"
                });
            }

            // Bundle ka concept FIXED hai: jo comics pehle se bundle me hain unka concept.
            // Nayi comics sirf usi concept ki add ho sakti hain.
            const getConceptName = (c) => c.conceptId?.name || c.concept || "N/A";

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

        // Same shape jo getTeacherBundles deta hai (populated comics)
        const updated = await ComicBundle.findById(bundle._id).populate("comics");

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



module.exports = {
    createBundle, getBundleDetails, publishBundle, getMarketplace, getTeacherBundles, getTransactions, getMySales,
    getMyPurchases, getPurchasedBundleDetails, getComicReader, rateBundle, getBundleRatings, getTeacherSalesDashboard,
    getMarketplaceStatus, deleteBundle, getMyComicsForBundle, updateBundle
}