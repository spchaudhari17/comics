const OpenAI = require("openai");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { upload_files, deleteFiles } = require("../../../helper/helper");
const Comic = require("../../models/Comic");
const ComicPage = require("../../models/ComicPage");
const PDFDocument = require("pdfkit");
const sharp = require("sharp");

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});


// STEP 1: Refine Prompt + Save Comic entry
const refinePrompt = async (req, res) => {
    const { title, author, subject, story } = req.body;

    const wrappedStory = `
Analyse the prompt given below and check whether the concept is small enough 
to have it explained properly and in detail in an 8-10 page comic, 
if not, then divide the following concept into smaller chunks which can be converted into comics. 
Give the answer in part wise format and mention the key terms to be introduced, 
define the start and the end point of the concept: ${story}
`;

    try {
        const promptText = `
You are an expert comic prompt engineer.
Task: Break the following story into multiple pages and panels for a comic.
Each page must have several vertical panels (top to bottom), clear borders, and speech bubbles with the exact given dialogue.

Style: realistic hand-drawn comic illustration with thin ink outlines and soft watercolor tones.
Use clean, simple handwritten comic lettering — legible, black on white, inside clear speech bubbles or captions.

Comic Title: ${title}
Author: ${author}
Subject: ${subject}

Story:
${wrappedStory}

⚠️ Output rules (MUST follow):
- Return ONLY valid JSON.
- Do NOT include markdown fences (no \`\`\`).
- Do NOT include comments or extra text.
- Every key must be in double quotes.
- Every string must be in double quotes.
- No trailing commas.

Format:
[
  {
    "page": 1,
    "panels": [
      {
        "scene": "Describe the visual scene",
        "caption": "Narrator text (or empty string if none)",
        "dialogue": [
          { "character": "Name", "text": "Exact speech bubble text" }
        ]
      }
    ]
  }
]
`;

        const response = await openai.chat.completions.create({
            // model: "gpt-4o",
            model: "gpt-3.5-turbo",
            messages: [
                {
                    role: "system",
                    content:
                        "You are a strict JSON generator. Always return ONLY valid JSON that can be parsed with JSON.parse.",
                },
                { role: "user", content: promptText },
            ],
            temperature: 0.5,
            max_tokens: 2000,
        });

        let raw = response.choices[0].message.content.trim();

        if (raw.startsWith("```")) {
            raw = raw.replace(/```json|```/g, "").trim();
        }

        let pages;
        try {
            pages = JSON.parse(raw);
        } catch (err) {
            console.error("JSON parse failed:", err.message);
            return res
                .status(500)
                .json({ error: "Failed to parse JSON output", details: err.message });
        }

        // Save in DB
        const comic = await Comic.create({
            user_id: req.user.login_data._id,
            title,
            author,
            subject,
            story,
            prompt: JSON.stringify(pages), // save refined prompt
            comicStatus: "draft",
        });

        res.json({ comicId: comic._id, pages });
    } catch (error) {
        console.error("Error generating prompts:", error);
        res.status(500).json({ error: "Prompt generation failed" });
    }
};


// STEP 2: Generate Comic Images + Upload to S3 + Save Pages
// const generateComicImage = async (req, res) => {
//     const { comicId, pages } = req.body;

//     try {
//         const imageUrls = await Promise.all(
//             pages.map(async (page) => {
//                 const pagePrompt = page.panels
//                     .map((p, idx) => {
//                         let dialogueText = p.dialogue
//                             .map((d) => `${d.character}: "${d.text}"`)
//                             .join(" ");
//                         return `Panel ${idx + 1}: Scene: ${p.scene}. Caption: ${p.caption}. Dialogue: ${dialogueText}`;
//                     })
//                     .join("\n");

//                 const fullPrompt = `
// A comic page with ${page.panels.length} vertical panels.
// Style: realistic hand-drawn comic illustration with thin ink outlines and soft watercolor tones.
// Panels:
// ${pagePrompt}
// `;

//                 // Generate Image
//                 const imageResponse = await openai.images.generate({
//                     // model: "dall-e-3",
//                     model: "gpt-image-1",
//                     prompt: fullPrompt,
//                     size: "1024x1536",
//                     // size: "1024x1792", // dall-e-3
//                     n: 1,
//                 });

//                 let imageUrl = null;
//                 let s3Key = null;

//                 if (imageResponse.data && imageResponse.data[0]) {
//                     const imgData = imageResponse.data[0];
//                     const fileName = `comic_page${page.page}_${Date.now()}.png`;

//                     let buffer = null;

//                     // Case 1: URL provided
//                     if (imgData.url) {
//                         const response = await axios.get(imgData.url, { responseType: "arraybuffer" });
//                         buffer = Buffer.from(response.data);
//                     }
//                     // Case 2: Base64 provided
//                     else if (imgData.b64_json) {
//                         buffer = Buffer.from(imgData.b64_json, "base64");
//                     }

//                     if (buffer) {

//                         buffer = await sharp(buffer)
//                             .resize({ width: 1024 })     // optional resize
//                             .jpeg({ quality: 75 })       // convert + compress
//                             .toBuffer();

//                         const fileName = `comic_page${page.page}_${Date.now()}.jpg`;

//                         // Direct upload to S3
//                         const s3Upload = await upload_files("comics", {
//                             name: fileName,
//                             data: buffer,
//                             mimetype: "image/jpeg",
//                         });

//                         imageUrl = s3Upload; // should return public S3 URL
//                         s3Key = `comics/${fileName}`;

