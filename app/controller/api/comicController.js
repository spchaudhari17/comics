const OpenAI = require("openai");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { upload_files, deleteFiles } = require("../../../helper/helper");
const Comic = require("../../models/Comic");
const Concept = require("../../models/concept");
const ComicPage = require("../../models/ComicPage");
const PDFDocument = require("pdfkit");
const sharp = require("sharp");
const FAQ = require("../../models/FAQ");
const DidYouKnow = require("../../models/DidYouKnow");
const Theme = require("../../models/Theme");
const Style = require("../../models/Style");
const ComicSeries = require("../../models/ComicSeries");
const QuizSubmission = require("../../models/QuizSubmission");
const HardcoreQuizSubmission = require("../../models/HardcoreQuizSubmission");
const { default: mongoose } = require("mongoose");
const HardcoreQuizQuestion = require("../../models/HardcoreQuizQuestion");
const Subject = require("../../models/Subject");
const HardcoreQuiz = require("../../models/HardcoreQuiz");
const Quiz = require("../../models/Quiz");
const ComicView = require("../../models/ComicView");
const User = require("../../models/User");
const transporter = require("../../../config/mailer");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const { generateGeminiComicImage } = require("../../../helper/geminiImage");




function safeJsonParse(str) {
    try {
        if (!str) throw new Error("Empty response");

        if (str.startsWith("```")) {
            str = str.replace(/```json|```/g, "").trim();
        }

        const parsed = JSON.parse(str);

        if (!Array.isArray(parsed)) {
            throw new Error("Expected JSON array");
        }

        return parsed;
    } catch (err) {
        console.error("JSON Parse Error:", err.message);
        console.error("RAW OUTPUT:", str);
        throw new Error("AI returned invalid JSON");
    }
}


