const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function generateGeminiComicImage(prompt) {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt }
        ]
      }
    ],

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
