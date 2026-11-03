// =====================================================================
// utils/customThemeStyle.js
// User ka apna (custom) theme / style - sirf us comic ke liye save hota hai,
// Theme / Style list me add NAHI hota. Agli comic me user ko phir se likhna hoga.
// =====================================================================

const CUSTOM_TEXT_MAX = 100;

// Prompt me jaata hai: newline / extra space hatao, limit lagao
const cleanCustomText = (value) => {
    if (typeof value !== "string") return "";
    return value.replace(/\s+/g, " ").trim().slice(0, CUSTOM_TEXT_MAX);
};

// Image prompt ke liye style: list wala style ho to uska prompt, warna custom
const getStylePrompt = (comic) =>
    comic?.styleId?.prompt ||
    (comic?.customStyle ? `Art style: ${comic.customStyle}.` : "");

// FAQ / facts prompt ke liye theme: list wala theme ho to uska prompt, warna custom
const getThemePrompt = (comic) =>
    comic?.themeId?.prompt ||
    (comic?.customTheme ? `Theme: ${comic.customTheme}.` : "");

module.exports = { CUSTOM_TEXT_MAX, cleanCustomText, getStylePrompt, getThemePrompt };