const refinePrompt = async (req, res) => {
    const { title, author, subject, story, themeId, styleId, country, grade, subjectId, concept } = req.body;

    try {
        const userId = req.user.login_data._id;
        const user = await User.findById(userId);

        // const SPECIAL_USERS = [
        //     "691ad59476da00fb43b139e6",
        //     "689cb1ca766520d85d519370"
        // ];

        // const isSpecialUser = SPECIAL_USERS.includes(userId.toString());

        if (user?.isUnlimited) {
            console.log("Special user detected → unlimited series generation");
        } else {
            // 🧮 Normal weekly limit check
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

            const seriesCount = await ComicSeries.countDocuments({
                user_id: userId,
                createdAt: { $gte: oneWeekAgo }
            });

            if (seriesCount >= 1) {
                return res.status(403).json({
                    error: "You have reached your weekly limit of 1 new series. Please wait until next week."
                });
            }
        }



        // 🧩 Core setup
        const cleanConcept = concept.trim();

        const theme = await Theme.findById(themeId);
        const style = await Style.findById(styleId);
        if (!theme || !style) {
            return res.status(400).json({ error: "Invalid theme or style" });
        }

        let existingSeries = await ComicSeries.findOne({ concept: cleanConcept, grade }).populate("parts");
        if (existingSeries) {
            return res.status(200).json({ alreadyExists: true, series: existingSeries });
        }

        let conceptDoc = await Concept.findOne({ name: cleanConcept });
        if (!conceptDoc) {
            conceptDoc = await Concept.create({ name: cleanConcept, subjectId });
        }


        // ✅ Normalize country / countries input (handles string or array)
        let finalCountry = "ALL";
        let finalCountries = ["ALL"];

        if (Array.isArray(country) && country.length > 0) {
            // 🟢 Multi-country selection
            if (country.includes("ALL")) {
                finalCountry = "ALL";
                finalCountries = ["ALL"];
            } else {
                finalCountry = country[0];
                finalCountries = country.map((c) => c.trim().toUpperCase());
            }
        } else if (typeof country === "string" && country.trim() !== "") {
            // 🟢 Single country string
            const upper = country.trim().toUpperCase();
            if (upper === "ALL") {
                finalCountry = "ALL";
                finalCountries = ["ALL"];
            } else {
                finalCountry = upper;
                finalCountries = [upper];
            }
        }

        // 🧠 Create new series
        const series = await ComicSeries.create({
            user_id: userId,
            themeId, styleId, subjectId,
            concept: cleanConcept,
            conceptId: conceptDoc._id,
            grade, title, author,
            country: finalCountry,
            countries: finalCountries,
            parts: []
        });

        // 🧠 Step 1: Divide into parts
        const divisionPrompt = `
You are an expert education content designer.

Given the concept "${cleanConcept}" and this story written by the user:
"${story}"

Task:
- Break it into smaller sub-parts suitable for grade ${grade} students.
- Each part should fit an 8–10 page educational comic.
- Return strictly valid JSON array:
[
  { "part": 1, "title": "Part Title", "keyTerms": ["term1"], "start": "Intro", "end": "Conclusion" }
]
`;

        const divisionResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "Return ONLY valid JSON. No markdown, no explanation." },
                { role: "user", content: divisionPrompt }
            ],
            temperature: 0.3,
            max_tokens: 800
        });

        const parts = safeJsonParse(divisionResponse.choices[0].message.content.trim());

        // 🎓 Grade Instruction
        let gradeInstruction = "";
        if (grade) {
            gradeInstruction = `
Adapt tone, difficulty, and visuals for ${grade} students:
- Grades 1–5: fun, simple language, visual storytelling.
- Grades 6–8: balanced explanations and visuals.
- Grades 9–12: analytical, with real-world references.
- UG/PG: research-oriented tone, technical clarity.
`;
        }

        // 🧩 Step 2: Generate Comic JSONs
        const comicsCreated = [];

        for (const part of parts) {
            const partStory = `
Part ${part.part}: ${part.title}
Key terms: ${part.keyTerms.join(", ")}
Start: ${part.start}
End: ${part.end}
`;

            const comicPrompt = `
You are a professional educational comic creator.

STRICT RULES:
- EXACTLY 8–10 pages
- EXACTLY 2 panels per page
- Each page is COMPLETELY INDEPENDENT
- DO NOT reference previous or future pages
- DO NOT repeat information across pages
- Short captions (max 15 words)
- Simple, clear English
- Correct spelling only

EDUCATION RULE:
- Focus ONLY on explaining the concept clearly
- Theme must never add extra story elements
- No fantasy, drama, or decorative scenes unless required for understanding


Theme Guidelines (SECONDARY – do not overpower education):
${theme.prompt}

Style Guidelines (keep visuals clean and minimal):
${style.prompt}

${gradeInstruction}

// Base Context (User Story):
// "${story}"

Now create a JSON-based comic script of **8–10 pages** for the concept "${cleanConcept}", focusing on:
${partStory}

Each page must have:
// - 1–3 panels
- EXACTLY 2 panels per page
- Each panel includes:
  "scene": visual description,
  "caption": narrator or description,
  "dialogue": optional [ { "character": "Name", "text": "Speech bubble" } ]

Output only valid JSON array.
`;

            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: "Return only valid JSON arrays, 8–10 items long." },
                    { role: "user", content: comicPrompt }
                ],
                temperature: 0.5,
                max_tokens: 1800
            });

            const pages = safeJsonParse(response.choices[0].message.content.trim());

            const comic = await Comic.create({
                seriesId: series._id,
                user_id: userId,
                themeId,
                styleId,
                subjectId,
                subject,               // store readable subject
                concept: cleanConcept,
                conceptId: conceptDoc._id,
                partNumber: part.part,
                title: `${title} - Part ${part.part}: ${part.title}`,
                author,
                story: partStory,       // part story
                userStory: story,       // full original story
                grade,
                country: finalCountry,
                countries: finalCountries,
                prompt: JSON.stringify(pages),
                comicStatus: "draft"
            });

            comicsCreated.push({
                part: part.part,
                title: part.title,
                keyTerms: part.keyTerms,
                start: part.start,
                end: part.end,
                comicId: comic._id
            });

            series.parts.push(comic._id);
        }

        await series.save();

        res.json({ success: true, series, parts: comicsCreated });
    } catch (error) {
        console.error("Error in refinePrompt:", error);
        res.status(500).json({ error: "Prompt generation failed", details: error.message });
    }
};







// ---------------------- Utility Functions ----------------------

//  Moderation check ko hata diya gaya hai, Imagen API khud handle karta hai.
const checkPromptSafety = async (prompt) => {
    // We rely on the Imagen API's built-in safety filters.
    return true;
};

const makePromptSafer = (prompt) => {
    const safetyAppendages = [
        "This is a completely safe, educational comic for young children.",
        "All content is appropriate for ages 1-16.",
        "No violence, no scary elements, only positive educational content.",
        "G-rated and family-friendly imagery only.",
        "Characters are friendly, positive, and educational.",
    ];

    const randomSafety =
        safetyAppendages[Math.floor(Math.random() * safetyAppendages.length)];

    return `${prompt} ${randomSafety}`;
};

