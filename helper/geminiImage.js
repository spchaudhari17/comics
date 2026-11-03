const { GoogleGenAI } = require("@google/genai");
const { IMAGE_MODEL } = require("./aiModels");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// options (optional, purane callers pe asar nahi):
//   referenceImages: [{ data: Buffer, mimeType: "image/jpeg" }] -> characters / style copy karne ke liye
//   aspectRatio: "4:3" jaisa
async function generateGeminiComicImage(prompt, options = {}) {
  const { referenceImages = [], aspectRatio } = options;

  const response = await ai.models.generateContent({
    // model: "gemini-2.5-flash-image",
    // model: "gemini-3.1-flash-image",
    model: IMAGE_MODEL, // helper/aiModels.js (Nano Banana 2.1)
    contents: [
      {
        role: "user",
        parts: [
          ...referenceImages.map((img) => ({
            inlineData: { mimeType: img.mimeType || "image/jpeg", data: img.data.toString("base64") }
          })),
          { text: prompt }
        ]
      }
    ],

    ...(aspectRatio ? { config: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio } } } : {}),

    generationConfig: {
      thinking_level: "high",                 //  THIS IS THE KEY
      response_modalities: ["IMAGE", "TEXT"], //  text ko language treat karega
      include_thoughts: false                 // true sirf debug ke liye
    }
  });

  const parts = response.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    if (part.inlineData?.data) {
      return Buffer.from(part.inlineData.data, "base64");
    }
  }

  throw new Error("❌ Gemini did not return image data");
}

module.exports = { generateGeminiComicImage };
