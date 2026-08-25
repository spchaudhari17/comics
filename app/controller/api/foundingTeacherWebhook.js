const express = require("express");
const router = express.Router();
const stripe = require("../../../utils/stripe");
const User = require("../../models/User");

router.post("/stripe-webhook-for-founding-teacher",
    express.raw({ type: "application/json" }),
    async (req, res) => {
        console.log("✅ Founding Teacher Webhook Triggered");

        const sig = req.headers["stripe-signature"];
        const endpointSecret =
            process.env.STRIPE_FOUNDING_TEACHER_WEBHOOK_SECRET;

        let event;

        try {
            event = stripe.webhooks.constructEvent(
                req.body,
                sig,
                endpointSecret
            );
        } catch (err) {
            console.log("❌ Signature verification failed:", err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        try {
            switch (event.type) {

                case "checkout.session.completed": {

                    const session = event.data.object;

                    await handleFoundingTeacherPurchase(session);

                    break;
                }

                default:
                    console.log(`Unhandled event: ${event.type}`);
            }

            return res.json({
                received: true,
            });

        } catch (err) {
            console.log("❌ Founding Teacher Webhook Error:", err);

            return res.status(500).json({
                message: "Webhook failed",
            });
        }
    }
);

async function handleFoundingTeacherPurchase(session) {

    try {

        if (session.payment_status !== "paid") {
            console.log("❌ Payment not completed");
            return;
        }

        const userId = session.metadata?.userId;

        if (!userId) {
            console.log("❌ userId missing in metadata");
            return;
        }

        const user = await User.findById(userId);

        if (!user) {
            console.log("❌ User not found");
            return;
        }

        // Already activated
        if (user.isFoundingTeacher) {
            console.log("⚠️ Founding Teacher already activated");
            return;
        }

        await User.findByIdAndUpdate(
            userId,
            {
                stripeCustomerId: session.customer,

                isFoundingTeacher: true,

                foundingTeacherPurchasedAt: new Date(),

                foundingTeacherPaymentIntentId:
                    session.payment_intent,

                foundingTeacherSessionId:
                    session.id,
            },
            {
                new: true,
            }
        );

        console.log(
            `✅ Founding Teacher Activated for ${user.email}`
        );

    } catch (err) {

        console.log(
            "❌ handleFoundingTeacherPurchase Error:",
            err
        );

    }

}

module.exports = router;