// const sanitizeText = (text) => {
//     if (!text) return "";
//     const replacementMap = {
//         clown: "funny character",
//         joker: "playful character",
//         creepy: "interesting",
//         scary: "exciting",
//         violent: "active",
//         mystery: "puzzle",
//         secret: "special",
//         hidden: "waiting to be found",
//         detective: "explorer",
//         investigator: "researcher",
//         crime: "problem",
//         theft: "mix-up",
//         robbery: "misunderstanding",
//         attack: "approach",
//         destroy: "fix",
//         kill: "stop",
//         harm: "help",
//         weapon: "tool",
//         gun: "water pistol",
//         knife: "utensil",
//         blood: "paint",
//     };

//     let safeText = text.toLowerCase();
//     Object.keys(replacementMap).forEach((term) => {
//         const regex = new RegExp(`\\b${term}\\b`, "gi");
//         safeText = safeText.replace(regex, replacementMap[term]);
//     });

//     safeText = safeText
//         .replace(/["“”'‘’]/g, "")
//         .replace(/[^\w\s.,!?-]/g, "")
//         .trim();

//     return safeText;
// };

const sanitizeText = (text = "") => {
    if (typeof text !== "string") return "";

    let safeText = text;

    safeText = safeText
        .replace(/[^\w\s.,!?-]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    return safeText;
};



const isDiagramContent = (text = "") => {
    const diagramKeywords = [
        "process", "cycle", "flow", "diagram", "chart", "structure",
        "system", "life cycle", "workflow", "layers", "components",
        "labeled", "map", "concept", "explain", "steps", "sequence"
    ];

    const lower = text.toLowerCase();
    return diagramKeywords.some(word => lower.includes(word));
};

const getDiagramDetailBooster = () => `
IMPORTANT: SINCE THIS IS A DIAGRAM, FOLLOW THIS STRICTLY:
- Create a high-detail educational diagram.
- Add clear labels, arrows, sections, and visual explanations.
- Use boxes, nodes, labels, pointers, structured layout.
- Make the diagram rich, complete, and deeply explanatory.
- No humans, no scenes — ONLY diagram elements.
- High clarity, school textbook–style visualization.
`;





// Retry-safe image generation (Using Gemini's Imagen 3.0)
const generateImageWithRetry = async (prompt, retries = 3) => {
    let currentPrompt = prompt;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`🖼️ Gemini attempt ${attempt}/${retries}`);

            const isSafe = await checkPromptSafety(currentPrompt);
            if (!isSafe) {
                currentPrompt = makePromptSafer(currentPrompt);
                continue;
            }

            return await generateGeminiComicImage(currentPrompt);

        } catch (err) {
            console.error("Gemini image error:", err.message);
            if (attempt === retries) throw err;
            await new Promise(r => setTimeout(r, attempt * 2000));
        }
    }
};



// ---------------------- Main Image Generation Controller ----------------------

