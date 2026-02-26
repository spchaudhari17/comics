const Subscription = require("../../models/Subscription");
const User = require("../../models/User");
const PLANS = require("../../../utils/subscriptionPlans");
const stripe = require("../../../utils/stripe");
const SubscriptionHistory = require("../../models/SubscriptionHistory");
const Comic = require("../../models/Comic");

// const createCheckoutSession = async (req, res) => {
//   try {
//     const userId = req.user.login_data._id;
//     const { priceId, planType } = req.body;

//     // 1️ Validate input
//     if (!priceId || !planType) {
//       return res.status(400).json({ message: "priceId and planType are required" });
//     }

//     // 2️⃣ Validate plan
//     const planConfig =
//       planType === "bundle"
//         ? PLANS.bundle[priceId]
//         : PLANS.dashboard[priceId];

//     if (!planConfig) {
//       return res.status(400).json({ message: "Invalid plan selected" });
//     }

//     // 3️⃣ Get user
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     // 4️⃣ Reuse Stripe customer if exists
//     let stripeCustomerId = user.stripeCustomerId;

//     if (!stripeCustomerId) {
//       const customer = await stripe.customers.create({
//         email: user.email,
//         metadata: {
//           userId: user._id.toString(),
//         },
//       });

//       stripeCustomerId = customer.id;

//       // save customer id in user table
//       user.stripeCustomerId = stripeCustomerId;
//       await user.save();
//     }

//     // 5️⃣ Create checkout session
//     const session = await stripe.checkout.sessions.create({
//       mode: "subscription",
//       customer: stripeCustomerId,
//       payment_method_types: ["card"],
//       line_items: [
//         {
//           price: priceId,
//           quantity: 1,
//         },
//       ],
//       metadata: {
//         userId: user._id.toString(),
//         planType,
//       },
//       success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
//       cancel_url: `${process.env.FRONTEND_URL}/cancel`,
//     });

//     return res.status(200).json({
//       url: session.url,
//     });

//   } catch (error) {
//     console.error("Create checkout session error:", error);
//     return res.status(500).json({
//       message: "Unable to create checkout session",
//     });
//   }
// };

const createCheckoutSession = async (req, res) => {
  try {
    const userId = req.user.login_data._id;
    const { priceId, planType } = req.body;

    // 1️⃣ Validate input
    if (!priceId || !planType) {
      return res.status(400).json({
        message: "priceId and planType are required"
      });
    }

    // 2️⃣ Validate plan
    const planConfig =
      planType === "bundle"
        ? PLANS.bundle[priceId]
        : PLANS.dashboard[priceId];

    if (!planConfig) {
      return res.status(400).json({
        message: "Invalid plan selected"
      });
    }

    // 3️⃣ Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        message: "User not found"
      });
    }

    // 🔥 4️⃣ IMPORTANT — Prevent multiple subscriptions
    const existing = await Subscription.findOne({
      userId,
      status: { $in: ["active", "to_cancel"] }
    });

    if (existing) {
      return res.status(400).json({
        message: "You already have a subscription. Use upgrade or downgrade option."
      });
    }

    // 5️⃣ Reuse Stripe customer if exists
    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user._id.toString(),
        },
      });

      stripeCustomerId = customer.id;

      user.stripeCustomerId = stripeCustomerId;
      await user.save();
    }

    // 6️⃣ Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId: user._id.toString(),
        planType,
      },
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/cancel`,
    });

    return res.status(200).json({
      url: session.url,
    });

  } catch (error) {
    console.error("Create checkout session error:", error);
    return res.status(500).json({
      message: "Unable to create checkout session",
    });
  }
};



const getActiveSubscription = async (req, res) => {
  try {
    const userId = req.user.login_data._id;

    const subscription = await Subscription.findOne({
      userId,
      status: "active",
      endDate: { $gte: new Date() },
    }).select("-__v");

    if (!subscription) {
      return res.status(404).json({
        message: "No active subscription found",
        subscription: null,
      });
    }

    return res.status(200).json({
      message: "Active subscription fetched successfully",
      subscription,
    });

  } catch (error) {
    console.error("Get active subscription error:", error);
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};


const getMySubscription = async (req, res) => {
  try {
    const userId = req.user.login_data._id;
    const now = new Date();

    // 1️⃣ FIND LATEST VALID SUBSCRIPTION
    const subscription = await Subscription.findOne({
      userId,
      status: { $in: ["active", "to_cancel"] },
      // endDate: { $gte: now }
    }).sort({ createdAt: -1 });

    // ❌ NO SUBSCRIPTION
    if (!subscription) {
      return res.status(200).json({
        hasSubscription: false,
        status: "none",
        comicsPerWeek: 0,
        usedThisWeek: 0,
        comicsLeft: 0,
        studentsLimit: 0
      });
    }

    // 2️⃣ CALCULATE WEEKLY USAGE
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const usedThisWeek = await Comic.countDocuments({
      user_id: userId,
      createdAt: { $gte: oneWeekAgo },
      pdfUrl: { $exists: true, $ne: null }
    });

    const comicsPerWeek = subscription.comicsPerWeek || 0;

    const comicsLeft = Math.max(
      comicsPerWeek - usedThisWeek,
      0
    );

    // 3️⃣ RESPONSE
    return res.status(200).json({
      hasSubscription: true,
      subscriptionId: subscription._id,
      planType: subscription.planType,
      priceId: subscription.priceId,
      status: subscription.status, // active | to_cancel
      comicsPerWeek,
      usedThisWeek,
      comicsLeft,
      studentsLimit: subscription.studentsLimit,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      canCancel: subscription.status === "active"
    });

  } catch (error) {
    console.error("❌ getMySubscription error:", error);
    return res.status(500).json({
      message: "Failed to fetch subscription details"
    });
  }
};



const cancelSubscription = async (req, res) => {
  try {
    const userId = req.user.login_data._id;

    const sub = await Subscription.findOne({
      userId,
      status: "active",
    });

    if (!sub) {
      return res.status(404).json({ message: "No active subscription found" });
    }

    // ❗ Cancel at period end (recommended)
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    return res.json({
      message: "Subscription will be cancelled at the end of billing cycle",
    });
  } catch (err) {
    console.error("Cancel subscription error:", err);
    res.status(500).json({ message: "Unable to cancel subscription" });
  }
};


const getInvoices = async (req, res) => {
  try {
    const userId = req.user.login_data._id;

    const user = await User.findById(userId);

    // 🔥 Safety fallback (temporary until all users migrated)
    const fallbackSub = await Subscription.findOne({ userId });

    const customerId =
      user?.stripeCustomerId || fallbackSub?.stripeCustomerId;

    if (!customerId) {
      return res.json({ invoices: [] });
    }

    const invoices = await stripe.invoices.list({
      customer: customerId,
      limit: 20,
    });

    const formatted = invoices.data.map(inv => ({
      id: inv.id,
      amount: inv.amount_paid / 100,
      currency: inv.currency,
      billingReason: inv.billing_reason,
      status: inv.status,
      date: new Date(inv.created * 1000),
      pdf: inv.invoice_pdf,
    }));

    return res.json({ invoices: formatted });

  } catch (err) {
    console.error("Invoice fetch error:", err);
    return res.status(500).json({ message: "Failed to fetch invoices" });
  }
};



const createBillingPortal = async (req, res) => {
  const userId = req.user.login_data._id;

  const sub = await Subscription.findOne({ userId });
  if (!sub) {
    return res.status(404).json({ message: "No subscription found" });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${process.env.FRONTEND_URL}/dashboard`,
  });

  res.json({ url: session.url });
};


