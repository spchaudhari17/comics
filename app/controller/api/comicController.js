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

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});


// const refinePrompt = async (req, res) => {
//     const { title, author, subject, story, themeId, styleId, country, grade, subjectId, concept } = req.body;

//     try {
//         // Fetch theme + style prompts
//         const theme = await Theme.findById(themeId);
//         const style = await Style.findById(styleId);

//         if (!theme || !style) {
//             return res.status(400).json({ error: "Invalid theme or style" });
//         }

//         // *********** Concept handling ***********
//         const cleanConcept = concept.trim();

//         const existingComic = await Comic.findOne({ concept: cleanConcept })
//             .populate("subjectId", "name");

//         if (existingComic) {
//             return res.status(200).json({
//                 alreadyExists: true,
//                 comic: {
//                     id: existingComic._id,
//                     country: existingComic.country,
//                     grade: existingComic.grade,
//                     subject: existingComic.subjectId?.name,
//                     title: existingComic.title,
//                     concept: existingComic.concept,
//                     pdfUrl: existingComic.pdfUrl || null,
//                 },
//             });
//         }

//         // Create new Concept if not already saved
//         let conceptDoc = await Concept.findOne({ name: cleanConcept });
//         if (!conceptDoc) {
//             conceptDoc = await Concept.create({ name: cleanConcept, subjectId });
//         }
//         const conceptId = conceptDoc._id;

//         // *********** Story Wrapping ***********
//         const wrappedStory = `
// Analyse the prompt given below and check whether the concept is small enough 
// to have it explained properly and in detail in an 8-10 page comic, 
// if not, then divide the following concept into smaller chunks which can be converted into comics. 
// Give the answer in part wise format and mention the key terms to be introduced, 
// define the start and the end point of the concept: ${story}
// `;

//         // *********** Grade Instructions ***********
//         let gradeInstruction = "";
//         if (grade) {
//             gradeInstruction = `
// When creating the comic, you MUST adapt the tone, difficulty, and language 
// to suit a ${grade} student. 
// - For lower grades (K–5), keep text simple, playful, and use child-friendly visuals.
// - For middle grades (6–8), balance fun visuals with basic explanations.
// - For higher grades (9–12), use more detailed explanations, real-world references, and slightly mature language.
// `;
//         }

//         // *********** Final Prompt ***********
//         const promptText = `
// You are an expert comic prompt engineer.

// Theme Instructions:
// ${theme.prompt}

// Style Instructions:
// ${style.prompt}

// ${gradeInstruction}

// Comic Title: ${title}
// Author: ${author}
// Subject: ${subject}

// Story:
// ${wrappedStory}

// ⚠️ Output rules (MUST follow):
// - Return ONLY valid JSON.
// - Do NOT include markdown fences (no \`\`\`).
// - Do NOT include comments or extra text.
// - Every key must be in double quotes.
// - Every string must be in double quotes.
// - No trailing commas.

// Format:
// [
//   {

//     "page": 1,
//     "panels": [
//       {
//         "scene": "Describe the visual scene",
//         "caption": "Narrator text (or empty string if none)",
//         "dialogue": [
//           { "character": "Name", "text": "Exact speech bubble text" }
//         ]
//       }
//     ]
//   }
// ]
// `;

//         // *********** OpenAI Call ***********
//         const response = await openai.chat.completions.create({
//             model: "gpt-4o", // Faster + better for JSON outputs
//             messages: [
//                 {
//                     role: "system",
//                     content: "You are a strict JSON generator. Always return ONLY valid JSON that can be parsed with JSON.parse.",
//                 },
//                 { role: "user", content: promptText },
//             ],
//             temperature: 0.5,
//             max_tokens: 2000,
//         });

//         let raw = response.choices[0].message.content.trim();

//         if (raw.startsWith("```")) {
//             raw = raw.replace(/```json|```/g, "").trim();
//         }

//         let pages;
//         try {
//             pages = JSON.parse(raw);
//         } catch (err) {
//             console.error("JSON parse failed:", err.message);
//             return res
//                 .status(500)
//                 .json({ error: "Failed to parse JSON output", details: err.message });
//         }

//         // *********** Save in DB ***********
//         const comic = await Comic.create({
//             user_id: req.user.login_data._id,
//             title,
//             author,
//             subject,
//             story,
//             themeId,
//             styleId,
//             subjectId,
//             concept: cleanConcept, // string
//             conceptId,
//             country,
//             grade,
//             prompt: JSON.stringify(pages), // save refined prompt
//             comicStatus: "draft",
//         });