const generateComicImage = async (req, res) => {
    const { comicId, pages } = req.body;

    try {
        const userId = req.user.login_data._id;

        const user = await User.findById(userId);

        // 🧮 Weekly limit check (logic remains the same)
        if (user?.isUnlimited) {
            console.log(`🆓 Unlimited comic generation enabled for special user: ${userId}`);
        } else {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

            const comicCount = await Comic.countDocuments({
                user_id: userId,
                createdAt: { $gte: oneWeekAgo },
                pdfUrl: { $exists: true, $ne: null }
            });

            if (comicCount >= 1) {
                return res.status(403).json({
                    error: "You have reached your weekly limit of 1 comics. Please wait until next week."
                });
            }
        }


        // 🧩 Fetch the comic & style prompt
        const comic = await Comic.findById(comicId).populate("styleId");
        if (!comic) return res.status(404).json({ error: "Comic not found" });

        const stylePrompt = comic.styleId?.prompt || "";
        const characterReferences = {}; // Track characters for consistency prompting
        const imageUrls = [];

        // 1️⃣ Fetch existing pages to skip regeneration
        const existingPages = await ComicPage.find({ comicId });
        const existingPageMap = new Map(
            existingPages.map((p) => [p.pageNumber, p.imageUrl])
        );

        for (const page of pages) {
            try {
                // 🧩 Skip if already generated
                if (existingPageMap.has(page.page)) {
                    console.log(`✅ Skipping page ${page.page} (already exists)`);
                    imageUrls.push({
                        page: page.page,
                        imageUrl: existingPageMap.get(page.page),
                        skipped: true,
                    });
                    continue;
                }

                // 🧩 Skip empty panels
                if (!Array.isArray(page.panels) || page.panels.length === 0) {
                    console.warn(`⚠️ Page ${page.page} has no panels — skipping.`);
                    imageUrls.push({ page: page.page, skipped: true });
                    continue;
                }

                // 🧠 Build prompt from panels (logic remains the same)
                const pagePrompt = page.panels
                    .map((p, idx) => {
                        const dialogues = Array.isArray(p.dialogue) ? p.dialogue : [];
                        const dialogueText = dialogues
                            .map((d) => {
                                if (d && d.character && !characterReferences[d.character]) {
                                    characterReferences[d.character] = "SET"; // Set a marker
                                }
                                return d && d.character && d.text
                                    ? `${sanitizeText(d.character)} says: ${sanitizeText(d.text)}`
                                    : "";
                            })
                            .filter(Boolean)
                            .join(" ");

                        return `Panel ${idx + 1}: Scene: ${sanitizeText(
                            p.scene || ""
                        )}. Caption: ${sanitizeText(p.caption || "")}. Dialogue: ${dialogueText}`;
                    })
                    .join("\n");

                // 👀 Check if diagram page
                let diagramBooster = "";
                if (isDiagramContent(pagePrompt)) {
                    console.log("📊 Diagram detected — adding detail booster!");
                    diagramBooster = getDiagramDetailBooster();
                }

                // 👩‍🎨 Character references for consistency (Prompts for Imagen)
                let referencesText = "";
                // Imagen reference images directly support nahi karta. 
                // Hum descriptive prompting se consistency maintain karenge.
                for (const character of Object.keys(characterReferences)) {
                    // Yahan aapko ek generic description dena hoga, ya koi saved description.
                    // Filhaal, hum general consistency ke liye bol rahe hain.
                    // referencesText += `Ensure the character "${sanitizeText(character)}" is consistent in appearance across all panels and pages (e.g., same clothing, hair, and friendly face).\n`;
                    referencesText += `
Ensure the character "${sanitizeText(character)}" looks consistent within THIS page only.
Do NOT reference other pages.
`;

                }


                // 🎨 Final AI prompt
                const fullPrompt = `
Create an educational comic page suitable for children ages 6–12.

GOAL:
Explain the concept clearly using the simplest possible visuals.

Content must be G-rated and fully child-safe.
No violence, no scary content, no sensitive material.

STRICT RULES:
- ONLY this page
- NO other pages
- G-rated, child-safe
- Correct spelling
- Friendly visuals
- Only what is needed to explain the scene
- No extra characters
- No unnecessary objects
- No visual clutter
- Neutral background if possible

Style: ${stylePrompt}
${referencesText}

${diagramBooster}

PAGE DESCRIPTION:
${pagePrompt}

IMPORTANT:
This is an educational comic.
All characters are friendly and positive.
If this page contains a diagram, give detailed labeled explanations.
        `;

                console.log(`🎨 Generating image for page ${page.page}...`);

                // 🧠 Generate image
                const rawBuffer = await generateImageWithRetry(fullPrompt);

                const buffer = await sharp(rawBuffer)
                    .resize({ width: 1024 })
                    .jpeg({ quality: 75 })
                    .toBuffer();

                // 🪣 Upload to S3
                const fileName = `comic_page${page.page}_${Date.now()}.jpg`;
                const s3Upload = await upload_files("comics", {
                    name: fileName,
                    data: buffer,
                    mimetype: "image/jpeg",
                });

                const imageUrl = s3Upload;
                const s3Key = `comics/${fileName}`;

                // 💾 Save ComicPage in DB (logic remains the same)
                await ComicPage.findOneAndUpdate(
                    { comicId, pageNumber: page.page },
                    {
                        comicId,
                        user_id: req.user.login_data._id,
                        pageNumber: page.page,
                        panels: page.panels,
                        imageUrl,
                        s3Key,
                        createdAt: new Date(),
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );

                imageUrls.push({ page: page.page, imageUrl });

                console.log(`✅ Page ${page.page} generated successfully.`);
            } catch (error) {
                console.error(`❌ Error generating image for page ${page.page}:`, error);
                imageUrls.push({
                    page: page.page,
                    error: true,
                    message: error.message,
                });
            }

            // API rate limit ke liye thoda wait
            await new Promise((r) => setTimeout(r, 1000));
        }

        // 🚨 Check failed pages
        const failedPages = imageUrls.filter((r) => r.error);
        if (failedPages.length > 0) {
            console.warn(`⚠️ Failed to generate ${failedPages.length} pages`);
        }

        // ✅ Success response
        res.json({
            comicId,
            images: imageUrls,
            success: failedPages.length === 0,
            failedPages: failedPages.map((f) => f.page),
        });
    } catch (error) {
        console.error("🔥 Image API Error:", error);
        res.status(500).json({
            error: "Image generation failed",
            details: error.message,
            code: error.code,
        });
    }
};






const generateComicPDF = async (req, res) => {
    const { comicId } = req.body;

    try {
        // Get all pages of the comic
        const pages = await ComicPage.find({ comicId }).sort({ pageNumber: 1 });
        if (!pages || pages.length === 0) {
            return res.status(404).json({ error: "No pages found for this comic" });
        }

        // Create a new PDF in memory
        const doc = new PDFDocument({ autoFirstPage: false });
        let buffers = [];
        doc.on("data", buffers.push.bind(buffers));
        doc.on("end", async () => {
            const pdfBuffer = Buffer.concat(buffers);

            const fileName = `comic_${comicId}_${Date.now()}.pdf`;

            // Upload PDF to S3
            const s3Upload = await upload_files("comics-pdf", {
                name: fileName,
                data: pdfBuffer,
                mimetype: "application/pdf",
            });

            // Save PDF link in Comic DB
            await Comic.findByIdAndUpdate(comicId, { pdfUrl: s3Upload });

            res.json({ comicId, pdfUrl: s3Upload });
        });

        // Add each image page to PDF
        for (const page of pages) {
            const response = await axios.get(page.imageUrl, { responseType: "arraybuffer" });
            const imgBuffer = Buffer.from(response.data);

            const img = doc.openImage(imgBuffer);
            doc.addPage({ size: [img.width, img.height] });
            doc.image(img, 0, 0);
        }

        doc.end();
    } catch (error) {
        console.error("PDF Generation Error:", error);
        res.status(500).json({ error: "PDF generation failed" });
    }
};



const listComics = async (req, res) => {
    try {
        // query params se page aur limit lo (defaults diye hain)
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const comics = await Comic.aggregate([
            { $match: { status: "approved" } },

            // latest pehle
            { $sort: { createdAt: -1 } },

            // pagination apply
            { $skip: skip },
            { $limit: limit },

            // FAQs join
            {
                $lookup: {
                    from: "faqs",
                    localField: "_id",
                    foreignField: "comicId",
                    as: "faqs",
                },
            },
            {
                $lookup: {
                    from: "subjects",
                    localField: "subjectId",
                    foreignField: "_id",
                    as: "subjectData"
                }
            },
            { $unwind: { path: "$subjectData", preserveNullAndEmptyArrays: true } },

            // DidYouKnow join
            {
                $lookup: {
                    from: "didyouknows",
                    localField: "_id",
                    foreignField: "comicId",
                    as: "facts",
                },
            },

            // Pages join (thumbnail ke liye)
            {
                $lookup: {
                    from: "comicpages",
                    localField: "_id",
                    foreignField: "comicId",
                    as: "pages",
                },
            },

            // extra fields add
            {
                $addFields: {
                    hasFAQ: { $gt: [{ $size: "$faqs" }, 0] },
                    hasDidYouKnow: { $gt: [{ $size: "$facts" }, 0] },
                    thumbnail: { $arrayElemAt: ["$pages.imageUrl", 0] },
                },
            },

            {
                $addFields: {
                    hasFAQ: { $gt: [{ $size: "$faqs" }, 0] },
                    hasDidYouKnow: { $gt: [{ $size: "$facts" }, 0] },
                    thumbnail: { $arrayElemAt: ["$pages.imageUrl", 0] },

                    // subjectId & subjectName
                    subjectId: "$subjectData._id",
                    subject: "$subjectData.name",
                },
            },

            // unnecessary arrays remove
            {
                $project: {
                    faqs: 0,
                    facts: 0,
                    pages: 0,
                    subjectData: 0,
                    prompt: 0
                },
            },
        ]);

        // total count for pagination info
        const totalComics = await Comic.countDocuments({ status: "approved" });

        res.json({
            page,
            limit,
            totalPages: Math.ceil(totalComics / limit),
            totalComics,
            comics,
        });
    } catch (error) {
        console.error("Error listing comics:", error);
        res.status(500).json({ error: "Failed to list comics" });
    }
};


const listComicsforPublic = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;

        const { country, grade, subjectId, concept } = req.query;

        const matchStage = { status: "approved" };

        if (country && country !== "ALL") matchStage.country = country.toUpperCase();
        if (grade) matchStage.grade = grade;
        // if (subjectId) matchStage.subjectId = new mongoose.Types.ObjectId(subjectId);
        if (subjectId && mongoose.Types.ObjectId.isValid(subjectId)) {
            matchStage.subjectId = new mongoose.Types.ObjectId(subjectId);
        }
        if (concept) matchStage.concept = { $regex: concept.trim(), $options: "i" };

        const comics = await Comic.aggregate([
            { $match: matchStage },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },

            {
                $lookup: {
                    from: "subjects",
                    localField: "subjectId",
                    foreignField: "_id",
                    as: "subjectData"
                }
            },
            { $unwind: { path: "$subjectData", preserveNullAndEmptyArrays: true } },

            {
                $project: {
                    title: 1,
                    concept: 1,
                    grade: 1,
                    country: 1,
                    subject: "$subjectData.name",
                    subjectId: "$subjectData._id",
                    createdAt: 1
                }
            }
        ]);

        const total = await Comic.countDocuments(matchStage);

        res.json({
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            totalComics: total,
            comics
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to list comics" });
    }
};







