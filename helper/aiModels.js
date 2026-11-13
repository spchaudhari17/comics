// =====================================================================
// helper/aiModels.js
// Saare text generation (comic prompt, quiz, hardcore quiz, FAQ, did you know)
// ka OpenAI model ek hi jagah. Model badalna ho to sirf yahi line badlo.
//
// gpt-6.1-sol reasoning model hai:
//   - max_tokens nahi chalta -> max_completion_tokens use karo
//   - temperature sirf default (1) chalta hai -> mat bhejo
//   - max_completion_tokens me reasoning tokens bhi gine jaate hain, limit badi rakho
// =====================================================================

const TEXT_MODEL = "gpt-6.1-sol";

// Comic pages + FAQ / Did You Know images (Gemini)
// "gemini-nano-banana-2.1"  = Nano Banana 2.1
// "gemini-3.1-flash-image"  = Nano Banana 2 (pehle wala)
const IMAGE_MODEL = "gemini-nano-banana-2.1";

// Reasoning model kabhi poora max_completion_tokens "sochne" me kharch kar deta hai
// aur content khaali ("") aata hai (finish_reason = "length").
// Aisa ho to ek baar double limit ke saath dobara try karte hain.
const MAX_COMPLETION_TOKENS_CAP = 32000;

const createTextCompletion = async (openai, params, label = "text") => {
    let maxTokens = params.max_completion_tokens;

    for (let attempt = 1; attempt <= 2; attempt++) {
        const response = await openai.chat.completions.create({
            ...params,
            max_completion_tokens: maxTokens
        });

        const choice = response.choices?.[0];
        const content = choice?.message?.content;

        if (content && content.trim()) return response;

        console.error(`⚠️ ${label}: empty AI response`, {
            attempt,
            finish_reason: choice?.finish_reason,
            max_completion_tokens: maxTokens,
            usage: response.usage
        });

        if (choice?.finish_reason !== "length" || maxTokens >= MAX_COMPLETION_TOKENS_CAP) {
            return response;
        }
        maxTokens = Math.min(maxTokens * 2, MAX_COMPLETION_TOKENS_CAP);
    }
};

module.exports = { TEXT_MODEL, IMAGE_MODEL, createTextCompletion };
