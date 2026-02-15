const stripe = require("../../../utils/stripe");
const Subscription = require("../../models/Subscription");
const SubscriptionHistory = require("../../models/SubscriptionHistory");
const PLANS = require("../../../utils/subscriptionPlans");
const User = require("../../models/User");

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

/* =====================================================
   🔐 SAFE DATE HELPER
   (Invalid Date ko kabhi DB me jaane nahi deta)
===================================================== */
const safeDate = (unix) => {
  if (!unix || typeof unix !== "number") return null;
  const d = new Date(unix * 1000);
  return isNaN(d.getTime()) ? null : d;
};

const stripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  /* =====================================================
     1️⃣ VERIFY STRIPE SIGNATURE
  ===================================================== */
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error("❌ Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    /* =====================================================
       2️⃣ FIRST TIME PURCHASE (CHECKOUT SUCCESS)
       👉 subscription + history CREATE
    ===================================================== */
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (!session.subscription) {
        return res.json({ received: true });
      }

      const userId = session.metadata.userId;
      const planType = session.metadata.planType;

      // ✅ Always sync customer ID to user
      await User.findByIdAndUpdate(userId, {
        stripeCustomerId: session.customer,
      });

      // 🔥 Stripe rule: fetch line items separately
      const lineItems = await stripe.checkout.sessions.listLineItems(
        session.id,
        { limit: 1 }
      );

      const priceId = lineItems?.data?.[0]?.price?.id;
      if (!priceId) return res.json({ received: true });

      const planConfig =
        planType === "bundle"
          ? PLANS.bundle[priceId]
          : PLANS.dashboard[priceId];

      if (!planConfig) return res.json({ received: true });

      // 🛑 Idempotency check (very important)
      const exists = await Subscription.findOne({
        stripeSubscriptionId: session.subscription,
      });
      if (exists) return res.json({ received: true });

      // =====================================================
      // 🔥 OPTION 1 LOGIC — REPLACE OLD SUBSCRIPTION
      // =====================================================

      const oldSub = await Subscription.findOne({
        userId,
        status: { $in: ["active", "to_cancel"] },
      });

      if (oldSub && oldSub.stripeSubscriptionId !== session.subscription) {
        try {
          // ✅ Immediately cancel in Stripe
          await stripe.subscriptions.cancel(oldSub.stripeSubscriptionId);


          // ✅ Update DB
          await Subscription.findByIdAndUpdate(oldSub._id, {
            status: "cancelled",
            endDate: new Date(),
          });

          await SubscriptionHistory.create({
            userId,
            planType: oldSub.planType,
            priceId: oldSub.priceId,
            stripeSubscriptionId: oldSub.stripeSubscriptionId,
            status: "replaced_by_new_plan",
            startDate: oldSub.startDate,
            endDate: new Date(),
          });

        } catch (err) {
          console.error("Failed to replace old subscription:", err.message);
        }
      }

      // =====================================================
      // ✅ CREATE NEW SUBSCRIPTION IN DB
      // =====================================================


      const stripeSub = await stripe.subscriptions.retrieve(
        session.subscription,
        { expand: ["items"] }
      );

      const startDate = safeDate(
        stripeSub.items.data[0]?.current_period_start
      );

      const endDate = safeDate(
        stripeSub.items.data[0]?.current_period_end
      );



      const newSub = await Subscription.create({
        userId,
        planType,
        priceId,
        stripeCustomerId: session.customer,
        stripeSubscriptionId: session.subscription,
        comicsPerWeek: planConfig.comicsPerWeek,
        studentsLimit: planConfig.studentsLimit,
        status: "active",
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      });

      await SubscriptionHistory.create({
        userId,
        planType,
        priceId,
        stripeSubscriptionId: session.subscription,
        amount: session.amount_total / 100,
        currency: session.currency,
        status: "created",
        ...(newSub.startDate && { startDate: newSub.startDate }),
        ...(newSub.endDate && { endDate: newSub.endDate }),
      });
    }


    /* =====================================================
       3️⃣ MONTHLY RENEWAL SUCCESS
    ===================================================== */
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;

      if (invoice.billing_reason === "subscription_cycle") {
        const startDate = safeDate(invoice.period_start);
        const endDate = safeDate(invoice.period_end);

        const sub = await Subscription.findOneAndUpdate(
          { stripeSubscriptionId: invoice.subscription },
          {
            status: "active",
            ...(endDate && { endDate }),
          },
          { new: true }
        );

        if (sub) {
          await SubscriptionHistory.create({
            userId: sub.userId,
            planType: sub.planType,
            priceId: sub.priceId,
            stripeSubscriptionId: invoice.subscription,
            stripeInvoiceId: invoice.id,
            amount: invoice.amount_paid / 100,
            currency: invoice.currency,
            status: "renewed",
            ...(startDate && { startDate }),
            ...(endDate && { endDate }),
          });
        }
      }
    }

    /* =====================================================
       4️⃣ PAYMENT FAILED
    ===================================================== */
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;

      const startDate = safeDate(invoice.period_start);
      const endDate = safeDate(invoice.period_end);

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
          ...(startDate && { startDate }),
          ...(endDate && { endDate }),
        });
      }
    }

    /* =====================================================
       5️⃣ USER REQUESTED CANCEL (AT PERIOD END)
    ===================================================== */
    if (
      event.type === "customer.subscription.updated" &&
      event.data.object.cancel_at_period_end === true
    ) {
      const stripeSub = event.data.object;
      const endDate = safeDate(stripeSub.current_period_end);

      const sub = await Subscription.findOneAndUpdate(
        { stripeSubscriptionId: stripeSub.id },
        {
          status: "to_cancel",
          ...(endDate && { endDate }),
        },
        { new: true }
      );

      if (sub) {
        await SubscriptionHistory.create({
          userId: sub.userId,
          planType: sub.planType,
          priceId: sub.priceId,
          stripeSubscriptionId: stripeSub.id,
          status: "cancel_requested",
          startDate: sub.startDate,
          ...(endDate && { endDate }),
        });
      }
    }

    /* =====================================================
       6️⃣ SUBSCRIPTION FINALLY ENDED
    ===================================================== */
    if (event.type === "customer.subscription.deleted") {
      const stripeSub = event.data.object;

      const existingSub = await Subscription.findOne({
        stripeSubscriptionId: stripeSub.id,
      });

      // 🔥 VERY IMPORTANT GUARD
      if (!existingSub || existingSub.status === "cancelled") {
        return res.json({ received: true });
      }

      const endDate = safeDate(stripeSub.current_period_end) || new Date();

      await Subscription.findOneAndUpdate(
        { stripeSubscriptionId: stripeSub.id },
        { status: "cancelled", endDate }
      );

      await SubscriptionHistory.create({
        userId: existingSub.userId,
        planType: existingSub.planType,
        priceId: existingSub.priceId,
        stripeSubscriptionId: stripeSub.id,
        status: "cancelled",
        startDate: existingSub.startDate,
        endDate,
      });
    }


    return res.json({ received: true });

  } catch (err) {
    console.error("❌ Webhook handling error:", err);
    return res.status(500).json({ message: "Webhook handler failed" });
  }
};

module.exports = { stripeWebhook };