//                         // Save ComicPage in DB
//                         await ComicPage.create({
//                             comicId,
//                             user_id: req.user.login_data._id,
//                             pageNumber: page.page,
//                             panels: page.panels,
//                             imageUrl,
//                             s3Key,
//                         });
//                     }
//                 }

//                 if (!imageUrl) {
//                     throw new Error(`Image generation failed for page ${page.page}`);
//                 }

//                 return { page: page.page, imageUrl };
//             })
//         );

//         res.json({ comicId, images: imageUrls });
//     } catch (error) {
//         console.error("Image API Error:", error);
//         res.status(500).json({ error: "Image generation failed" });
//     }
// };


const generateComicImage = async (req, res) => {
    const { comicId, pages } = req.body;

    try {
        const characterReferences = {}; // store first appearance of each character

        const imageUrls = await Promise.all(
            pages.map(async (page) => {
                // Build per-panel text for prompt
                const pagePrompt = page.panels
                    .map((p, idx) => {
                        let dialogueText = p.dialogue
                            .map((d) => {
                                // If we already have a reference for this character, note it
                                if (!characterReferences[d.character]) {
                                    characterReferences[d.character] = null; // mark as to be saved
                                }
                                return `${d.character}: "${d.text}"`;
                            })
                            .join(" ");
                        return `Panel ${idx + 1}: Scene: ${p.scene}. Caption: ${p.caption}. Dialogue: ${dialogueText}`;
                    })
                    .join("\n");

                // Build prompt including references for already generated characters
                let referencesText = "";
                for (const [character, refUrl] of Object.entries(characterReferences)) {
                    if (refUrl) {
                        referencesText += `Use this reference image for ${character}: ${refUrl}\n`;
                    } else {
                        referencesText += `Generate ${character} consistently across all pages.\n`;
                    }
                }

                const fullPrompt = `
A comic page with ${page.panels.length} vertical panels.
Style: realistic hand-drawn comic illustration with thin ink outlines and soft watercolor tones.
${referencesText}
Panels:
${pagePrompt}
`;

                // Generate Image
                const imageResponse = await openai.images.generate({
                    // model: "gpt-image-1",
                    model: "dall-e-3",
                    prompt: fullPrompt,
                    // size: "1024x1536",
                    size: "1024x1792", // dall-e-3
                    n: 1,
                });

                if (!imageResponse.data || !imageResponse.data[0]) {
                    throw new Error(`Image generation failed for page ${page.page}`);
                }

                const imgData = imageResponse.data[0];
                let buffer;

                // URL or base64
                if (imgData.url) {
                    const response = await axios.get(imgData.url, { responseType: "arraybuffer" });
                    buffer = Buffer.from(response.data);
                } else if (imgData.b64_json) {
                    buffer = Buffer.from(imgData.b64_json, "base64");
                }

                // Resize + convert
                buffer = await sharp(buffer)
                    .resize({ width: 1024 })
                    .jpeg({ quality: 75 })
                    .toBuffer();

                const fileName = `comic_page${page.page}_${Date.now()}.jpg`;

                // Upload to S3
                const s3Upload = await upload_files("comics", {
                    name: fileName,
                    data: buffer,
                    mimetype: "image/jpeg",
                });

                const imageUrl = s3Upload;
                const s3Key = `comics/${fileName}`;

                // Save ComicPage in DB
                await ComicPage.create({
                    comicId,
                    user_id: req.user.login_data._id,
                    pageNumber: page.page,
                    panels: page.panels,
                    imageUrl,
                    s3Key,
                });

                // Save first appearance reference for each character
                page.panels.forEach((panel) => {
                    panel.dialogue.forEach((d) => {
                        if (!characterReferences[d.character]) {
                            characterReferences[d.character] = imageUrl;
                        }
                    });
                });

                return { page: page.page, imageUrl };
            })
        );

        res.json({ comicId, images: imageUrls });
    } catch (error) {
        console.error("Image API Error:", error);
        res.status(500).json({ error: "Image generation failed", details: error.message });
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



// STEP 3: List All Comics (without user filter)
const listComics = async (req, res) => {
    try {
        const comics = await Comic.find({ status: "approved" }).select("title author subject pdfUrl createdAt status hasQuiz");

        const comicsWithThumbnail = await Promise.all(
            comics.map(async (comic) => {
                const firstPage = await ComicPage.findOne({ comicId: comic._id })
                    .sort({ pageNumber: 1 }) // pehla page
                    .select("imageUrl");

                return {
                    ...comic.toObject(),
                    thumbnail: firstPage ? firstPage.imageUrl : null,
                };
            })
        );

        res.json({ comics: comicsWithThumbnail });
    } catch (error) {
        console.error("Error listing comics:", error);
        res.status(500).json({ error: "Failed to list comics" });
    }
};


// STEP 4: Get Single Comic with Pages
const getComic = async (req, res) => {
    try {
        const { id } = req.params;

        const comic = await Comic.findById(id);
        if (!comic) {
            return res.status(404).json({ error: "Comic not found" });
        }

        const pages = await ComicPage.find({ comicId: id }).sort({ pageNumber: 1 });

        res.json({ comic, pages });
    } catch (error) {
        console.error("Error fetching comic:", error);
        res.status(500).json({ error: "Failed to get comic" });
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




module.exports = {
    refinePrompt, generateComicImage, generateComicPDF, listComics,
    getComic, updateComicStatus, deleteComic
};
