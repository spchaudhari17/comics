// =====================================================================
// controllers/bundleThumbnailController.js
// Bundle ka AI cover (thumbnail). Page edit jaisa hi credit system:
//   - 1 thumbnail = CREDITS_PER_THUMBNAIL credit (unlimited user ke liye free)
//   - credit atomic katta hai, kam ho to 402 NO_CREDITS
//   - image nahi bani to credit wapas (refund)
//
// Routes:
//   router.post("/user/bundle-thumbnail/generate", authentication, generateBundleThumbnail);
//   router.get("/user/bundle-thumbnails", authentication, getMyBundleThumbnails);
// =====================================================================

const mongoose = require("mongoose");
const sharp = require("sharp");
const Comic = require("../../models/Comic");
const ComicPage = require("../../models/ComicPage");
const User = require("../../models/User");
const CreditTransaction = require("../../models/CreditTransaction");
const GeneratedThumbnail = require("../../models/GeneratedThumbnail");
const { upload_files } = require("../../../helper/helper");
const { generateGeminiComicImage } = require("../../../helper/geminiImage");
const { CREDITS_PER_THUMBNAIL } = require("../../../utils/creditPacks");
const { getStylePrompt } = require("../../../utils/customThemeStyle");

const isValidId = (v) => mongoose.Types.ObjectId.isValid(v);

const INSTRUCTIONS_MAX = 200;
const TITLE_TEXT_MAX = 60;

// Prompt me jaane wala text: newline / extra space hatao, limit lagao
const cleanText = (value, max) =>
    typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

const toPublicThumbnail = (t) => ({
    _id: t._id,
    comicId: t.comicId,
    imageUrl: t.imageUrl,
    instructions: t.instructions || "",
    createdAt: t.createdAt
});

const buildThumbnailPrompt = ({ comic, stylePrompt, titleText, instructions }) => `
Create an eye-catching cover thumbnail for an educational comic bundle for school kids.

Use the attached comic page ONLY as reference for the main characters and the art style.
Show those characters together in ONE exciting, colourful scene about the topic.

Topic: ${comic.concept || comic.title}
Subject: ${comic.subject || "General"}
Grade: ${comic.grade || "School"}
${stylePrompt ? `\n${stylePrompt}\n` : ""}
Big, clean, correctly spelled title text at the top: "${titleText}"
${instructions ? `\nExtra instructions from the teacher: ${instructions}\n` : ""}
Rules:
- Landscape cover, kid-friendly, bright and high quality
- No comic panels, no speech bubbles, no borders, no watermark
- The title must be the only text in the image
`.trim();

// Ek baar retry (Gemini kabhi kabhi khali response deta hai)
const generateWithRetry = async (prompt, options, retries = 2) => {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await generateGeminiComicImage(prompt, options);
        } catch (err) {
            lastError = err;
            console.warn(`Thumbnail generation attempt ${attempt} failed:`, err.message);
        }
    }
    throw lastError;
};