const getComic = async (req, res) => {
    try {
        const comicId = req.params.id;
        const userId = req.user?.login_data?._id;

        // 🔹 Fetch main comic
        const comic = await Comic.findById(comicId).lean();
        if (!comic) return res.status(404).json({ error: "Comic not found" });

        // 🔹 Fetch related data in parallel
        const [
            pages,
            theme,
            subject,
            style,
            faqs,
            facts,
            hardcoreQuiz,
            quiz
        ] = await Promise.all([
            ComicPage.find({ comicId }).sort({ pageNumber: 1 }).lean(),
            Theme.findById(comic.themeId).lean(),
            Subject.findById(comic.subjectId).lean(),
            Style.findById(comic.styleId).lean(),
            FAQ.find({ comicId }).lean(),
            DidYouKnow.find({ comicId }).lean(),
            HardcoreQuiz.findOne({ comicId })
                .populate("questions") // populate embedded question docs if referenced
                .lean(),
            Quiz.findOne({ comicId })
                .populate("questions")
                .lean(),
        ]);

        // 🔹 Check if user attempted Hardcore Quiz
        let hasAttemptedHardcore = false;
        if (hardcoreQuiz && userId) {
            const attempt = await HardcoreQuizSubmission.findOne({
                quizId: hardcoreQuiz._id,
                userId: new mongoose.Types.ObjectId(userId),
            }).lean();
            hasAttemptedHardcore = !!attempt;
        }

        // 🔹 Fetch parts if part of a series
        let parts = [];
        if (comic.seriesId) {
            parts = await Comic.find({ seriesId: comic.seriesId })
                .select("_id partNumber title concept")
                .sort({ partNumber: 1 })
                .lean();
        }

        // 🔹 Enhanced comic info
        const enhancedComic = {
            ...comic,
            themeId: theme?._id || null,
            theme: theme?.name || "N/A",
            subjectId: subject?._id || null,
            subject: subject?.name || "N/A",
            styleId: style?._id || null,
            style: style?.name || "N/A",
            hasFAQ: faqs.length > 0,
            hasDidYouKnow: facts.length > 0,
            hasHardcoreQuiz: !!hardcoreQuiz,
            hasQuiz: !!quiz,
            hasAttemptedHardcore,
            thumbnail: pages[0]?.imageUrl || null,
            totalPages: pages.length,
        };

        //  Final API response (frontend-friendly keys)
        res.json({
            comic: enhancedComic,
            pages,
            parts,
            faqs,
            didYouKnow: facts,
            quiz,
            hardcoreQuiz,
        });
    } catch (err) {
        console.error("Error fetching comic:", err);
        res.status(500).json({ error: "Failed to fetch comic" });
    }
};