const getSubscriptionHistory = async (req, res) => {
  try {
    const userId = req.user.login_data._id;

    const history = await SubscriptionHistory.find({ userId })
      .sort({ createdAt: -1 })
      .select("-__v");

    return res.json({ history });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch subscription history" });
  }
};

const getPlanPrice = (priceId) => {
  const allPlans = { ...PLANS.bundle, ...PLANS.dashboard };
  return allPlans[priceId]?.amount || 0;
};


const upgradeSubscriptionImmediate = async (req, res) => {
  try {
    const userId = req.user.login_data._id;
    const { priceId } = req.body;

    const sub = await Subscription.findOne({ userId, status: "active" });
    if (!sub) return res.status(404).json({ message: "No active subscription found" });

    if (sub.priceId === priceId)
      return res.status(400).json({ message: "You are already on this plan" });

    const stripeSub = await stripe.subscriptions.retrieve(
      sub.stripeSubscriptionId,
      { expand: ["items"] }
    );

    const itemId = stripeSub.items.data[0].id;

    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "create_prorations",
    });

    return res.json({ message: "Plan upgraded immediately (prorated)" });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Upgrade failed" });
  }
};


const upgradeSubscriptionScheduled = async (req, res) => {
  try {
    const userId = req.user.login_data._id;
    const { priceId } = req.body;

    const sub = await Subscription.findOne({ userId, status: "active" });
    if (!sub) return res.status(404).json({ message: "No active subscription found" });

    if (sub.priceId === priceId)
      return res.status(400).json({ message: "You are already on this plan" });

    const stripeSub = await stripe.subscriptions.retrieve(
      sub.stripeSubscriptionId,
      { expand: ["items"] }
    );

    const itemId = stripeSub.items.data[0].id;

    // ⭐ THIS IS THE FIX
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "none",   // 👉 next billing se apply
    });

    return res.json({
      message: "Plan change scheduled for next billing cycle"
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Scheduled upgrade failed" });
  }
};




const downgradeSubscription = async (req, res) => {
  try {
    const userId = req.user.login_data._id;
    const { priceId } = req.body;

    const sub = await Subscription.findOne({ userId, status: "active" });
    if (!sub) return res.status(404).json({ message: "No active subscription found" });

    const stripeSub = await stripe.subscriptions.retrieve(
      sub.stripeSubscriptionId,
      { expand: ["items"] }
    );

    const itemId = stripeSub.items.data[0].id;

    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "none",   // next billing cycle
    });

    return res.json({
      message: "Downgrade scheduled for next billing cycle"
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Downgrade failed" });
  }
};





module.exports = {
  createCheckoutSession, getActiveSubscription, cancelSubscription, getInvoices, createBillingPortal,
  getSubscriptionHistory, getMySubscription, upgradeSubscriptionImmediate, upgradeSubscriptionScheduled, downgradeSubscription,
};