// POST /user/bundle-thumbnail/generate  body: { comicId, instructions?, titleText? }
const generateBundleThumbnail = async (req, res) => {
    let refunded = false;

    try {
        const userId = req.user.login_data._id;
        const { comicId } = req.body;
        const instructions = cleanText(req.body.instructions, INSTRUCTIONS_MAX);

        if (!isValidId(comicId)) {
            return res.status(400).json({ error: true, message: "Invalid comic id" });
        }

        if (typeof req.body.instructions === "string" && req.body.instructions.trim().length > INSTRUCTIONS_MAX) {
            return res.status(400).json({
                error: true,
                message: `Instructions cannot be longer than ${INSTRUCTIONS_MAX} characters`
            });
        }

        const comic = await Comic.findById(comicId).populate("styleId");
        if (!comic) {
            return res.status(404).json({ error: true, message: "Comic not found" });
        }

        // 🔒 Sirf apni comic ka cover
        if (String(comic.user_id) !== String(userId)) {
            return res.status(403).json({ error: true, message: "You can only create thumbnails for your own comics" });
        }

        // Reference ke liye pehla page chahiye
        const firstPage = await ComicPage.findOne({ comicId })
            .sort({ pageNumber: 1, createdAt: 1 })
            .select("imageUrl")
            .lean();

        if (!firstPage?.imageUrl) {
            return res.status(400).json({ error: true, message: "This comic has no pages yet. Generate the comic first." });
        }

        /* ---------- 💳 Credit kaato (atomic: balance kam ho to kuch nahi katega) ---------- */
        const creditUser = await User.findById(userId).select("isUnlimited editCredits").lean();
        const chargeCredits = !creditUser?.isUnlimited;
        let creditsLeft = null;

        if (chargeCredits) {
            const charged = await User.findOneAndUpdate(
                { _id: userId, editCredits: { $gte: CREDITS_PER_THUMBNAIL } },
                { $inc: { editCredits: -CREDITS_PER_THUMBNAIL } },
                { new: true, projection: { editCredits: 1 } }
            );

            if (!charged) {
                return res.status(402).json({
                    error: true,
                    code: "NO_CREDITS",
                    message: "You don't have enough credits to create a thumbnail. Please buy more credits.",
                    credits: creditUser?.editCredits || 0
                });
            }

            creditsLeft = charged.editCredits;
        }

        let thumbnail;

        try {
            // Reference image (chhoti karke, request halki rahe)
            const refResponse = await fetch(firstPage.imageUrl);
            if (!refResponse.ok) throw new Error(`Reference page fetch failed (${refResponse.status})`);
            const reference = await sharp(Buffer.from(await refResponse.arrayBuffer()))
                .resize({ width: 768, withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toBuffer();

            const titleText = cleanText(req.body.titleText, TITLE_TEXT_MAX) ||
                cleanText(comic.concept, TITLE_TEXT_MAX) ||
                cleanText(comic.title, TITLE_TEXT_MAX);

            const prompt = buildThumbnailPrompt({
                comic,
                stylePrompt: getStylePrompt(comic),
                titleText,
                instructions
            });

            console.log(`🖼️ Generating bundle thumbnail for comic ${comicId}`);

            const rawBuffer = await generateWithRetry(prompt, {
                referenceImages: [{ data: reference, mimeType: "image/jpeg" }],
                aspectRatio: "4:3"
            });

            const buffer = await sharp(rawBuffer)
                .resize({ width: 1200, withoutEnlargement: true })
                .jpeg({ quality: 82 })
                .toBuffer();

            const fileName = `bundle_thumb_${comicId}_${Date.now()}.jpg`;
            const imageUrl = await upload_files("bundle-thumbnails", {
                name: fileName,
                data: buffer,
                mimetype: "image/jpeg"
            });

            if (!imageUrl || !String(imageUrl).startsWith("http")) {
                throw new Error(`Thumbnail upload failed: ${imageUrl}`);
            }

            thumbnail = await GeneratedThumbnail.create({
                userId,
                comicId,
                imageUrl,
                s3Key: `bundle-thumbnails/${fileName}`,
                instructions
            });
        } catch (generationError) {
            // ❌ Thumbnail nahi bani -> credit wapas
            if (chargeCredits) {
                await User.updateOne({ _id: userId }, { $inc: { editCredits: CREDITS_PER_THUMBNAIL } });
                refunded = true;
                CreditTransaction.create({
                    userId,
                    type: "refund",
                    credits: CREDITS_PER_THUMBNAIL,
                    comicId,
                    note: "Bundle thumbnail generation failed"
                }).catch((err) => console.warn("Refund log failed:", err.message));
            }
            throw generationError;
        }

        // 💳 Kharch ka hisaab (fail ho to bhi thumbnail pe asar nahi)
        if (chargeCredits) {
            CreditTransaction.create({
                userId,
                type: "spend",
                credits: -CREDITS_PER_THUMBNAIL,
                comicId,
                note: "Bundle thumbnail"
            }).catch((err) => console.warn("Spend log failed:", err.message));
        }

        return res.json({
            error: false,
            message: "Thumbnail created",
            thumbnail: toPublicThumbnail(thumbnail),
            creditsLeft,
            creditsCharged: chargeCredits ? CREDITS_PER_THUMBNAIL : 0
        });
    } catch (error) {
        console.error("generateBundleThumbnail error:", error);
        return res.status(500).json({
            error: true,
            refunded,
            message: refunded
                ? "Thumbnail generation failed. Your credit has been refunded. Please try again."
                : "Thumbnail generation failed. Please try again."
        });
    }
};

// GET /user/bundle-thumbnails?comicIds=a,b,c -> teacher ki pehle bani thumbnails
const getMyBundleThumbnails = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const comicIds = String(req.query.comicIds || "")
            .split(",")
            .map((id) => id.trim())
            .filter(isValidId);

        const filter = { userId };
        if (comicIds.length) filter.comicId = { $in: comicIds };

        const thumbnails = await GeneratedThumbnail.find(filter)
            .sort({ createdAt: -1 })
            .limit(50)
            .lean();

        return res.json({ error: false, data: thumbnails.map(toPublicThumbnail) });
    } catch (error) {
        console.error("getMyBundleThumbnails error:", error);
        return res.status(500).json({ error: true, message: "Failed to load thumbnails" });
    }
};

module.exports = { generateBundleThumbnail, getMyBundleThumbnails };
