const Cart = require("../../models/Cart");
const ComicPage = require("../../models/ComicPage");
const Stripe = require("stripe");
const Purchase = require("../../models/Purchase");
const User = require("../../models/User");
const BundleRating = require("../../models/BundleRating");
const ComicBundle = require("../../models/ComicBundle");
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



// controllers/cartController.js

const createCheckoutSessionforCart = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        // 🔥 Get all cart items with teacher details
        const cartItems = await Cart.find({ userId })
            .populate({
                path: "bundleId",
                populate: {
                    path: "teacherId",
                    select: "stripeAccountId firstname lastname email"
                }
            });

        if (!cartItems.length) {
            return res.status(400).json({
                error: true,
                message: "Cart is empty"
            });
        }

        // 🔥 Check if all teachers have Stripe accounts
        const teachersWithoutStripe = cartItems.filter(
            item => !item.bundleId.teacherId.stripeAccountId
        );

        if (teachersWithoutStripe.length) {
            const teacherNames = teachersWithoutStripe.map(
                item => item.bundleId.teacherId.firstname
            ).join(", ");

            return res.status(400).json({
                error: true,
                message: `Teachers (${teacherNames}) haven't set up payment account`
            });
        }

        // 🔥 Create line items for Stripe
        const line_items = cartItems.map((item) => {
            const bundle = item.bundleId;
            const teacher = bundle.teacherId;

            return {
                price_data: {
                    currency: "usd",
                    product_data: {
                        name: bundle.title,
                        description: `By ${teacher.firstname} ${teacher.lastname}`,
                        metadata: {
                            bundleId: bundle._id.toString(),
                            teacherId: teacher._id.toString(),
                            teacherStripeId: teacher.stripeAccountId
                        }
                    },
                    unit_amount: bundle.price * 100 // in cents
                },
                quantity: 1
            };
        });

        // 🔥 Store all cart data in metadata
        const cartMetadata = cartItems.map(item => ({
            bundleId: item.bundleId._id.toString(),
            teacherId: item.bundleId.teacherId._id.toString(),
            teacherStripeId: item.bundleId.teacherId.stripeAccountId,
            price: item.bundleId.price,
            title: item.bundleId.title
        }));

        // 🔥 Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: "payment",
            line_items,

            // 🔥 Important: Store all metadata
            metadata: {
                userId: userId.toString(),
                cartItems: JSON.stringify(cartMetadata),
                totalItems: cartItems.length.toString()
            },

            success_url: `${process.env.FRONTEND_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.FRONTEND_URL}/cart`
        });

        return res.json({
            error: false,
            url: session.url,
            sessionId: session.id
        });

    } catch (error) {
        console.log("❌ Checkout Error:", error);
        return res.status(500).json({
            error: true,
            message: error.message || "Stripe error"
        });
    }
};


// const completePurchase = async (req, res) => {
//     try {
//         console.log("🔥 API HIT");
//         const userId = req.user.login_data._id;

//         const cartItems = await Cart.find({ userId }).populate("bundleId");

//         for (let item of cartItems) {

//             const bundle = item.bundleId;
//             const amount = bundle.price;

//             await Purchase.create({
//                 userId,
//                 bundleId: bundle._id,

//                 amount,
//                 teacherAmount: amount * 0.6,
//                 platformAmount: amount * 0.4,

//                 paymentIntentId: "demo_txn", // 🔥 replace later
//                 paymentStatus: "success"
//             });
//         }

//         await Cart.deleteMany({ userId });

//         return res.json({
//             error: false,
//             message: "Purchase completed"
//         });

//     } catch (error) {
//         return res.status(500).json({
//             error: true,
//             message: "Error completing purchase"
//         });
//     }
// };

// 🔥 Remove this old method - use webhook instead
// const completePurchase = async (req, res) => { ... }

