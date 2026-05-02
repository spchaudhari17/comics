const Cart = require("../../models/Cart");
const ComicPage = require("../../models/ComicPage");
const Stripe = require("stripe");
const Purchase = require("../../models/Purchase");
const User = require("../../models/User");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const addToCart = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const { bundleId } = req.body;

        // check already added
        const existing = await Cart.findOne({ userId, bundleId });

        if (existing) {
            return res.json({
                error: true,
                message: "Already in cart"
            });
        }

        const cart = await Cart.create({ userId, bundleId });

        return res.json({
            error: false,
            message: "Added to cart",
            data: cart
        });

    } catch (error) {
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};


const removeFromCart = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const { bundleId } = req.params;

        const deleted = await Cart.findOneAndDelete({
            userId,
            bundleId
        });

        if (!deleted) {
            return res.status(404).json({
                error: true,
                message: "Item not found in cart"
            });
        }

        return res.json({
            error: false,
            message: "Removed from cart"
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};

const getCart = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        const cartItems = await Cart.find({ userId })
            .populate({
                path: "bundleId",
                populate: [
                    { path: "teacherId", select: "firstname lastname" },
                    { path: "comics" }
                ]
            });

        // 🔥 attach thumbnail
        const updatedCart = await Promise.all(
            cartItems.map(async (item) => {

                const bundle = item.bundleId;

                const comicsWithThumb = await Promise.all(
                    bundle.comics.map(async (comic) => {
                        const page = await ComicPage.findOne({ comicId: comic._id });

                        return {
                            ...comic.toObject(),
                            thumbnail: page?.imageUrl || null
                        };
                    })
                );

                return {
                    ...item.toObject(),
                    bundleId: {
                        ...bundle.toObject(),
                        comics: comicsWithThumb
                    }
                };
            })
        );

        return res.json({
            error: false,
            data: updatedCart
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};



// const createCheckoutSessionforCart = async (req, res) => {
//     try {
//         const userId = req.user.login_data._id;
//         const cartItems = await Cart.find({ userId }).populate("bundleId");

//         if (!cartItems.length) {
//             return res.status(400).json({
//                 error: true,
//                 message: "Cart is empty"
//             });
//         }

//         // 🔥 Stripe line items
//         const line_items = cartItems.map((item) => ({
//             price_data: {
//                 currency: "inr",
//                 product_data: {
//                     name: item.bundleId.title
//                 },
//                 unit_amount: item.bundleId.price * 100 // paisa
//             },
//             quantity: 1
//         }));

//         const session = await stripe.checkout.sessions.create({
//             payment_method_types: ["card"],
//             mode: "payment",
//             line_items,
//             success_url: `${process.env.FRONTEND_URL}/success`,
//             cancel_url: `${process.env.FRONTEND_URL}/cart`
//         });

//         return res.json({
//             error: false,
//             url: session.url
//         });

//     } catch (error) {
//         console.log(error);
//         return res.status(500).json({
//             error: true,
//             message: "Stripe error"
//         });
//     }
// };


const createCheckoutSessionforCart = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        const cartItems = await Cart.find({ userId }).populate("bundleId");

        if (!cartItems.length) {
            return res.status(400).json({
                error: true,
                message: "Cart is empty"
            });
        }

        // 🔥 line items
        const line_items = cartItems.map((item) => ({
            price_data: {
                currency: "usd", // ✅ FIX
                product_data: {
                    name: item.bundleId.title
                },
                unit_amount: item.bundleId.price * 100
            },
            quantity: 1
        }));

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "payment",
            line_items,

            // 🔥 VERY IMPORTANT
            metadata: {
                userId: userId.toString()
            },

            // success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}&type=cart`,
            success_url: `${process.env.FRONTEND_URL}/success/cart?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/cart`
        });

        return res.json({
            error: false,
            url: session.url
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({
            error: true,
            message: "Stripe error"
        });
    }
};


const completePurchase = async (req, res) => {
    try {
        console.log("🔥 API HIT");
        const userId = req.user.login_data._id;

        const cartItems = await Cart.find({ userId }).populate("bundleId");

        for (let item of cartItems) {

            const bundle = item.bundleId;
            const amount = bundle.price;

            await Purchase.create({
                userId,
                bundleId: bundle._id,

                amount,
                teacherAmount: amount * 0.6,
                platformAmount: amount * 0.4,

                paymentIntentId: "demo_txn", // 🔥 replace later
                paymentStatus: "success"
            });
        }

        await Cart.deleteMany({ userId });

        return res.json({
            error: false,
            message: "Purchase completed"
        });

    } catch (error) {
        return res.status(500).json({
            error: true,
            message: "Error completing purchase"
        });
    }
};




const createStripeAccount = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        const account = await stripe.accounts.create({
            type: "express"
        });

        await User.findByIdAndUpdate(userId, {
            stripeAccountId: account.id
        });

        return res.json({
            error: false,
            accountId: account.id
        });

    } catch (err) {
        return res.status(500).json({
            error: true,
            message: "Stripe account creation failed"
        });
    }
};

const createOnboardingLink = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        const user = await User.findById(userId);

        if (!user.stripeAccountId) {
            return res.status(400).json({
                error: true,
                message: "Stripe account not found"
            });
        }

        const accountLink = await stripe.accountLinks.create({
            account: user.stripeAccountId,
            refresh_url: `${process.env.FRONTEND_URL}/reauth`,
            return_url: `${process.env.FRONTEND_URL}/dashboard`,
            type: "account_onboarding"
        });

        return res.json({
            error: false,
            url: accountLink.url
        });

    } catch (err) {
        return res.status(500).json({
            error: true,
            message: "Failed to create onboarding link"
        });
    }
};

const getPayoutStatus = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        const user = await User.findById(userId);

        if (!user.stripeAccountId) {
            return res.json({
                error: false,
                connected: false
            });
        }

        const account = await stripe.accounts.retrieve(user.stripeAccountId);

        // 🔥 bank details
        const externalAccounts = await stripe.accounts.listExternalAccounts(
            user.stripeAccountId,
            { object: "bank_account" }
        );

        const bank = externalAccounts.data[0];

        return res.json({
            error: false,
            connected: true,
            payoutsEnabled: account.payouts_enabled,
            chargesEnabled: account.charges_enabled,
            bank: bank
                ? `${bank.bank_name} ****${bank.last4}`
                : null
        });

    } catch (err) {
        return res.status(500).json({
            error: true,
            message: "Error fetching payout status"
        });
    }
};


module.exports = {
    addToCart, removeFromCart, getCart, createCheckoutSessionforCart, completePurchase,
    createStripeAccount, createOnboardingLink, getPayoutStatus
}