//         res.json({ comicId: comic._id, pages });
//     } catch (error) {
//         console.error("Error generating prompts:", error);
//         res.status(500).json({ error: "Prompt generation failed", details: error.message });
//     }
// };


function safeJsonParse(str) {
    try {
        if (str.startsWith("```")) {
            str = str.replace(/```json|```/g, "").trim();
        }
        return JSON.parse(str);
    } catch (err) {
        console.error("❌ JSON Parse Error:", err.message, "\nRaw Output:", str);
        throw new Error("AI returned invalid JSON");
    }
}

const refinePrompt = async (req, res) => {
    const { title, author, subject, story, themeId, styleId, country, grade, subjectId, concept } = req.body;

    try {

        const userId = req.user.login_data._id;

        //  Weekly limit check for series
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const seriesCount = await ComicSeries.countDocuments({
            user_id: userId,
            createdAt: { $gte: oneWeekAgo }
        });

        if (seriesCount >= 5) {
            return res.status(403).json({
                error: "You have reached your weekly limit of 5 new series. Please wait until next week."
            });
        }



        // main flow start here
        const cleanConcept = concept.trim();
        let existingSeries = await ComicSeries.findOne({ concept: cleanConcept, grade }).populate("parts");

        if (existingSeries) {
            return res.status(200).json({ alreadyExists: true, series: existingSeries });
        }

        // Ensure Concept exists
        let conceptDoc = await Concept.findOne({ name: cleanConcept });
        if (!conceptDoc) {
            conceptDoc = await Concept.create({ name: cleanConcept, subjectId });
        }

        const series = await ComicSeries.create({
            user_id: req.user.login_data._id,
            themeId, styleId, subjectId,
            concept: cleanConcept,
            conceptId: conceptDoc._id,
            grade, title, author, country,
            parts: []
        });

        // 🔹 Step 1: Divide into parts
        const divisionPrompt = `
Divide the concept "${cleanConcept}" into smaller sub-parts for grade ${grade} students. 
Each part should fit into 8-10 pages. 
Return JSON array like:
[
  { "part": 1, "title": "Birth of a Star", "keyTerms": ["Nebula"], "start": "Nebula", "end": "Protostar" }
]
        `;

        const divisionResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "Return ONLY valid JSON array. No text, no markdown, no explanation." },
                { role: "user", content: divisionPrompt }
            ],
            temperature: 0.3,
            max_tokens: 800
        });

        const parts = safeJsonParse(divisionResponse.choices[0].message.content.trim());

        // 🔹 Step 2: Generate comic JSON for each part
        let comicsCreated = [];
        for (const part of parts) {
            const partStory = `
Part ${part.part}: ${part.title}
Key terms: ${part.keyTerms.join(", ")}
Start: ${part.start}
End: ${part.end}
            `;

            const comicPrompt = `
Create a JSON comic script with 5 pages. 
Comic Title: ${title} - Part ${part.part}: ${part.title}
Subject: ${subject}
Grade: ${grade}
Story: ${partStory}

Format:
[
  { "page": 1, "panels": [ { "scene": "...", "caption": "...", "dialogue": [] } ] }
]
            `;

            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: "Return ONLY valid JSON array. No text, no markdown, no explanation." },
                    { role: "user", content: comicPrompt }
                ],
                temperature: 0.5,
                max_tokens: 1500
            });

            const pages = safeJsonParse(response.choices[0].message.content.trim());

            const comic = await Comic.create({
                seriesId: series._id,
                user_id: req.user.login_data._id,
                themeId, styleId, subjectId,
                concept: cleanConcept,
                conceptId: conceptDoc._id,
                partNumber: part.part,
                title: `${title} - Part ${part.part}: ${part.title}`,
                author, story: partStory,
                grade, country,
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
        console.error("❌ Error in refinePrompt:", error);
        res.status(500).json({ error: "Prompt generation failed", details: error.message });
    }
};



// const generateComicImage = async (req, res) => {
//     const { comicId, pages } = req.body;

//     try {

//         const userId = req.user.login_data._id;

//         // Weekly limit check (images = comics)
//         const oneWeekAgo = new Date();
//         oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

//         const comicCount = await Comic.countDocuments({
//             user_id: userId,
//             createdAt: { $gte: oneWeekAgo }
//         });

//         if (comicCount >= 5) {
//             return res.status(403).json({
//                 error: "You have reached your weekly limit of 5 comics. Please wait until next week."
//             });
//         }