// 🔥 New: Get payment status after successful payment
const getPaymentStatus = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const userId = req.user.login_data._id;

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status !== "paid") {
            return res.json({
                error: false,
                status: "pending",
                message: "Payment not completed yet"
            });
        }

        // Get purchases
        const purchases = await Purchase.find({
            userId,
            paymentIntentId: session.payment_intent
        }).populate("bundleId");

        return res.json({
            error: false,
            status: "success",
            purchases
        });

    } catch (error) {
        return res.status(500).json({
            error: true,
            message: "Error fetching payment status"
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
            return_url: `${process.env.FRONTEND_URL}/my-account`,
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




// const createStripeAccount = async (req, res) => {
//     try {
//         const userId = req.user.login_data._id;

//         // 🔥 Check if already has account
//         const user = await User.findById(userId);
//         if (user.stripeAccountId) {
//             return res.json({
//                 error: false,
//                 accountId: user.stripeAccountId,
//                 message: "Account already exists"
//             });
//         }

//         // 🔥 Create Express Account
//         const account = await stripe.accounts.create({
//             type: "express",
//             country: "US", // Change as per your country
//             email: user.email,
//             capabilities: {
//                 transfers: { requested: true }
//             }
//         });

//         // 🔥 Save to user
//         user.stripeAccountId = account.id;
//         await user.save();

//         // 🔥 Generate Onboarding Link
//         const accountLink = await stripe.accountLinks.create({
//             account: account.id,
//             refresh_url: `${process.env.FRONTEND_URL}/reauth`,
//             return_url: `${process.env.FRONTEND_URL}/my-account`,
//             type: "account_onboarding"
//         });

//         return res.json({
//             error: false,
//             accountId: account.id,
//             onboardingUrl: accountLink.url
//         });

//     } catch (err) {
//         console.log("❌ STRIPE ERROR:", err);
//         return res.status(500).json({
//             error: true,
//             message: err.message || "Stripe account creation failed"
//         });
//     }
// };



// controllers/stripeController.js
// old sahi hai magar chekcing nhi hai 
// const createStripeAccount = async (req, res) => {
//     try {
//         const userId = req.user.login_data._id;
//         const user = await User.findById(userId);

//         // 🔥 Check if account already exists
//         if (user.stripeAccountId) {
//             try {
//                 const account = await stripe.accounts.retrieve(user.stripeAccountId);

//                 // 🔥 Account exists, generate onboarding link
//                 const accountLink = await stripe.accountLinks.create({
//                     account: account.id,
//                     refresh_url: `${process.env.FRONTEND_URL}/reauth`,
//                     return_url: `${process.env.FRONTEND_URL}/my-account`,
//                     type: "account_onboarding"
//                 });

//                 return res.json({
//                     error: false,
//                     accountId: account.id,
//                     onboardingUrl: accountLink.url,
//                     message: "Account exists. Please complete onboarding."
//                 });

//             } catch (err) {
//                 // 🔥 Account doesn't exist - create new
//                 console.log("Invalid account, creating new...");
//                 user.stripeAccountId = null;
//                 await user.save();
//             }
//         }

//         // 🔥 Create new Stripe account
//         const account = await stripe.accounts.create({
//             type: "express",
//             country: "US",
//             email: user.email,
//             capabilities: {
//                 transfers: { requested: true },
//                 card_payments: { requested: true }
//             }
//         });

//         // 🔥 Save to user
//         user.stripeAccountId = account.id;
//         await user.save();

//         // 🔥 Generate onboarding link
//         const accountLink = await stripe.accountLinks.create({
//             account: account.id,
//             refresh_url: `${process.env.FRONTEND_URL}/reauth`,
//             return_url: `${process.env.FRONTEND_URL}/my-account`,
//             type: "account_onboarding"
//         });

//         return res.json({
//             error: false,
//             accountId: account.id,
//             onboardingUrl: accountLink.url,
//             message: "Account created. Please complete onboarding."
//         });

//     } catch (err) {
//         console.log("❌ STRIPE ERROR:", err);
//         return res.status(500).json({
//             error: true,
//             message: err.message || "Stripe account creation failed"
//         });
//     }
// };


const createStripeAccount = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const user = await User.findById(userId);

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

        // 🔥 If account exists, check status
        if (user.stripeAccountId) {
            try {
                const account = await stripe.accounts.retrieve(user.stripeAccountId);
                console.log("📊 Existing account:", account.id);

                // Check if has bank
                let hasBank = false;
                try {
                    const externalAccounts = await stripe.accounts.listExternalAccounts(
                        user.stripeAccountId,
                        { object: "bank_account", limit: 1 }
                    );
                    hasBank = externalAccounts.data.length > 0;
                } catch (bankErr) {
                    console.log("Bank fetch error:", bankErr.message);
                }

                // If fully set up
                if (account.charges_enabled && account.payouts_enabled && hasBank) {
                    user.payoutsEnabled = true;
                    user.chargesEnabled = true;
                    await user.save();

                    return res.json({
                        error: false,
                        accountId: account.id,
                        alreadySetUp: true,
                        message: "✅ Account is already fully set up!",

                    });
                }

                // Generate onboarding link
                const accountLink = await stripe.accountLinks.create({
                    account: account.id,
                    refresh_url: `${frontendUrl}/reauth`,
                    return_url: `${frontendUrl}/my-account`,
                    type: "account_onboarding"
                });

                return res.json({
                    error: false,
                    accountId: account.id,
                    onboardingUrl: accountLink.url,
                    message: hasBank ? "Complete verification" : "Add bank account"
                });

            } catch (err) {
                console.log("❌ Invalid account, creating new...");
                user.stripeAccountId = null;
                await user.save();
            }
        }

        // 🔥 Create new Stripe account (Simple version - works!)
        console.log("🆕 Creating new Stripe account for:", user.email);

        const account = await stripe.accounts.create({
            type: "express",
            country: user.countryCode || "US",
            email: user.email,
            capabilities: {
                transfers: { requested: true },
                card_payments: { requested: true }
            }
        });

        console.log("✅ Account created:", account.id);

        // Save to user
        user.stripeAccountId = account.id;
        await user.save();

        // Generate onboarding link
        const accountLink = await stripe.accountLinks.create({
            account: account.id,
            refresh_url: `${frontendUrl}/reauth`,
            return_url: `${frontendUrl}/my-account`,
            type: "account_onboarding"
        });

        return res.json({
            error: false,
            accountId: account.id,
            onboardingUrl: accountLink.url,
            message: "Account created. Please complete onboarding."
        });

    } catch (err) {
        console.log("❌ STRIPE ERROR:", err);
        return res.status(500).json({
            error: true,
            message: err.message || "Stripe account creation failed"
        });
    }
};
// 🔥 Helper function to get update link
const getAccountUpdateLink = async (accountId) => {
    try {
        const accountLink = await stripe.accountLinks.create({
            account: accountId,
            refresh_url: `${process.env.FRONTEND_URL}/reauth`,
            return_url: `${process.env.FRONTEND_URL}/my-account`,
            type: "account_onboarding",
        });
        return accountLink.url;
    } catch (err) {
        console.log("Update link error:", err.message);
        return null;
    }
};



const checkTeacherStripeStatus = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const user = await User.findById(userId);

        if (!user.stripeAccountId) {
            return res.json({
                error: false,
                hasAccount: false,
                message: "No Stripe account found. Please create one."
            });
        }

        // 🔥 Verify if account exists in Stripe
        try {
            const account = await stripe.accounts.retrieve(user.stripeAccountId);

            return res.json({
                error: false,
                hasAccount: true,
                accountId: user.stripeAccountId,
                accountDetails: {
                    chargesEnabled: account.charges_enabled,
                    payoutsEnabled: account.payouts_enabled,
                    detailsSubmitted: account.details_submitted,
                    capabilities: account.capabilities,
                    requirements: account.requirements,
                    // 🔥 Check if account is fully verified
                    isVerified: account.charges_enabled && account.payouts_enabled
                }
            });
        } catch (err) {
            // 🔥 Account doesn't exist in Stripe - Clear invalid ID
            if (err.code === 'resource_missing') {
                user.stripeAccountId = null;
                await user.save();

                return res.json({
                    error: false,
                    hasAccount: false,
                    message: "Stripe account not found. Please create a new one."
                });
            }
            throw err;
        }
    } catch (error) {
        console.log("❌ Error checking Stripe status:", error);
        return res.status(500).json({
            error: true,
            message: "Error checking Stripe account status"
        });
    }
};


