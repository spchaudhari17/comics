const OpenAI = require("openai");
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});


// const refinePrompt = async (req, res) => {
//     const { title, author, subject, story } = req.body;

//     try {
//         console.log("Using GPT-4o to refine comic prompt...");

//         const promptText = `
// You are an expert at writing AI image generation prompts for comics.

// Transform the following comic details into a highly detailed, creative, and vivid prompt.
// Make sure the prompt describes characters, setting, mood, and style clearly.
// Keep it visually descriptive and suitable for a comic panel.

// Comic Title: ${title}
// Author: ${author}
// Subject: ${subject}

// Story:
// ${story}

// Output only the refined prompt, nothing else.
//     `;

//         const gptResponse = await openai.chat.completions.create({
//             // model: "gpt-4o", // agar cost bachani ho to "gpt-3.5-turbo" use karo
//             model: "gpt-3.5-turbo", // agar cost bachani ho to "gpt-3.5-turbo" use karo
//             messages: [
//                 { role: "system", content: "You are a skilled comic prompt engineer." },
//                 { role: "user", content: promptText }
//             ],
//             temperature: 0.9,
//             max_tokens: 500
//         });

//         const refinedPrompt = gptResponse.choices[0].message.content.trim();

//         // 🟢 Step 2 - Generate comic image using DALL·E 3
//         console.log("Generating image with DALL·E 3...");
//         const imageResponse = await openai.images.generate({
//             model: "dall-e-3",
//             prompt: refinedPrompt,
//             size: "1024x1024"
//         });

//         const imageUrl = imageResponse.data[0].url; // URL return karega
//         // Agar Base64 chahiye:
//         // const imageBase64 = imageResponse.data[0].b64_json;

//         res.json({
//             refinedPrompt,
//             imageUrl
//             // imageBase64: imageBase64 // Agar tum base64 chaho to uncomment karo
//         });

//     } catch (error) {
//         console.error("OpenAI API Error:", error);
//         res.status(500).json({ error: "Something went wrong", details: error.message });
//     }
// };


const refinePrompt = async (req, res) => {
    const { title, author, subject, story } = req.body;

    try {
        const promptText = `
You are an expert at writing AI image generation prompts for comics.

Turn the following comic idea into a vivid, detailed prompt for an illustrated comic page.  
It must have multiple panels, clear panel borders, speech bubbles with exact given dialogue, and captions.  
Style: classic hand-drawn vintage comic art with ink outlines and soft watercolor shading.

Comic Title: ${title}
Author: ${author}
Subject: ${subject}

Story:
${story}

Format the comic like this:
Panel 1:
- Describe the first scene visually in detail.
- Include any speech bubble text from the story inside quotation marks.
Panel 2:
- Describe the second scene visually in detail.
- Include caption text from the story if relevant.
Panel 3:
- Describe the third scene visually in detail.
- Include any price labels, arrows, or props mentioned.
Style Notes:
- Warm earthy tones, expressive characters, readable comic lettering, softly detailed backgrounds.
- Keep all speech bubbles exactly as given in the story text.
`;

        const gptResponse = await openai.chat.completions.create({
            model: "gpt-3.5-turbo",
            messages: [
                { role: "system", content: "You are a skilled comic prompt engineer." },
                { role: "user", content: promptText }
            ],
            temperature: 0.9,
            max_tokens: 500
        });

        res.json({ refinedPrompt: gptResponse.choices[0].message.content.trim() });
    } catch (error) {
        console.error("OpenAI API Error:", error);
        res.status(500).json({ error: "Prompt refinement failed", details: error.message });
    }
};



const generateComicImage = async (req, res) => {
    const { prompt } = req.body;

    try {
        const imageResponse = await openai.images.generate({
            model: "dall-e-3",
            prompt: prompt,
            size: "1024x1024"
        });

        const imageUrl = imageResponse.data[0].url;
        res.json({ image: imageUrl });
    } catch (error) {
        console.error("DALL·E API Error:", error);
        res.status(500).json({ error: "Image generation failed", details: error.message });
    }
};



module.exports = { refinePrompt, generateComicImage };
