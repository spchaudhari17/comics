const stripe = require("../../../utils/stripe");
const Subscription = require("../../models/Subscription");
const SubscriptionHistory = require("../../models/SubscriptionHistory");
const PLANS = require("../../../utils/subscriptionPlans");
const User = require("../../models/User");

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const safeDate = (unix) => {
  if (!unix || typeof unix !== "number") return null;
  const d = new Date(unix * 1000);
  return isNaN(d.getTime()) ? null : d;
};

const stripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("❌ Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    console.log("🔥 EVENT:", event.type);

    /* =========================================
       1️⃣ CHECKOUT COMPLETED
    ========================================== */
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (session.metadata?.userId) {
        await User.findByIdAndUpdate(session.metadata.userId, {
          stripeCustomerId: session.customer,
        });
      }

      return res.json({ received: true });
    }

    /* =========================================
       2️⃣ SUBSCRIPTION CREATED (FIRST TIME)
    ========================================== */
    if (event.type === "customer.subscription.created") {
      const stripeSub = await stripe.subscriptions.retrieve(
        event.data.object.id,
        { expand: ["items"] }
      );

      const priceId = stripeSub.items.data[0]?.price?.id;
      if (!priceId) return res.json({ received: true });

      const user = await User.findOne({
        stripeCustomerId: stripeSub.customer,
      });

      if (!user) return res.json({ received: true });

      let planType = null;
      let planConfig = null;

      if (PLANS.bundle[priceId]) {
        planType = "bundle";
        planConfig = PLANS.bundle[priceId];
      } else if (PLANS.dashboard[priceId]) {
        planType = "dashboard";
        planConfig = PLANS.dashboard[priceId];
      }

      if (!planConfig) return res.json({ received: true });

      await Subscription.updateOne(
        { stripeSubscriptionId: stripeSub.id },
        {
          userId: user._id,
          stripeCustomerId: stripeSub.customer,
          stripeSubscriptionId: stripeSub.id,
          planType,
          priceId,
          comicsPerWeek: planConfig.comicsPerWeek,
          studentsLimit: planConfig.studentsLimit,
          status: "active",
          startDate: safeDate(stripeSub.items.data[0]?.current_period_start),
          endDate: safeDate(stripeSub.items.data[0]?.current_period_end),
          pendingPlanType: null,
          pendingPriceId: null,
          pendingComicsPerWeek: null,
          pendingStudentsLimit: null,
          pendingApplyDate: null,
        },
        { upsert: true }
      );

      const existingHistory = await SubscriptionHistory.findOne({
        stripeSubscriptionId: stripeSub.id,
        status: "created",
      });

      if (!existingHistory) {
        const latestInvoice = stripeSub.latest_invoice
          ? await stripe.invoices.retrieve(stripeSub.latest_invoice)
          : null;

        await SubscriptionHistory.create({
          userId: user._id,
          planType,
          priceId,
          stripeSubscriptionId: stripeSub.id,
          stripeInvoiceId: latestInvoice?.id || null,
          amount: latestInvoice ? latestInvoice.amount_paid / 100 : 0,
          currency: latestInvoice?.currency || "usd",
          status: "created",
          startDate: safeDate(stripeSub.items.data[0]?.current_period_start),
          endDate: safeDate(stripeSub.items.data[0]?.current_period_end),
        });
      }




      console.log("✅ Subscription created safely");
      return res.json({ received: true });
    }

    /* =========================================
       3️⃣ PAYMENT SUCCEEDED (RENEWAL)
    ========================================== */
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;

      const sub = await Subscription.findOne({
        stripeSubscriptionId: invoice.subscription,
      });

      if (!sub) return res.json({ received: true });

      sub.status = "active";
      sub.startDate = safeDate(invoice.period_start) || sub.startDate;
      sub.endDate = safeDate(invoice.period_end) || sub.endDate;
      sub.comicsUsedThisWeek = 0;

      // 🔥 Activate Pending Plan
      if (sub.pendingPriceId) {
        sub.planType = sub.pendingPlanType;
        sub.priceId = sub.pendingPriceId;
        sub.comicsPerWeek = sub.pendingComicsPerWeek;
        sub.studentsLimit = sub.pendingStudentsLimit;

        sub.pendingPlanType = null;
        sub.pendingPriceId = null;
        sub.pendingComicsPerWeek = null;
        sub.pendingStudentsLimit = null;
        sub.pendingApplyDate = null;

        console.log("🚀 Scheduled plan activated on renewal");
      }

      await sub.save();

      const exists = await SubscriptionHistory.findOne({
        stripeInvoiceId: invoice.id,
      });

      if (!exists) {
        await SubscriptionHistory.create({
          userId: sub.userId,
          planType: sub.planType,
          priceId: sub.priceId,
          stripeSubscriptionId: invoice.subscription,
          stripeInvoiceId: invoice.id,
          amount: invoice.amount_paid / 100,
          currency: invoice.currency,
          status: "renewed",
          startDate: sub.startDate,
          endDate: sub.endDate,
        });
      }

      return res.json({ received: true });
    }

    /* =========================================
       4️⃣ PAYMENT FAILED
    ========================================== */
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;

      const sub = await Subscription.findOneAndUpdate(
        { stripeSubscriptionId: invoice.subscription },
        { status: "inactive" },
        { new: true }
      );

      if (sub) {
        await SubscriptionHistory.create({
          userId: sub.userId,
          planType: sub.planType,
          priceId: sub.priceId,
          stripeSubscriptionId: invoice.subscription,
          stripeInvoiceId: invoice.id,
          amount: invoice.amount_due / 100,
          currency: invoice.currency,
          status: "payment_failed",
        });
      }

      return res.json({ received: true });
    }

    /* =========================================
       5️⃣ CANCEL AT PERIOD END
    ========================================== */
    if (event.type === "customer.subscription.updated") {
      const stripeSub = event.data.object;

      const sub = await Subscription.findOne({
        stripeSubscriptionId: stripeSub.id,
      });

      if (!sub) return res.json({ received: true });

      sub.status = stripeSub.cancel_at_period_end
        ? "to_cancel"
        : "active";

      sub.endDate =
        safeDate(stripeSub.current_period_end) || sub.endDate;

      await sub.save();

      return res.json({ received: true });
    }

    /* =========================================
       6️⃣ SUBSCRIPTION DELETED
    ========================================== */
    if (event.type === "customer.subscription.deleted") {
      const stripeSub = event.data.object;

      const sub = await Subscription.findOne({
        stripeSubscriptionId: stripeSub.id,
      });

      if (!sub || sub.status === "cancelled")
        return res.json({ received: true });

      sub.status = "cancelled";
      sub.endDate = safeDate(stripeSub.current_period_end) || new Date();
      await sub.save();

      await SubscriptionHistory.create({
        userId: sub.userId,
        planType: sub.planType,
        priceId: sub.priceId,
        stripeSubscriptionId: stripeSub.id,
        status: "cancelled",
        startDate: sub.startDate,
        endDate: sub.endDate,
      });

      return res.json({ received: true });
    }

    return res.json({ received: true });

  } catch (err) {
    console.error("❌ Webhook error:", err);
    return res.status(500).json({ message: "Webhook failed" });
  }
};

module.exports = { stripeWebhook };