const updateComicStatus = async (req, res) => {
    try {
        const { comicId, comicStatus } = req.body;

        if (!["draft", "published"].includes(comicStatus)) {
            return res.status(400).json({ error: "Invalid comic status" });
        }

        // ⭐ Fetch comic + user info
        const comic = await Comic.findById(comicId).populate("user_id");
        if (!comic) {
            return res.status(404).json({ error: "Comic not found" });
        }

        const previousStatus = comic.comicStatus;

        // ⭐ Update status
        comic.comicStatus = comicStatus;
        await comic.save();

        // ⭐ Send email only if status changed from draft → published
        if (previousStatus === "draft" && comicStatus === "published") {

            const adminEmail = "ajinkya.kridemy@gmail.com"; // admin email

            const mailOptions = {
                from: "ajinkya.kridemy@gmail.com",
                to: adminEmail,
                subject: "New Comic Published - Admin Approval Required",
                html: `
                    <h2>New Comic Published by User</h2>

                    <p><strong>User Name:</strong> ${comic.user_id.name || "Unknown"}</p>
                    <p><strong>User Email:</strong> ${comic.user_id.email || "Not Provided"}</p>

                    <p><strong>Comic Title:</strong> ${comic.title}</p>
                    <p><strong>Comic ID:</strong> ${comic._id}</p>

                    <br/>
                    <p>Please review and approve this comic in the admin dashboard.</p>
                `
            };

            transporter.sendMail(mailOptions, (err, info) => {
                if (err) {
                    console.error("Email sending failed:", err);
                } else {
                    console.log("Admin notified via email:", info.response);
                }
            });
        }

        res.json({ message: "Comic status updated", comic });

    } catch (error) {
        console.error("Error updating comic status:", error);
        res.status(500).json({ error: "Failed to update comic status" });
    }
};



