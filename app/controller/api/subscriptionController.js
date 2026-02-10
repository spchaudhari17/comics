const Subscription = require("../../models/Subscription");
const User = require("../../models/User");
const PLANS = require("../../../utils/subscriptionPlans");
const stripe = require("../../../utils/stripe");
const SubscriptionHistory = require("../../models/SubscriptionHistory");
const Comic = require("../../models/Comic");

const createCheckoutSession = async (req, res) => {
  try {
    const userId = req.user.login_data._id;
    const { priceId, planType } = req.body;

    // 1️ Validate input
    if (!priceId || !planType) {
      return res.status(400).json({ message: "priceId and planType are required" });
    }

    // 2️⃣ Validate plan
    const planConfig =
      planType === "bundle"
        ? PLANS.bundle[priceId]
        : PLANS.dashboard[priceId];

    if (!planConfig) {
      return res.status(400).json({ message: "Invalid plan selected" });
    }

    // 3️⃣ Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 4️⃣ Reuse Stripe customer if exists
    let stripeCustomerId = user.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          userId: user._id.toString(),
        },
      });

      stripeCustomerId = customer.id;

      // save customer id in user table
      user.stripeCustomerId = stripeCustomerId;
      await user.save();
    }

    // 5️⃣ Create checkout session
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



const createSubscription = async (req, res) => {
  try {
    const userId = req.user.login_data._id;
    const { sessionId, planType } = req.body;

    // 1️⃣ Validate user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // 2️⃣ Retrieve Stripe session
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["subscription", "line_items"],
    });

    if (!session || session.payment_status !== "paid") {
      return res.status(400).json({ message: "Payment not completed" });
    }

    // 3️⃣ Extract priceId from Stripe
    const priceId = session.line_items.data[0].price.id;

    // 4️⃣ Get plan config
    const planConfig =
      planType === "bundle"
        ? PLANS.bundle[priceId]
        : PLANS.dashboard[priceId];

    if (!planConfig) {
      return res.status(400).json({ message: "Invalid plan selected" });
    }

    // 5️⃣ Deactivate old subscriptions
    await Subscription.updateMany(
      { userId, status: "active" },
      { status: "inactive" }
    );

    // 6️⃣ Create subscription in DB
    const subscription = await Subscription.create({
      userId,
      planType,
      priceId,

      stripeCustomerId: session.customer,
      stripeSubscriptionId: session.subscription.id,

      comicsPerWeek: planConfig.comicsPerWeek,
      studentsLimit: planConfig.studentsLimit,

      status: "active",
      startDate: new Date(session.created * 1000),
      endDate: new Date(
        new Date(session.created * 1000).setMonth(
          new Date(session.created * 1000).getMonth() + 1
        )
      ),
    });

    return res.status(201).json({
      message: "Subscription activated successfully",
      subscription,
    });

  } catch (error) {
    console.error("Create subscription error:", error);
    return res.status(500).json({ message: error.message });
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
      endDate: { $gte: now }
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

    const sub = await Subscription.findOne({ userId });
    if (!sub) {
      return res.json({ invoices: [] });
    }

    const invoices = await stripe.invoices.list({
      customer: sub.stripeCustomerId,
      limit: 10,
    });

    const formatted = invoices.data.map(inv => ({
      id: inv.id,
      amount: inv.amount_paid / 100,
      currency: inv.currency,
      status: inv.status,
      date: new Date(inv.created * 1000),
      pdf: inv.invoice_pdf,
    }));

    res.json({ invoices: formatted });
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch invoices" });
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


module.exports = {
  createCheckoutSession, createSubscription, getActiveSubscription, cancelSubscription, getInvoices, createBillingPortal,
  getSubscriptionHistory, getMySubscription
};