//         // continue normal flow
//         const comic = await Comic.findById(comicId).populate("styleId");
//         if (!comic) {
//             return res.status(404).json({ error: "Comic not found" });
//         }

//         const stylePrompt = comic.styleId.prompt; // use style prompt from DB
//         const characterReferences = {};

//         // ✅ sanitize function
//         const sanitizeText = (text) => {
//             if (!text) return "";
//             return text
//                 .replace(/["“”]/g, "") // remove quotes
//                 .replace(/\bclown\b/gi, "funny character")
//                 .replace(/\bmystery\b/gi, "puzzle")
//                 .replace(/\bdetective\b/gi, "problem solver")
//                 .replace(/\bcrime\b/gi, "problem"); // optional safe replacement
//         };

//         const imageUrls = await Promise.all(
//             pages.map(async (page) => {
//                 const pagePrompt = page.panels
//                     .map((p, idx) => {
//                         let dialogueText = p.dialogue
//                             .map((d) => {
//                                 if (!characterReferences[d.character]) {
//                                     characterReferences[d.character] = null;
//                                 }
//                                 return `${sanitizeText(d.character)} says: ${sanitizeText(d.text)}`;
//                             })
//                             .join(" ");
//                         return `Panel ${idx + 1}: Scene: ${sanitizeText(p.scene)}. Caption: ${sanitizeText(p.caption)}. Dialogue: ${dialogueText}`;
//                     })
//                     .join("\n");

//                 let referencesText = "";
//                 for (const [character, refUrl] of Object.entries(characterReferences)) {
//                     if (refUrl) {
//                         referencesText += `Use this reference image for ${sanitizeText(character)}: ${refUrl}\n`;
//                     } else {
//                         referencesText += `Generate ${sanitizeText(character)} consistently across all pages.\n`;
//                     }
//                 }

//                 // ✅ safe prompt
//                 const fullPrompt = `
// Educational kid-friendly comic page with ${page.panels.length} vertical panels.
// Safe for children, no violence, no unsafe content.
// ${stylePrompt}
// ${referencesText}
// Panels:
// ${pagePrompt}
// `;

//                 const imageResponse = await openai.images.generate({

//                     model: "dall-e-3",
//                     prompt: fullPrompt,
//                     // size: "1024x1536", // 
//                     size: "1024x1792", // dall-e-3
//                     n: 1,
//                 });

//                 if (!imageResponse.data || !imageResponse.data[0]) {
//                     throw new Error(`Image generation failed for page ${page.page}`);
//                 }

//                 const imgData = imageResponse.data[0];
//                 let buffer;

//                 if (imgData.url) {
//                     const response = await axios.get(imgData.url, { responseType: "arraybuffer" });
//                     buffer = Buffer.from(response.data);
//                 } else if (imgData.b64_json) {
//                     buffer = Buffer.from(imgData.b64_json, "base64");
//                 }

//                 buffer = await sharp(buffer)
//                     .resize({ width: 1024 })
//                     .jpeg({ quality: 75 })
//                     .toBuffer();

//                 const fileName = `comic_page${page.page}_${Date.now()}.jpg`;

//                 const s3Upload = await upload_files("comics", {
//                     name: fileName,
//                     data: buffer,
//                     mimetype: "image/jpeg",
//                 });

//                 const imageUrl = s3Upload;
//                 const s3Key = `comics/${fileName}`;

//                 await ComicPage.findOneAndUpdate(
//                     { comicId, pageNumber: page.page }, // find existing page for same comic
//                     {
//                         comicId,
//                         user_id: req.user.login_data._id,
//                         pageNumber: page.page,
//                         panels: page.panels,
//                         imageUrl,
//                         s3Key,
//                         createdAt: new Date()
//                     },
//                     { upsert: true, new: true, setDefaultsOnInsert: true }
//                 );


//                 page.panels.forEach((panel) => {
//                     panel.dialogue.forEach((d) => {
//                         if (!characterReferences[d.character]) {
//                             characterReferences[d.character] = imageUrl;
//                         }
//                     });
//                 });

//                 return { page: page.page, imageUrl };
//             })
//         );

//         res.json({ comicId, images: imageUrls });
//     } catch (error) {
//         console.error("Image API Error:", error);
//         res.status(500).json({ error: "Image generation failed", details: error.message });
//     }
// };


// Define helper functions first

const checkPromptSafety = async (prompt) => {
    try {
        const moderation = await openai.moderations.create({
            input: prompt
        });
        
        const results = moderation.results[0];
        if (results.flagged) {
            console.log("Prompt flagged for:", results.categories);
            return false;
        }
        return true;
    } catch (error) {
        console.error("Moderation check failed:", error);
        return false;
    }
};

