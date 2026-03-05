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

    const subscription = await Subscription.findOne({
      userId,
      status: { $in: ["active", "to_cancel"] },
    }).sort({ createdAt: -1 });

    if (!subscription) {
      return res.status(200).json({
        hasSubscription: false,
        status: "none",
        comicsPerWeek: 0,
        usedThisWeek: 0,
        comicsLeft: 0,
        studentsLimit: 0,
      });
    }

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const usedThisWeek = await Comic.countDocuments({
      user_id: userId,
      createdAt: { $gte: oneWeekAgo },
      pdfUrl: { $exists: true, $ne: null },
    });

    const comicsPerWeek = subscription.comicsPerWeek || 0;
    const comicsLeft = Math.max(comicsPerWeek - usedThisWeek, 0);

    return res.status(200).json({
      hasSubscription: true,
      subscriptionId: subscription._id,
      planType: subscription.planType,
      priceId: subscription.priceId,
      status: subscription.status,
      comicsPerWeek,
      usedThisWeek,
      comicsLeft,
      studentsLimit: subscription.studentsLimit,
      startDate: subscription.startDate,
      endDate: subscription.endDate,
      canCancel: subscription.status === "active",

      // 🔥 Pending Info (Important)
      pendingPriceId: subscription.pendingPriceId,
      pendingPlanType: subscription.pendingPlanType,
      pendingApplyDate: subscription.pendingApplyDate,
      hasPendingChange: !!subscription.pendingPriceId,
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

    await SubscriptionHistory.create({
      userId: sub.userId,
      planType: sub.planType,
      priceId: sub.priceId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      status: "cancel_requested",
      startDate: sub.startDate,
      endDate: sub.endDate,
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
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const history = await SubscriptionHistory.find({ userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("-__v");

    const total = await SubscriptionHistory.countDocuments({ userId });

    return res.json({
      total,
      page,
      totalPages: Math.ceil(total / limit),
      history
    });

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
    if (!sub) {
      return res.status(404).json({ message: "No active subscription found" });
    }

    if (sub.priceId === priceId) {
      return res.status(400).json({ message: "Already on this plan" });
    }

    const stripeSub = await stripe.subscriptions.retrieve(
      sub.stripeSubscriptionId,
      { expand: ["items"] }
    );

    const itemId = stripeSub.items.data[0].id;

    // 1️⃣ Update subscription with proration
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "create_prorations",
    });

    // 2️⃣ Create invoice immediately
    const invoice = await stripe.invoices.create({
      customer: stripeSub.customer,
      subscription: sub.stripeSubscriptionId,
    });

    // 3️⃣ Finalize invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);

    // 4️⃣ Attempt payment immediately
    const paidInvoice = await stripe.invoices.pay(finalizedInvoice.id);

    if (paidInvoice.status !== "paid") {
      return res.status(400).json({
        message: "Payment failed. Upgrade not completed.",
      });
    }

    // 5️⃣ Only after successful payment → update DB
    let planConfig = null;
    let planType = null;

    if (PLANS.bundle[priceId]) {
      planType = "bundle";
      planConfig = PLANS.bundle[priceId];
    } else if (PLANS.dashboard[priceId]) {
      planType = "dashboard";
      planConfig = PLANS.dashboard[priceId];
    }

    sub.planType = planType;
    sub.priceId = priceId;
    sub.comicsPerWeek = planConfig.comicsPerWeek;
    sub.studentsLimit = planConfig.studentsLimit;

    sub.pendingPlanType = null;
    sub.pendingPriceId = null;
    sub.pendingComicsPerWeek = null;
    sub.pendingStudentsLimit = null;
    sub.pendingApplyDate = null;

    await sub.save();

    await SubscriptionHistory.create({
      userId: sub.userId,
      planType,
      priceId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      stripeInvoiceId: paidInvoice.id,
      amount: paidInvoice.amount_paid / 100,
      currency: paidInvoice.currency,
      status: "created",
      startDate: sub.startDate,
      endDate: sub.endDate,
    });

    return res.json({
      message: "Plan upgraded and charged immediately",
    });

  } catch (err) {
    console.error("Immediate upgrade error:", err);
    return res.status(500).json({
      message: err.message || "Immediate upgrade failed",
    });
  }
};


const upgradeSubscriptionScheduled = async (req, res) => {
  try {
    const userId = req.user.login_data._id;
    const { priceId } = req.body;

    const sub = await Subscription.findOne({
      userId,
      status: "active",
    });

    if (!sub) {
      return res.status(404).json({
        message: "No active subscription found",
      });
    }

    if (sub.priceId === priceId) {
      return res.status(400).json({
        message: "Already on this plan",
      });
    }

    const stripeSub = await stripe.subscriptions.retrieve(
      sub.stripeSubscriptionId,
      { expand: ["items"] }
    );

    const itemId = stripeSub.items.data[0].id;

    // 🔥 Stripe update (NO immediate charge)
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "none",
    });

    // 🔥 Set pending state in DB
    let planConfig = null;
    let planType = null;

    if (PLANS.bundle[priceId]) {
      planType = "bundle";
      planConfig = PLANS.bundle[priceId];
    } else if (PLANS.dashboard[priceId]) {
      planType = "dashboard";
      planConfig = PLANS.dashboard[priceId];
    }

    sub.pendingPlanType = planType;
    sub.pendingPriceId = priceId;
    sub.pendingComicsPerWeek = planConfig.comicsPerWeek;
    sub.pendingStudentsLimit = planConfig.studentsLimit;
    sub.pendingApplyDate = sub.endDate;

    await sub.save();
    await SubscriptionHistory.create({
      userId: sub.userId,
      planType: planType,
      priceId: priceId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      status: "replaced_by_new_plan",
      startDate: sub.startDate,
      endDate: sub.pendingApplyDate,
    });

    return res.json({
      message: "Plan will change at next billing cycle",
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({
      message: "Scheduled upgrade failed",
    });
  }
};

const downgradeSubscription = async (req, res) => {
  try {
    const userId = req.user.login_data._id;
    const { priceId } = req.body;

    const sub = await Subscription.findOne({ userId, status: "active" });
    if (!sub) return res.status(404).json({ message: "No active subscription" });

    const stripeSub = await stripe.subscriptions.retrieve(
      sub.stripeSubscriptionId,
      { expand: ["items"] }
    );

    await stripe.subscriptionSchedules.create({
      from_subscription: stripeSub.id,
      phases: [
        {
          items: [{
            price: stripeSub.items.data[0].price.id
          }],
          end_date: stripeSub.current_period_end,
        },
        {
          items: [{
            price: priceId
          }]
        }
      ]
    });

    return res.json({ message: "Downgrade scheduled for next billing cycle" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Downgrade failed" });
  }
};

const getScheduleStatus = async (req, res) => {
  try {
    const userId = req.user.login_data._id;

    // 1️⃣ Find active subscription
    const sub = await Subscription.findOne({
      userId,
      status: { $in: ["active", "to_cancel"] },
    });

    if (!sub) {
      return res.status(200).json({
        hasSchedule: false,
        message: "No active subscription found",
      });
    }

    // 2️⃣ Get Stripe Subscription
    const stripeSub = await stripe.subscriptions.retrieve(
      sub.stripeSubscriptionId,
      { expand: ["items"] }
    );

    const currentPrice =
      stripeSub.items?.data?.[0]?.price?.id || null;

    const currentPeriodEnd = stripeSub.current_period_end
      ? new Date(stripeSub.current_period_end * 1000)
      : null;

    // 3️⃣ If no schedule attached
    if (!stripeSub.schedule) {
      return res.status(200).json({
        hasSchedule: false,
        currentPrice,
        currentPeriodEnd,
      });
    }

    // 4️⃣ Retrieve Schedule
    const schedule = await stripe.subscriptionSchedules.retrieve(
      stripeSub.schedule,
      { expand: ["phases.items.price"] }
    );

    const phases = schedule.phases || [];

    let nextPrice = null;
    let applyDate = currentPeriodEnd;

    // 5️⃣ Extract future phase safely
    if (phases.length > 1) {
      const futurePhase = phases[1];

      if (
        futurePhase?.items &&
        futurePhase.items.length > 0
      ) {
        nextPrice =
          futurePhase.items[0].price?.id || null;
      }
    }

    return res.status(200).json({
      hasSchedule: true,
      scheduleId: stripeSub.schedule,
      currentPrice,
      nextPrice,
      applyDate,
      currentPeriodEnd,
    });

  } catch (err) {
    console.error("Schedule status error:", err);
    return res.status(500).json({
      message: "Failed to retrieve schedule status",
    });
  }
};


const getSavedPaymentMethod = async (req, res) => {
  try {
    const userId = req.user.login_data._id;

    const user = await User.findById(userId);
    if (!user || !user.stripeCustomerId) {
      return res.status(404).json({
        hasCard: false,
        message: "Stripe customer not found"
      });
    }

    // 1️⃣ Try default payment method
    const customer = await stripe.customers.retrieve(
      user.stripeCustomerId,
      { expand: ["invoice_settings.default_payment_method"] }
    );

    let paymentMethod = customer.invoice_settings.default_payment_method;

    // 2️⃣ If not found, fetch from paymentMethods list
    if (!paymentMethod) {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: "card",
        limit: 1,
      });

      if (paymentMethods.data.length > 0) {
        paymentMethod = paymentMethods.data[0];
      }
    }

    if (!paymentMethod || !paymentMethod.card) {
      return res.json({
        hasCard: false,
        message: "No card found"
      });
    }

    const card = paymentMethod.card;

    return res.json({
      hasCard: true,
      brand: card.brand,
      last4: card.last4,
      expMonth: card.exp_month,
      expYear: card.exp_year,
      country: card.country,
    });

  } catch (err) {
    console.error("Get payment method error:", err);
    return res.status(500).json({
      message: "Failed to fetch payment method"
    });
  }
};


const createUpdateCardSession = async (req, res) => {
  try {
    const userId = req.user.login_data._id;

    const user = await User.findById(userId);
    if (!user || !user.stripeCustomerId) {
      return res.status(404).json({
        message: "Stripe customer not found"
      });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard`,
    });

    return res.json({
      url: session.url
    });

  } catch (err) {
    console.error("Update card session error:", err);
    return res.status(500).json({
      message: "Failed to create update card session"
    });
  }
};

module.exports = {
  createCheckoutSession, getActiveSubscription, cancelSubscription, getInvoices, createBillingPortal,
  getSubscriptionHistory, getMySubscription, upgradeSubscriptionImmediate, upgradeSubscriptionScheduled, downgradeSubscription,
  getScheduleStatus, getSavedPaymentMethod, createUpdateCardSession
};
