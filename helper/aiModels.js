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

module.exports = { TEXT_MODEL, IMAGE_MODEL };