const deleteComic = async (req, res) => {
    try {
        const { id } = req.body;

        // Find the comic
        const comic = await Comic.findById(id);
        if (!comic) {
            return res.status(404).json({ error: "Comic not found" });
        }

        // Find all pages for this comic
        const pages = await ComicPage.find({ comicId: id });

        // Delete images from S3
        for (const page of pages) {
            if (page.s3Key) {
                try {
                    await deleteFiles(page.s3Key); // You need a helper to delete S3 files
                } catch (err) {
                    console.warn(`Failed to delete S3 file ${page.s3Key}:`, err.message);
                }
            }
        }

        // Delete all ComicPage documents
        await ComicPage.deleteMany({ comicId: id });

        // Delete PDF if exists
        if (comic.pdfUrl) {
            try {
                const pdfKey = comic.pdfUrl.split("/").pop(); // extract filename from URL
                await deleteFiles(`comics-pdf/${pdfKey}`);
            } catch (err) {
                console.warn(`Failed to delete PDF from S3:`, err.message);
            }
        }

        // Delete the comic document
        await Comic.findByIdAndDelete(id);

        res.json({ message: "Comic and all related pages deleted successfully" });
    } catch (error) {
        console.error("Error deleting comic:", error);
        res.status(500).json({ error: error });
    }
};




const listUserComics = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        const comics = await Comic.find({ user_id: userId }, "-prompt")
            .sort({ createdAt: -1 })
            .select("");

        const comicsWithThumbnail = await Promise.all(
            comics.map(async (comic) => {
                const firstPage = await ComicPage.findOne({ comicId: comic._id })
                    .sort({ pageNumber: 1 })
                    .select("imageUrl");

                return {
                    ...comic.toObject(),
                    thumbnail: firstPage ? firstPage.imageUrl : null,
                };
            })
        );

        res.json({ comics: comicsWithThumbnail });
    } catch (error) {
        console.error("Error listing user comics:", error);
        res.status(500).json({ error: "Failed to list user's comics" });
    }
};