// 🔥 Check teacher payout status
const getPayoutStatus = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const user = await User.findById(userId);

        if (!user.stripeAccountId) {
            return res.json({
                error: false,
                connected: false,
                hasAccount: false,
                message: "No Stripe account found"
            });
        }

        // 🔥 Get account details
        const account = await stripe.accounts.retrieve(user.stripeAccountId);

        // 🔥 Get bank account details
        let bankDetails = null;
        try {
            const externalAccounts = await stripe.accounts.listExternalAccounts(
                user.stripeAccountId,
                { object: "bank_account", limit: 1 }
            );

            if (externalAccounts.data && externalAccounts.data.length > 0) {
                const bank = externalAccounts.data[0];
                bankDetails = {
                    bankName: bank.bank_name,
                    last4: bank.last4,
                    routingNumber: bank.routing_number,
                    country: bank.country,
                    currency: bank.currency,
                    status: bank.status
                };
            }
        } catch (err) {
            console.log("Bank details fetch error:", err.message);
        }

        // 🔥 Get balance
        let balance = null;
        try {
            const balanceData = await stripe.balance.retrieve({
                stripeAccount: user.stripeAccountId
            });
            balance = {
                available: balanceData.available,
                pending: balanceData.pending
            };
        } catch (err) {
            console.log("Balance fetch error:", err.message);
        }

        // 🔥 Get recent transfers
        let transfers = [];
        try {
            const transferData = await stripe.transfers.list({
                destination: user.stripeAccountId,
                limit: 5
            });
            transfers = transferData.data.map(t => ({
                id: t.id,
                amount: t.amount / 100,
                currency: t.currency,
                status: t.status,
                created: new Date(t.created * 1000)
            }));
        } catch (err) {
            console.log("Transfers fetch error:", err.message);
        }

        return res.json({
            error: false,
            connected: true,
            hasAccount: true,
            accountId: user.stripeAccountId,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            detailsSubmitted: account.details_submitted,
            // 🔥 Bank details - this is what frontend needs
            bank: bankDetails ? `${bankDetails.bankName} ****${bankDetails.last4}` : null,
            bankDetails: bankDetails,
            balance: balance,
            recentTransfers: transfers,
            isActive: account.charges_enabled && account.payouts_enabled
        });

    } catch (err) {
        console.log("❌ Payout status error:", err);
        return res.status(500).json({
            error: true,
            message: "Error fetching payout status"
        });
    }
};




