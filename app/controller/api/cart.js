const Cart = require("../../models/Cart");

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

        return res.json({
            error: false,
            data: cartItems
        });

    } catch (error) {
        return res.status(500).json({
            error: true,
            message: "Server error"
        });
    }
};


const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

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

        // 🔥 Stripe line items
        const line_items = cartItems.map((item) => ({
            price_data: {
                currency: "inr",
                product_data: {
                    name: item.bundleId.title
                },
                unit_amount: item.bundleId.price * 100 // paisa
            },
            quantity: 1
        }));

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "payment",
            line_items,
            success_url: `${process.env.FRONTEND_URL}/success`,
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
        const userId = req.user.login_data._id;

        const cartItems = await Cart.find({ userId });

        for (let item of cartItems) {
            await Purchase.create({
                userId,
                bundleId: item.bundleId,
                amount: 0,
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

module.exports = { addToCart, removeFromCart, getCart, createCheckoutSessionforCart, completePurchase }