const makePromptSafer = (prompt) => {
    // More comprehensive safety modifications
    const safetyAppendages = [
        "This is a completely safe, educational comic for young children.",
        "All content is appropriate for ages 1-16.",
        "No violence, no scary elements, only positive educational content.",
        "G-rated and family-friendly imagery only.",
        "Characters are friendly, positive, and educational."
    ];
    
    // Rotate through different safety messages to avoid repetition
    const randomSafety = safetyAppendages[Math.floor(Math.random() * safetyAppendages.length)];
    
    return prompt + " " + randomSafety;
};

const generateImageWithRetry = async (prompt, retries = 3) => {
    let currentPrompt = prompt;
    
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`Attempt ${attempt}/${retries} for image generation`);
            
            const isSafe = await checkPromptSafety(currentPrompt);
            if (!isSafe) {
                console.log("Prompt flagged by moderation. Making safer...");
                currentPrompt = makePromptSafer(currentPrompt);
                
                // Check if we should continue after making it safer
                if (attempt === retries) {
                    throw new Error("Prompt still unsafe after modifications");
                }
                continue;
            }

            const imageResponse = await openai.images.generate({
                model: "gpt-image-1",
                // model: "dall-e-3",
                prompt: currentPrompt,
                // size: "1024x1792", // dall-e-3
                size: "1024x1536",
                n: 1,
            });

            return imageResponse;

        } catch (error) {
            if (error.code === 'content_policy_violation' && attempt < retries) {
                console.log(`Content policy violation. Attempt ${attempt}/${retries}. Making prompt safer...`);
                currentPrompt = makePromptSafer(currentPrompt);
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Increased backoff
                continue;
            }
            
            // If it's not a content policy violation or we're out of retries, throw
            throw error;
        }
    }
    throw new Error("Max retries exceeded due to content policy violations");
};

