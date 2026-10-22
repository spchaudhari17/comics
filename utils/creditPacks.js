// =====================================================================
// config/creditPacks.js
// Page edit credits: $5 = 30 credits, $10 = 70 credits
//
// Stripe Dashboard me 2 ONE-TIME prices banao (test + live dono me alag):
//   $5.00  -> STRIPE_EDIT_CREDITS_30_PRICE_ID
//   $10.00 -> STRIPE_EDIT_CREDITS_70_PRICE_ID
// =====================================================================

// Ek page dobara banane me kitne credit katenge
const CREDITS_PER_PAGE_EDIT = 1;

const CREDIT_PACKS = [
    {
        id: "credits_30",
        credits: 30,
        amountUsd: 5,
        priceId: process.env.STRIPE_EDIT_CREDITS_30_PRICE_ID
    },
    {
        id: "credits_70",
        credits: 70,
        amountUsd: 10,
        priceId: process.env.STRIPE_EDIT_CREDITS_70_PRICE_ID,
        badge: "Best value"
    }
];

const getPackById = (packId) => CREDIT_PACKS.find((p) => p.id === packId) || null;

const getPackByPriceId = (priceId) =>
    CREDIT_PACKS.find((p) => p.priceId && p.priceId === priceId) || null;

// Frontend ko priceId bhejne ki zarurat nahi
const getPublicPacks = () =>
    CREDIT_PACKS.filter((p) => p.priceId).map(({ id, credits, amountUsd, badge }) => ({
        id,
        credits,
        amountUsd,
        badge: badge || null
    }));

module.exports = {
    CREDITS_PER_PAGE_EDIT,
    CREDIT_PACKS,
    getPackById,
    getPackByPriceId,
    getPublicPacks
};