const updateCountryForSeries = async (req, res) => {
    try {
        const { seriesId, newCountry } = req.body;

        if (!seriesId || !newCountry) {
            return res.status(400).json({ error: "seriesId and newCountry are required." });
        }

        //  Find the series
        const series = await ComicSeries.findById(seriesId);
        if (!series) {
            return res.status(404).json({ error: "Comic series not found." });
        }

        //  Normalize input
        const countriesArray = Array.isArray(newCountry)
            ? newCountry
            : typeof newCountry === "string"
                ? [newCountry]
                : [];

        if (countriesArray.length === 0) {
            return res.status(400).json({ error: "Invalid country format." });
        }

        let finalCountry;
        let finalCountries;

        //  Handle “ALL” or global selection
        if (countriesArray.includes("ALL") || countriesArray.length >= 200) {
            finalCountry = "ALL";
            finalCountries = ["ALL"];
        } else {
            //  Even single selection must be an array
            finalCountry = countriesArray[0];
            finalCountries = countriesArray;
        }

        //  Update ComicSeries document
        series.country = finalCountry;
        series.countries = finalCountries;
        await series.save();

        //  Update all related Comics (linked by seriesId)
        const result = await Comic.updateMany(
            { seriesId: series._id },
            {
                $set: {
                    country: finalCountry,
                    countries: finalCountries,
                },
            },
            { strict: false } // 🔑 ensures new field gets added
        );

        //  Fallback (in case some comics don't have seriesId)
        if (result.matchedCount === 0) {
            await Comic.updateMany(
                { conceptId: series.conceptId },
                {
                    $set: {
                        country: finalCountry,
                        countries: finalCountries,
                    },
                },
                { strict: false }
            );
        }

        res.json({
            success: true,
            message: `Countries updated to ${JSON.stringify(finalCountries)} for series "${series.title}" and all related comics.`,
            updatedSeries: {
                id: series._id,
                title: series.title,
                country: finalCountry,
                countries: finalCountries,
            },
            modifiedComics: result.modifiedCount,
        });
    } catch (error) {
        console.error("Error updating countries:", error);
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
};




const addComicView = async (req, res) => {
    try {
        const { comicId } = req.body;
        const userId = req.user.login_data._id;

        if (!comicId) {
            return res.status(400).json({ error: "comicId is required" });
        }

        // 1️⃣ Check if this user has already viewed this comic
        const alreadyViewed = await ComicView.findOne({ comicId, userId });

        if (alreadyViewed) {
            return res.json({
                message: "Already viewed by this user",
                alreadyViewed: true,
            });
        }

        // 2️⃣ Save view
        await ComicView.create({ comicId, userId });

        // 3️⃣ Increase total_view by +1
        await Comic.findByIdAndUpdate(
            comicId,
            { $inc: { total_view: 1 } }
        );

        return res.json({
            message: "Unique view counted",
            viewedNow: true,
        });

    } catch (error) {
        console.error("❌ Unique View Error:", error);
        res.status(500).json({
            error: "Failed to update view",
            details: error.message,
        });
    }
};




// const generateComicThumbnail = async (req, res) => {

//     const { comicId, title, subject, story } = req.body

//     const prompt = `
//   Design a comic book cover illustration.
//   - Title: "${title}"
//   - Subject: "${subject}"
//   - Style: realistic hand-drawn comic cover with thin ink outlines and soft watercolor tones.
//   - Focus: A visually appealing single cover image that captures the main idea of this story: ${story}
//   - Include only one large illustration (no panels, no speech bubbles).
//   - Add an artistic feel like a real comic cover.
//   `;

//     const imageResponse = await openai.images.generate({
//         model: "dall-e-3",
//         prompt,
//         size: "1024x1792", // portrait cover
//         n: 1,
//     });

//     let buffer;
//     const imgData = imageResponse.data[0];
//     if (imgData.url) {
//         const response = await axios.get(imgData.url, { responseType: "arraybuffer" });
//         buffer = Buffer.from(response.data);
//     } else if (imgData.b64_json) {
//         buffer = Buffer.from(imgData.b64_json, "base64");
//     }

//     buffer = await sharp(buffer)
//         .resize({ width: 600 })  // compress for thumbnail
//         .jpeg({ quality: 75 })
//         .toBuffer();

//     const fileName = `comic_cover_${comicId}_${Date.now()}.jpg`;
//     const s3Upload = await upload_files("comics-thumbnails", {
//         name: fileName,
//         data: buffer,
//         mimetype: "image/jpeg",
//     });

//     // Save thumbnail link in DB
//     // await Comic.findByIdAndUpdate(comicId, { thumbnailUrl: s3Upload });

//     // return res.send({ thumbnailUrl: s3Upload });
// };




module.exports = {
    refinePrompt, generateComicImage, generateComicPDF, listComics, addComicView,
    getComic, updateComicStatus, deleteComic, listUserComics, updateCountryForSeries, listComicsforPublic
};
