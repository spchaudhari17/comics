const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const OpenAI = require("openai");


//working
// const refinePrompt = async (req, res) => {
//     const { title, author, subject, story } = req.body;

//     // if (!title || !author || !subject || !story) {
//     //     return res.status(400).json({ error: "All fields are required" });
//     // }

//     try {
//         const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

//         // Function to run model
//         const runModel = async (modelName) => {
//             console.log(`Trying model: ${modelName}`);
//             const model = genAI.getGenerativeModel({ model: modelName });

//             const result = await model.generateContent(
//                 `You are an expert at writing AI image generation prompts for comics.

//         Transform the following comic details into a highly detailed, creative, and vivid prompt.
//         Make sure the prompt describes characters, setting, mood, and style clearly.
//         Keep it visually descriptive and suitable for a comic panel.

//         Comic Title: ${title}
//         Author: ${author}
//         Subject: ${subject}

//         Story:
//         ${story}

//         Output only the refined prompt, nothing else.`
//             );

//             return result.response.text();
//         };

//         let refinedPrompt;
//         try {
//             // First try the fast model
//             refinedPrompt = await runModel("gemini-1.5-flash");
//         } catch (err) {
//             if (err.message.includes("503") || err.message.includes("overloaded")) {
//                 console.warn("Gemini 1.5 Flash overloaded. Falling back to gemini-1.5-pro...");
//                 refinedPrompt = await runModel("gemini-1.5-pro"); // yahan 1.0-pro ki jagah 1.5-pro
//             } else {
//                 throw err; // Some other error
//             }
//         }

//         res.json({ refinedPrompt });

//     } catch (error) {
//         console.error("Gemini API Error:", error);
//         res.status(500).json({ error: "Something went wrong", details: error.message });
//     }
// };

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const refinePrompt = async (req, res) => {
    const { title, author, subject, story } = req.body;

    try {
        console.log("Using GPT-4o to refine comic prompt...");

        const promptText = `
You are an expert at writing AI image generation prompts for comics.

Transform the following comic details into a highly detailed, creative, and vivid prompt.
Make sure the prompt describes characters, setting, mood, and style clearly.
Keep it visually descriptive and suitable for a comic panel.

Comic Title: ${title}
Author: ${author}
Subject: ${subject}

Story:
${story}

Output only the refined prompt, nothing else.
    `;

        const gptResponse = await openai.chat.completions.create({
            // model: "gpt-4o", // agar cost bachani ho to "gpt-3.5-turbo" use karo
            model: "gpt-3.5-turbo", // agar cost bachani ho to "gpt-3.5-turbo" use karo
            messages: [
                { role: "system", content: "You are a skilled comic prompt engineer." },
                { role: "user", content: promptText }
            ],
            temperature: 0.9,
            max_tokens: 500
        });

        const refinedPrompt = gptResponse.choices[0].message.content.trim();

        // 🟢 Step 2 - Generate comic image using DALL·E 3
        console.log("Generating image with DALL·E 3...");
        const imageResponse = await openai.images.generate({
            model: "dall-e-3",
            prompt: refinedPrompt,
            size: "1024x1024"
        });

        const imageUrl = imageResponse.data[0].url; // URL return karega
        // Agar Base64 chahiye:
        // const imageBase64 = imageResponse.data[0].b64_json;

        res.json({
            refinedPrompt,
            imageUrl
            // imageBase64: imageBase64 // Agar tum base64 chaho to uncomment karo
        });

    } catch (error) {
        console.error("OpenAI API Error:", error);
        res.status(500).json({ error: "Something went wrong", details: error.message });
    }
};


//working
const generateComicImage = async (req, res) => {
    const { prompt } = req.body;

    try {
        // Trim prompt to 2000 chars max
        const trimmedPrompt = prompt.length > 2000 ? prompt.slice(0, 2000) : prompt;

        const response = await fetch(
            "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${process.env.STABILITY_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    text_prompts: [{ text: trimmedPrompt, weight: 1 }],
                    cfg_scale: 7,
                    clip_guidance_preset: "FAST_BLUE",
                    height: 1024,
                    width: 1024,
                    samples: 1,
                    steps: 30
                }),
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Stability API Error: ${errText}`);
        }

        const data = await response.json();
        const imageBase64 = data.artifacts[0].base64;

        res.json({ image: `data:image/png;base64,${imageBase64}` });

    } catch (error) {
        console.error("Image Generation Error:", error);
        res.status(500).json({ error: "Stability AI image generation failed", details: error.message });
    }
};




// const generateComicImage = async (req, res) => {
//   const { prompt } = req.body;

//   try {
//     // Trim prompt to 2000 chars max
//     const trimmedPrompt = prompt.length > 2000 ? prompt.slice(0, 2000) : prompt;

//     const response = await fetch(
//       "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
//       {
//         method: "POST",
//         headers: {
//           "Authorization": `Bearer ${process.env.STABILITY_API_KEY}`,
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({
//           text_prompts: [{ text: trimmedPrompt, weight: 1 }],
//           cfg_scale: 7,
//           clip_guidance_preset: "FAST_BLUE",
//           height: 1024,
//           width: 1024,
//           samples: 1,
//           steps: 30
//         }),
//       }
//     );

//     if (!response.ok) {
//       const errText = await response.text();
//       throw new Error(`Stability API Error: ${errText}`);
//     }

//     const data = await response.json();
//     const imageBase64 = data.artifacts[0].base64;

//     // Return both image & prompt
//     res.json({
//       image: `data:image/png;base64,${imageBase64}`,
//       text: trimmedPrompt
//     });

//   } catch (error) {
//     console.error("Image Generation Error:", error);
//     res.status(500).json({ error: "Stability AI image generation failed", details: error.message });
//   }
// };




module.exports = { refinePrompt, generateComicImage };
