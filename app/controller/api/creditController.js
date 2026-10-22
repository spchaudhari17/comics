// =====================================================================
// controllers/creditController.js
//
// Routes (user routes file me):
//   router.get("/user/credits", authentication, getMyCredits);
//   router.post("/user/credits/checkout", authentication, createCreditCheckout);
//
// .env:
//   FRONTEND_URL=https://your-frontend.com   (payment ke baad wapas yahan aayega)
// =====================================================================

const stripe = require("../../../utils/stripe");
const User = require("../../models/User");
const { CREDITS_PER_PAGE_EDIT, getPackById, getPublicPacks } = require("../../../utils/creditPacks");

// GET /user/credits -> balance + packs
const getMyCredits = async (req, res) => {
    try {
        const user = await User.findById(req.user.login_data._id)
            .select("editCredits isUnlimited")
            .lean();

        if (!user) {
            return res.status(404).json({ error: true, message: "User not found" });
        }

        return res.json({
            error: false,
            credits: user.editCredits || 0,
            isUnlimited: !!user.isUnlimited,
            costPerEdit: CREDITS_PER_PAGE_EDIT,
            packs: getPublicPacks()
        });
    } catch (error) {
        console.error("getMyCredits error:", error);
        return res.status(500).json({ error: true, message: "Failed to load credits" });
    }
};

// POST /user/credits/checkout  body: { packId }
const createCreditCheckout = async (req, res) => {
    try {
        const userId = String(req.user.login_data._id);
        const pack = getPackById(req.body.packId);

        if (!pack || !pack.priceId) {
            return res.status(400).json({ error: true, message: "Invalid credit pack" });
        }

        const frontendUrl = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");
        if (!frontendUrl) {
            console.error("FRONTEND_URL is not set");
            return res.status(500).json({ error: true, message: "Payment is not configured" });
        }

        const user = await User.findById(userId).select("email stripeCustomerId").lean();
        if (!user) {
            return res.status(404).json({ error: true, message: "User not found" });
        }

        const metadata = {
            purchaseType: "edit_credits",
            userId,
            packId: pack.id
        };

        // Pehle se Stripe customer hai to wahi, warna email se naya
        const customerFields = user.stripeCustomerId
            ? { customer: user.stripeCustomerId }
            : {
                customer_creation: "always",
                ...(user.email ? { customer_email: user.email } : {})
            };

        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            line_items: [{ price: pack.priceId, quantity: 1 }],
            ...customerFields,
            client_reference_id: userId,
            metadata,
            payment_intent_data: { metadata },
            success_url: `${frontendUrl}/credits/payment-result?status=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${frontendUrl}/credits/payment-result?status=cancelled`
        });

        return res.json({ error: false, url: session.url });
    } catch (error) {
        console.error("createCreditCheckout error:", error);
        return res.status(500).json({ error: true, message: "Could not start payment" });
    }
};

module.exports = { getMyCredits, createCreditCheckout };