const getTeacherBalance = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const user = await User.findById(userId);

        if (!user.stripeAccountId) {
            return res.status(400).json({
                error: true,
                message: "No Stripe account found"
            });
        }

        console.log(`🔍 Fetching balance for account: ${user.stripeAccountId}`);

        // 🔥 FIX: Get balance with correct method
        let balance;
        try {
            balance = await stripe.balance.retrieve({
                stripeAccount: user.stripeAccountId
            });
        } catch (err) {
            // 🔥 Alternative method if above fails
            balance = await stripe.balance.retrieve(
                {},
                { stripeAccount: user.stripeAccountId }
            );
        }

        console.log(`💰 Balance response:`, JSON.stringify(balance, null, 2));

        // 🔥 FIX: Initialize payouts as empty array
        let payouts = [];
        try {
            const payoutData = await stripe.payouts.list(
                { limit: 10 },
                { stripeAccount: user.stripeAccountId }
            );
            payouts = payoutData.data;
        } catch (err) {
            console.log('⚠️ Payouts fetch error:', err.message);
        }

        // 🔥 FIX: Initialize transfers as empty array
        let transfers = [];
        try {
            const transferData = await stripe.transfers.list(
                { limit: 10 },
                { stripeAccount: user.stripeAccountId }
            );
            transfers = transferData.data;
        } catch (err) {
            console.log('⚠️ Transfers fetch error:', err.message);
        }

        // 🔥 Calculate available balance
        const availableAmount = balance.available?.reduce((sum, b) => sum + b.amount, 0) / 100 || 0;
        const pendingAmount = balance.pending?.reduce((sum, b) => sum + b.amount, 0) / 100 || 0;
        const totalAmount = availableAmount + pendingAmount;

        return res.json({
            error: false,
            data: {
                balance: {
                    available: balance.available || [],
                    pending: balance.pending || [],
                    availableAmount: availableAmount,
                    pendingAmount: pendingAmount,
                    totalAmount: totalAmount
                },
                payouts: payouts.map(p => ({
                    id: p.id,
                    amount: p.amount / 100,
                    status: p.status,
                    arrivalDate: p.arrival_date ? new Date(p.arrival_date * 1000) : null,
                    bank: p.bank_account?.bank_name || "Unknown",
                    last4: p.bank_account?.last4 || "****"
                })),
                transfers: transfers.map(t => ({
                    id: t.id,
                    amount: t.amount / 100,
                    status: t.status,
                    created: new Date(t.created * 1000),
                    destination: t.destination
                }))
            }
        });

    } catch (err) {
        console.log('❌ Error:', err.message);
        console.log('❌ Full error:', err);
        return res.status(500).json({
            error: true,
            message: err.message,
            details: err.raw ? err.raw.message : null
        });
    }
};