// Enhanced sanitization function
const sanitizeText = (text) => {
    if (!text) return "";
    
    // First, handle common problematic terms
    const replacementMap = {
        'clown': 'funny character',
        'joker': 'playful character',
        'creepy': 'interesting',
        'scary': 'exciting',
        'violent': 'active',
        'mystery': 'puzzle',
        'secret': 'special',
        'hidden': 'waiting to be found',
        'detective': 'explorer',
        'investigator': 'researcher',
        'crime': 'problem',
        'theft': 'mix-up',
        'robbery': 'misunderstanding',
        'attack': 'approach',
        'destroy': 'fix',
        'kill': 'stop',
        'harm': 'help',
        'weapon': 'tool',
        'gun': 'water pistol',
        'knife': 'utensil',
        'blood': 'paint'
    };
    
    let safeText = text.toLowerCase();
    
    // Replace problematic terms
    Object.keys(replacementMap).forEach(term => {
        const regex = new RegExp(`\\b${term}\\b`, 'gi');
        safeText = safeText.replace(regex, replacementMap[term]);
    });
    
    // Remove special characters
    safeText = safeText
        .replace(/["“”'‘’]/g, "")
        .replace(/[^\w\s.,!?-]/g, "")
        .trim();
    
    return safeText;
};

// Main function
const generateComicImage = async (req, res) => {
    const { comicId, pages } = req.body;

    try {
        const userId = req.user.login_data._id;

        // Weekly limit check (uncomment when ready)
        
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        const comicCount = await Comic.countDocuments({
            user_id: userId,
            createdAt: { $gte: oneWeekAgo }
        });

        if (comicCount >= 5) {
            return res.status(403).json({
                error: "You have reached your weekly limit of 5 comics. Please wait until next week."
            });
        }
        

        const comic = await Comic.findById(comicId).populate("styleId");
        if (!comic) {
            return res.status(404).json({ error: "Comic not found" });
        }

        const stylePrompt = comic.styleId.prompt;
        const characterReferences = {};

        const imageUrls = await Promise.all(
            pages.map(async (page) => {
                try {
                    const pagePrompt = page.panels
                        .map((p, idx) => {
                            let dialogueText = p.dialogue
                                .map((d) => {
                                    if (!characterReferences[d.character]) {
                                        characterReferences[d.character] = null;
                                    }
                                    return `${sanitizeText(d.character)} says: ${sanitizeText(d.text)}`;
                                })
                                .join(" ");
                            return `Panel ${idx + 1}: Scene: ${sanitizeText(p.scene)}. Caption: ${sanitizeText(p.caption)}. Dialogue: ${dialogueText}`;
                        })
                        .join("\n");

                    let referencesText = "";
                    for (const [character, refUrl] of Object.entries(characterReferences)) {
                        if (refUrl) {
                            referencesText += `Use this reference image for ${sanitizeText(character)}: ${refUrl}\n`;
                        } else {
                            referencesText += `Generate ${sanitizeText(character)} consistently across all pages.\n`;
                        }
                    }

                    const fullPrompt = `
Create an educational comic page suitable for children ages 6-12.
The content must be: G-rated, completely safe for kids, educational, positive, and friendly.
Absolutely no violence, no scary elements, no inappropriate content.

Style: ${stylePrompt}
${referencesText}

Page description: ${pagePrompt}

Important: This comic is for educational purposes only. All characters are friendly and positive.
Generate safe, child-appropriate imagery only.
`;

                    // Use the retry function
                    const imageResponse = await generateImageWithRetry(fullPrompt);

                    if (!imageResponse.data || !imageResponse.data[0]) {
                        throw new Error(`Image generation failed for page ${page.page}`);
                    }

                    const imgData = imageResponse.data[0];
                    let buffer;

                    if (imgData.url) {
                        const response = await axios.get(imgData.url, { responseType: "arraybuffer" });
                        buffer = Buffer.from(response.data);
                    } else if (imgData.b64_json) {
                        buffer = Buffer.from(imgData.b64_json, "base64");
                    }

                    buffer = await sharp(buffer)
                        .resize({ width: 1024 })
                        .jpeg({ quality: 75 })
                        .toBuffer();

                    const fileName = `comic_page${page.page}_${Date.now()}.jpg`;
                    const s3Upload = await upload_files("comics", {
                        name: fileName,
                        data: buffer,
                        mimetype: "image/jpeg",
                    });

                    const imageUrl = s3Upload;
                    const s3Key = `comics/${fileName}`;

                    await ComicPage.findOneAndUpdate(
                        { comicId, pageNumber: page.page },
                        {
                            comicId,
                            user_id: req.user.login_data._id,
                            pageNumber: page.page,
                            panels: page.panels,
                            imageUrl,
                            s3Key,
                            createdAt: new Date()
                        },
                        { upsert: true, new: true, setDefaultsOnInsert: true }
                    );

                    // Update character references with the generated image
                    page.panels.forEach((panel) => {
                        panel.dialogue.forEach((d) => {
                            if (!characterReferences[d.character]) {
                                characterReferences[d.character] = imageUrl;
                            }
                        });
                    });

                    return { page: page.page, imageUrl };
                    
                } catch (error) {
                    console.error(`Error generating image for page ${page.page}:`, error);
                    // Return a failed result but don't break the entire process
                    return { 
                        page: page.page, 
                        error: true, 
                        message: error.message,
                        code: error.code 
                    };
                }
            })
        );

        // Check if any pages failed
        const failedPages = imageUrls.filter(result => result.error);
        if (failedPages.length > 0) {
            console.log(`Failed to generate ${failedPages.length} pages`);
        }

        res.json({ 
            comicId, 
            images: imageUrls,
            success: failedPages.length === 0,
            failedPages: failedPages.map(f => f.page)
        });
        
    } catch (error) {
        console.error("Image API Error:", error);
        res.status(500).json({
            error: "Image generation failed",
            details: error.message,
            code: error.code
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





const getComic = async (req, res) => {
    try {
        const comic = await Comic.findById(req.params.id).lean();
        const pages = await ComicPage.find({ comicId: req.params.id }).lean();

        let parts = [];
        if (comic?.seriesId) {
            parts = await Comic.find({ seriesId: comic.seriesId }).select("_id partNumber title concept").lean();
        }

        res.json({ comic, pages, parts });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch comic" });
    }
};


const updateComicStatus = async (req, res) => {
    try {
        const { comicId, comicStatus } = req.body;

        // check valid status
        if (!["draft", "published"].includes(comicStatus)) {
            return res.status(400).json({ error: "Invalid comic status" });
        }

        // only owner update karega
        const comic = await Comic.findOneAndUpdate(
            { _id: comicId, },
            { comicStatus },
            { new: true }
        );

        if (!comic) {
            return res.status(404).json({ error: "Comic not found or unauthorized" });
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
    refinePrompt, generateComicImage, generateComicPDF, listComics,
    getComic, updateComicStatus, deleteComic, listUserComics
};
