const express = require("express");
const router = express.Router();
const stripe = require("../../../utils/stripe");
const User = require("../../models/User");

router.post(
    "/stripe-webhook-for-founding-teacher",
    express.raw({ type: "application/json" }),
    async (req, res) => {

        console.log(
            "✅ Founding Teacher Webhook Triggered"
        );

        const sig =
            req.headers["stripe-signature"];

        const endpointSecret =
            process.env
                .STRIPE_FOUNDING_TEACHER_WEBHOOK_SECRET;

        let event;

        try {

            event = stripe.webhooks.constructEvent(
                req.body,
                sig,
                endpointSecret
            );

        } catch (err) {

            console.log(
                "❌ Signature verification failed:",
                err.message
            );

            return res
                .status(400)
                .send(
                    `Webhook Error: ${err.message}`
                );
        }


        try {

            console.log(
                "🔥 Founding Teacher Event:",
                event.type
            );


            // ==========================================
            // ONLY HANDLE CHECKOUT COMPLETED
            // ==========================================
            if (
                event.type ===
                "checkout.session.completed"
            ) {

                const session =
                    event.data.object;


                console.log(
                    "💳 Checkout Session:",
                    session.id
                );

                console.log(
                    "📌 Metadata:",
                    session.metadata
                );


                await handleFoundingTeacherPurchase(
                    session
                );
            }


            return res.json({
                received: true,
            });

        } catch (err) {

            console.log(
                "❌ Founding Teacher Webhook Error:",
                err
            );

            return res.status(500).json({
                message: "Webhook failed",
            });
        }
    }
);


async function handleFoundingTeacherPurchase(
    session
) {

    // ==========================================
    // 1. PAYMENT STATUS
    // ==========================================
    if (session.payment_status !== "paid") {

        console.log(
            "❌ Payment not completed"
        );

        return;
    }


    // ==========================================
    // 2. PURCHASE TYPE
    // ==========================================
    if (
        session.metadata?.purchaseType !==
        "founding_teacher"
    ) {

        console.log(
            "❌ Not a Founding Teacher purchase."
        );

        console.log(
            "Received purchaseType:",
            session.metadata?.purchaseType
        );

        return;
    }


    // ==========================================
    // 3. USER ID
    // ==========================================
    const userId =
        session.metadata?.userId;

    if (!userId) {

        console.log(
            "❌ userId missing in metadata"
        );

        return;
    }


    // ==========================================
    // 4. VERIFY PRICE
    // ==========================================
    const lineItems =
        await stripe.checkout.sessions.listLineItems(
            session.id,
            {
                limit: 10,
            }
        );

    const foundingPriceId =
        process.env
            .STRIPE_FOUNDING_TEACHER_PRICE_ID;


    const validFoundingPrice =
        lineItems.data.some(
            item =>
                item.price?.id ===
                foundingPriceId
        );


    if (!validFoundingPrice) {

        console.log(
            "❌ Invalid Founding Teacher Price ID"
        );

        console.log(
            "Expected:",
            foundingPriceId
        );

        console.log(
            "Received:",
            lineItems.data.map(
                item => item.price?.id
            )
        );

        return;
    }


    // ==========================================
    // 5. FIND USER
    // ==========================================
    const user =
        await User.findById(userId);

    if (!user) {

        console.log(
            "❌ User not found:",
            userId
        );

        return;
    }


    // ==========================================
    // 6. DUPLICATE PROTECTION
    // ==========================================
    if (user.isFoundingTeacher) {

        console.log(
            "⚠️ Founding Teacher already activated"
        );

        return;
    }


    // ==========================================
    // 7. ACTIVATE
    // ==========================================
    await User.findByIdAndUpdate(
        userId,
        {
            stripeCustomerId:
                session.customer,

            isFoundingTeacher:
                true,

            foundingTeacherPurchasedAt:
                new Date(),

            foundingTeacherPaymentIntentId:
                session.payment_intent,

            foundingTeacherSessionId:
                session.id,
        }
    );


    console.log(
        `✅ Founding Teacher Activated for ${user.email}`
    );
}


module.exports = router;