// 🔥 Get Transfer Status - Fixed
const getTransferStatus = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const user = await User.findById(userId);

        if (!user || !user.stripeAccountId) {
            return res.status(400).json({
                error: true,
                message: "No Stripe account found"
            });
        }

        // 🔥 Get purchases from database
        const purchases = await Purchase.find({
            teacherId: userId,
            paymentStatus: "success",
            transferId: { $ne: null, $exists: true }
        }).populate('bundleId', 'title price');

        console.log(`📊 Found ${purchases.length} purchases with transfers`);

        const transferStatuses = [];

        for (const purchase of purchases) {
            if (purchase.transferId) {
                try {
                    // 🔥 FIX: Use stripeAccount in options
                    const transfer = await stripe.transfers.retrieve(
                        purchase.transferId,
                        {
                            stripeAccount: user.stripeAccountId
                        }
                    );

                    transferStatuses.push({
                        purchaseId: purchase._id,
                        bundleTitle: purchase.bundleId?.title || "Unknown Bundle",
                        bundlePrice: purchase.bundleId?.price || 0,
                        amount: purchase.teacherAmount || 0,
                        transferId: purchase.transferId,
                        transferStatus: transfer.status || 'paid',
                        transferCreated: new Date(transfer.created * 1000),
                        arrivalDate: transfer.arrival_date
                            ? new Date(transfer.arrival_date * 1000)
                            : null,
                        payoutStatus: purchase.teacherPayoutStatus
                    });

                    console.log(`✅ Transfer ${purchase.transferId} fetched`);

                } catch (err) {
                    console.log(`❌ Error fetching transfer ${purchase.transferId}:`, err.message);

                    // 🔥 If transfer not found, still show it but with error status
                    transferStatuses.push({
                        purchaseId: purchase._id,
                        bundleTitle: purchase.bundleId?.title || "Unknown Bundle",
                        amount: purchase.teacherAmount || 0,
                        transferId: purchase.transferId,
                        transferStatus: 'unknown',
                        error: err.message,
                        transferCreated: purchase.createdAt,
                        arrivalDate: null,
                        note: 'Transfer exists but could not be retrieved from Stripe'
                    });
                }
            }
        }

        return res.json({
            error: false,
            data: transferStatuses
        });

    } catch (err) {
        console.log('❌ Error:', err.message);
        return res.status(500).json({
            error: true,
            message: err.message
        });
    }
};

// 🔥 Get Teacher Payouts - Fixed
const getTeacherPayouts = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const user = await User.findById(userId);

        if (!user.stripeAccountId) {
            return res.status(400).json({
                error: true,
                message: "No Stripe account found"
            });
        }

        // 🔥 Get payouts
        let payouts = [];
        try {
            const payoutData = await stripe.payouts.list(
                {
                    limit: 10,
                    status: 'paid'
                },
                { stripeAccount: user.stripeAccountId }
            );
            payouts = payoutData.data;
        } catch (err) {
            console.log('⚠️ Payouts fetch error:', err.message);
        }

        return res.json({
            error: false,
            data: payouts.map(p => ({
                id: p.id,
                amount: p.amount / 100,
                status: p.status,
                arrivalDate: p.arrival_date ? new Date(p.arrival_date * 1000) : null,
                bank: p.bank_account?.bank_name || "Unknown",
                last4: p.bank_account?.last4 || "****"
            }))
        });

    } catch (err) {
        console.log('❌ Error:', err.message);
        return res.status(500).json({
            error: true,
            message: err.message
        });
    }
};

