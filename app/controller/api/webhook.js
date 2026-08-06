// app/controller/api/webhook.js

const express = require("express");
const router = express.Router();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const Purchase = require("../../models/Purchase");
const Cart = require("../../models/Cart");

// 🔥 IMPORTANT: Raw body middleware use karo
router.post("/stripe-webhook-for-bundle",
    express.raw({ type: "application/json" }),
    async (req, res) => {
        console.log("✅ Webhook triggered");

        const sig = req.headers["stripe-signature"];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        // Debug logs
        console.log("🔑 Signature:", sig ? "Present" : "Missing");
        console.log("📦 Webhook Secret:", webhookSecret ? "Present" : "Missing");
        console.log("📝 Body length:", req.body?.length || 0);

        let event;

        try {
            // 🔥 Raw body use kar rahe hain
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
            console.log("✅ Webhook verified successfully");
        } catch (err) {
            console.log(`❌ Webhook Error: ${err.message}`);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        // Handle checkout.session.completed
        if (event.type === "checkout.session.completed") {
            const session = event.data.object;

            try {
                await handleSuccessfulPayment(session);
                console.log("✅ Payment processed successfully");
            } catch (error) {
                console.log("❌ Payment handling error:", error);
            }
        }

        res.json({ received: true });
    }
);

// 🔥 Payment handling function
async function handleSuccessfulPayment(session) {
    console.log("💰 Payment successful:", session.id);

    const userId = session.metadata.userId;
    const cartItems = JSON.parse(session.metadata.cartItems);

    // const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
    // const chargeId = paymentIntent.latest_charge;

    const paymentIntent = await stripe.paymentIntents.retrieve(
        session.payment_intent,
        {
            expand: ["latest_charge"]
        }
    );

    const charge = paymentIntent.latest_charge;

    const chargeId = charge.id;
    const receiptUrl = charge.receipt_url;

    for (let item of cartItems) {
        console.log(`📦 Processing: ${item.title} (${item.bundleId})`);

        const amount = item.price;
        const teacherAmount = amount * 0.8;
        const platformAmount = amount * 0.2;

        const purchase = new Purchase({
            userId,
            bundleId: item.bundleId,
            teacherId: item.teacherId,
            amount,
            currency: "usd",
            teacherAmount,
            platformAmount,
            paymentIntentId: session.payment_intent,
            chargeId,
            receiptUrl,
            paymentStatus: "success",
            paymentMethod: "card",
            buyerDetails: {
                name: session.customer_details?.name || "Unknown",
                email: session.customer_details?.email || "Unknown"
            },
            teacherPayoutStatus: "pending"
        });

        if (item.teacherStripeId) {
            try {
                console.log(`💸 Transferring $${teacherAmount} to teacher ${item.teacherId}`);

                const transfer = await stripe.transfers.create({
                    amount: Math.round(teacherAmount * 100),
                    currency: "usd",
                    destination: item.teacherStripeId,
                    transfer_group: session.payment_intent,
                    metadata: {
                        bundleId: item.bundleId,
                        userId: userId,
                        purchaseId: purchase._id.toString(),
                        teacherId: item.teacherId
                    }
                });

                purchase.transferId = transfer.id;
                purchase.teacherPayoutStatus = "transferred";

                console.log(`✅ Transfer ${transfer.id} created`);

            } catch (transferError) {
                console.log(`❌ Transfer failed:`, transferError);
                purchase.teacherPayoutStatus = "failed";
            }
        }

        await purchase.save();
    }

    await Cart.deleteMany({ userId });
    console.log(`✅ Processed ${cartItems.length} purchases for user ${userId}`);
}

module.exports = router;