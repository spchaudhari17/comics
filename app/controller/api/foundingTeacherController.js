const User = require("../../models/User");
const stripe = require("../../../utils/stripe");

const createFoundingTeacherCheckout = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        // 1️⃣ Get User
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                message: "User not found",
            });
        }

        // 2️⃣ Already purchased
        if (user.isFoundingTeacher) {
            return res.status(400).json({
                message: "You are already a Founding Teacher.",
            });
        }

        // 3️⃣ Reuse Stripe Customer
        let stripeCustomerId = user.stripeCustomerId;

        if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: `${user.firstname || ""} ${user.lastname || ""}`.trim(),
                metadata: {
                    userId: user._id.toString(),
                },
            });

            stripeCustomerId = customer.id;

            user.stripeCustomerId = stripeCustomerId;
            await user.save();
        }

        // 4️⃣ Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            mode: "payment",

            customer: stripeCustomerId,

            payment_method_types: ["card"],

            line_items: [
                {
                    price: process.env.STRIPE_FOUNDING_TEACHER_PRICE_ID,
                    quantity: 1,
                },
            ],

            metadata: {
                userId: user._id.toString(),
                purchaseType: "founding_teacher",
            },

            success_url: `${process.env.FRONTEND_URL}/founding-teacher-success?session_id={CHECKOUT_SESSION_ID}`,

            cancel_url: `${process.env.FRONTEND_URL}/subscription-plans`,
        });

        return res.status(200).json({
            success: true,
            url: session.url,
        });

    } catch (error) {
        console.log("Create Founding Teacher Checkout Error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to create checkout session.",
        });
    }
};



const getFoundingTeacher = async (req, res) => {
    try {

        const userId = req.user.login_data._id;

        const user = await User.findById(userId)
            .select(
                "isFoundingTeacher foundingTeacherPurchasedAt"
            );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        return res.status(200).json({
            success: true,
            data: user,
        });

    } catch (error) {
        console.log("Get Founding Teacher Error:", error);

        return res.status(500).json({
            success: false,
            message: "Something went wrong.",
        });
    }
};


const getFoundingTeacherPayment = async (req, res) => {
    try {

        const userId = req.user.login_data._id;

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        if (!user.isFoundingTeacher) {
            return res.status(400).json({
                success: false,
                message: "Founding Teacher not activated.",
            });
        }

        if (!user.foundingTeacherPaymentIntentId) {
            return res.status(404).json({
                success: false,
                message: "Payment not found.",
            });
        }

        const paymentIntent = await stripe.paymentIntents.retrieve(
            user.foundingTeacherPaymentIntentId,
            {
                expand: ["latest_charge"]
            }
        );

        const charge = paymentIntent.latest_charge;

        return res.status(200).json({
            success: true,
            data: {
                transactionId: paymentIntent.id,
                paymentStatus: paymentIntent.status,
                amount: paymentIntent.amount / 100,
                currency: paymentIntent.currency,
                receiptUrl: charge?.receipt_url || null,
                chargeId: charge?.id || null,
                purchasedAt: user.foundingTeacherPurchasedAt,
            },
        });

    } catch (error) {

        console.log(error);

        return res.status(500).json({
            success: false,
            message: "Something went wrong.",
        });

    }
};



module.exports = {
    createFoundingTeacherCheckout, getFoundingTeacher, getFoundingTeacherPayment
};