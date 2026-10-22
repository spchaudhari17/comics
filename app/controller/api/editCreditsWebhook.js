// =====================================================================
// routes/editCreditsWebhook.js
// Founding Teacher webhook jaisa hi, alag secret ke saath.
//
// Stripe Dashboard -> Webhooks -> naya endpoint:
//   URL:    https://your-backend.com/<prefix>/stripe-webhook-for-edit-credits
//   Events: checkout.session.completed, checkout.session.async_payment_succeeded
//
// .env: STRIPE_EDIT_CREDITS_WEBHOOK_SECRET=whsec_...
//
// ⚠️ Ise app.js me express.json() se PEHLE mount karo (founding teacher
//    webhook jahan mount hai, wahi), warna signature verify fail hoga.
// =====================================================================

const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const stripe = require("../../../utils/stripe");
const User = require("../../models/User");
const CreditTransaction = require("../../models/CreditTransaction");
const { getPackByPriceId } = require("../../../utils/creditPacks");

router.post(
    "/stripe-webhook-for-edit-credits",
    express.raw({ type: "application/json" }),
    async (req, res) => {
        let event;

        try {
            event = stripe.webhooks.constructEvent(
                req.body,
                req.headers["stripe-signature"],
                process.env.STRIPE_EDIT_CREDITS_WEBHOOK_SECRET
            );
        } catch (err) {
            console.log("❌ Edit credits webhook signature failed:", err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        try {
            if (
                event.type === "checkout.session.completed" ||
                event.type === "checkout.session.async_payment_succeeded"
            ) {
                await handleEditCreditsPurchase(event.data.object);
            }

            return res.json({ received: true });
        } catch (err) {
            // 500 -> Stripe khud retry karega
            console.log("❌ Edit credits webhook error:", err);
            return res.status(500).json({ message: "Webhook failed" });
        }
    }
);

async function handleEditCreditsPurchase(session) {
    // 1. Payment complete?
    // (bank transfer jaise async payments ke liye "async_payment_succeeded" baad me aata hai)
    if (session.payment_status !== "paid") {
        console.log("⏳ Edit credits payment not completed yet:", session.id);
        return;
    }

    // 2. Ye credits ki payment hai?
    if (session.metadata?.purchaseType !== "edit_credits") {
        return;
    }

    // 3. User
    const userId = session.metadata?.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        console.log("❌ Edit credits: invalid userId in metadata", session.id);
        return;
    }

    // 4. Credits price ID se nikalo (metadata pe bharosa nahi)
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10 });

    let credits = 0;
    let packId = null;

    lineItems.data.forEach((item) => {
        const pack = getPackByPriceId(item.price?.id);
        if (pack) {
            credits += pack.credits * (item.quantity || 1);
            packId = pack.id;
        }
    });

    if (credits <= 0) {
        console.log(
            "❌ Edit credits: no known credit price in session",
            session.id,
            lineItems.data.map((item) => item.price?.id)
        );
        return;
    }

    const user = await User.findById(userId).select("_id email stripeCustomerId");
    if (!user) {
        console.log("❌ Edit credits: user not found", userId);
        return;
    }

    // 5. Pehle transaction (stripeSessionId unique) -> duplicate webhook pe yahin ruk jayega
    let transaction;
    try {
        transaction = await CreditTransaction.create({
            userId,
            type: "purchase",
            credits,
            packId,
            amountUsd: (session.amount_total || 0) / 100,
            stripeSessionId: session.id,
            stripePaymentIntentId: session.payment_intent || undefined,
            note: "Stripe checkout"
        });
    } catch (err) {
        if (err.code === 11000) {
            console.log("⚠️ Edit credits already added for session", session.id);
            return;
        }
        throw err;
    }

    // 6. Credits add karo (fail ho to transaction hata do taaki Stripe retry pe dobara try ho)
    try {
        const update = { $inc: { editCredits: credits } };
        if (!user.stripeCustomerId && session.customer) {
            update.$set = { stripeCustomerId: session.customer };
        }
        await User.updateOne({ _id: userId }, update);
    } catch (err) {
        await CreditTransaction.deleteOne({ _id: transaction._id });
        throw err;
    }

    console.log(`✅ ${credits} edit credits added for ${user.email}`);
}

module.exports = router;