// 🔥 Get Teacher Invoice - Fixed
const getTeacherInvoice = async (req, res) => {
    try {
        const userId = req.user.login_data._id;
        const { transferId } = req.params;

        console.log(`📄 Fetching invoice for transfer: ${transferId}`);

        if (!transferId) {
            return res.status(400).json({
                error: true,
                message: "Transfer ID is required"
            });
        }

        // 🔥 FIX: Get user first
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                error: true,
                message: "User not found"
            });
        }

        // 🔥 Find purchase by transferId
        const purchase = await Purchase.findOne({
            teacherId: userId,
            transferId: transferId
        }).populate('bundleId', 'title price description');

        if (!purchase) {
            return res.status(404).json({
                error: true,
                message: "Invoice not found"
            });
        }

        console.log(`✅ Purchase found: ${purchase._id}`);

        // 🔥 Get transfer details from Stripe
        let transfer;
        try {
            transfer = await stripe.transfers.retrieve(
                transferId,
                {
                    stripeAccount: user.stripeAccountId
                }
            );
            console.log(`✅ Transfer fetched: ${transfer.id}`);
        } catch (err) {
            console.log(`❌ Transfer fetch error:`, err.message);

            // 🔥 If transfer not found, generate invoice without Stripe data
            return res.json({
                error: false,
                data: {
                    invoiceNumber: `INV-${String(purchase._id).slice(-6).toUpperCase()}`,
                    date: purchase.createdAt,
                    bundle: {
                        title: purchase.bundleId?.title || 'Unknown Bundle',
                        price: purchase.bundleId?.price || 0,
                        description: purchase.bundleId?.description || ''
                    },
                    amount: purchase.amount,
                    teacherAmount: purchase.teacherAmount,
                    platformFee: purchase.platformAmount,
                    transferId: purchase.transferId,
                    transferStatus: purchase.teacherPayoutStatus || 'unknown',
                    created: purchase.createdAt,
                    arrivalDate: null,
                    bankDetails: {
                        bankName: 'N/A',
                        last4: 'N/A'
                    },
                    buyerDetails: {
                        name: purchase.buyerDetails?.name || 'N/A',
                        email: purchase.buyerDetails?.email || 'N/A'
                    },
                    note: `Transfer ${transferId} is being processed. Please check your Stripe dashboard for updates.`,
                    warning: 'Could not fetch real-time data from Stripe'
                }
            });
        }

        // 🔥 Generate full invoice with Stripe data
        const invoice = {
            invoiceNumber: `INV-${String(purchase._id).slice(-6).toUpperCase()}`,
            date: purchase.createdAt,
            bundle: {
                title: purchase.bundleId?.title || 'Unknown Bundle',
                price: purchase.bundleId?.price || 0,
                description: purchase.bundleId?.description || ''
            },
            amount: purchase.amount,
            teacherAmount: purchase.teacherAmount,
            platformFee: purchase.platformAmount,
            transferId: purchase.transferId,
            transferStatus: transfer.status || purchase.teacherPayoutStatus,
            created: new Date(transfer.created * 1000),
            arrivalDate: transfer.arrival_date
                ? new Date(transfer.arrival_date * 1000)
                : null,
            bankDetails: {
                bankName: transfer.destination_details?.bank_name || 'N/A',
                last4: transfer.destination_details?.last4 || 'N/A'
            },
            buyerDetails: {
                name: purchase.buyerDetails?.name || 'N/A',
                email: purchase.buyerDetails?.email || 'N/A'
            },
            note: `Banks can take up to 5 business days to process payouts. If you don't see the money by ${new Date(transfer.created * 1000 + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, please contact your bank.`
        };

        return res.json({
            error: false,
            data: invoice
        });

    } catch (err) {
        console.log('❌ Error:', err.message);
        return res.status(500).json({
            error: true,
            message: err.message,
            details: err.raw?.message || null
        });
    }
};


const getStripeDashboardLink = async (req, res) => {
    try {
        const userId = req.user.login_data._id;

        const user = await User.findById(userId);

        if (!user.stripeAccountId) {
            return res.status(400).json({
                error: true,
                message: "Stripe account not found"
            });
        }

        const account = await stripe.accounts.retrieve(user.stripeAccountId);

        if (!account.details_submitted) {
            const onboardingLink = await stripe.accountLinks.create({
                account: account.id,
                refresh_url: `${process.env.FRONTEND_URL}/reauth`,
                return_url: `${process.env.FRONTEND_URL}/my-account`,
                type: "account_onboarding"
            });

            return res.json({
                error: false,
                url: onboardingLink.url,
                type: "onboarding"
            });
        }

        const loginLink = await stripe.accounts.createLoginLink(
            user.stripeAccountId
        );

        return res.json({
            error: false,
            url: loginLink.url,
            type: "dashboard"
        });

    } catch (err) {
        console.log(err);

        return res.status(500).json({
            error: true,
            message: err.message
        });
    }
};


module.exports = {
    addToCart, removeFromCart, getCart, createCheckoutSessionforCart,
    createStripeAccount, createOnboardingLink, getPayoutStatus, getPaymentStatus, checkTeacherStripeStatus,
    getTransferStatus, getTeacherBalance, getTeacherPayouts, getTeacherInvoice, getStripeDashboardLink
}