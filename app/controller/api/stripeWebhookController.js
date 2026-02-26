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
    console.log("🔥 EVENT TYPE:", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      if (!session.subscription) {
        return res.json({ received: true });
      }

      await User.findByIdAndUpdate(session.metadata.userId, {
        stripeCustomerId: session.customer,
      });

      return res.json({ received: true });
    }

    /* =====================================================
       3️⃣ MONTHLY RENEWAL SUCCESS
    ===================================================== */


    if (event.type === "invoice.payment_succeeded") {

      console.log("🔥 invoice.payment_succeeded received");

      const invoice = event.data.object;

      const subscriptionId =
        invoice.subscription ||
        invoice.parent?.subscription_details?.subscription ||
        invoice.lines?.data?.[0]?.subscription;

      if (!subscriptionId) {
        console.log("❌ No subscription ID found in invoice");
        return res.json({ received: true });
      }

      const sub = await Subscription.findOne({
        stripeSubscriptionId: subscriptionId,
      });

      if (!sub) {
        console.log("❌ Subscription not found in DB. Skipping renewal.");
        return res.json({ received: true });
      }

      sub.status = "active";
      await sub.save();

      await SubscriptionHistory.create({
        userId: sub.userId,
        planType: sub.planType,
        priceId: sub.priceId,
        stripeSubscriptionId: subscriptionId,
        stripeInvoiceId: invoice.id,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        status: "renewed",
      });

      console.log("✅ Renewal handled safely");

      return res.json({ received: true });
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

    if (event.type === "customer.subscription.updated") {

      const rawSub = event.data.object;



      // 🔥 Always retrieve latest full subscription state
      const stripeSub = await stripe.subscriptions.retrieve(rawSub.id);

      const sub = await Subscription.findOne({
        stripeSubscriptionId: stripeSub.id,
      });

      if (!sub) return res.json({ received: true });

      const priceId = stripeSub.items.data[0]?.price?.id;

      let planType = null;
      let planConfig = null;

      if (PLANS.bundle[priceId]) {
        planType = "bundle";
        planConfig = PLANS.bundle[priceId];
      } else if (PLANS.dashboard[priceId]) {
        planType = "dashboard";
        planConfig = PLANS.dashboard[priceId];
      }

      if (planConfig) {
        sub.planType = planType;
        sub.priceId = priceId;
        sub.comicsPerWeek = planConfig.comicsPerWeek;
        sub.studentsLimit = planConfig.studentsLimit;
      }

      // Cancel state
      sub.status = stripeSub.cancel_at_period_end ? "to_cancel" : "active";

      // 🔥 SAFE DATE UPDATE (don't overwrite with null)
      const startDate = safeDate(
        stripeSub.items?.data?.[0]?.current_period_start
      );

      const endDate = safeDate(
        stripeSub.items?.data?.[0]?.current_period_end
      );


      console.log("UPDATED start:", stripeSub.current_period_start);
      console.log("UPDATED end:", stripeSub.current_period_end);

      if (startDate) sub.startDate = startDate;
      if (endDate) sub.endDate = endDate;

      await sub.save();

      console.log("✅ Subscription updated via Stripe event");

      return res.json({ received: true });
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


    if (event.type === "customer.subscription.created") {

      const rawSub = event.data.object;

      // 🔥 Always retrieve full subscription
      const stripeSub = await stripe.subscriptions.retrieve(rawSub.id);

      const startDate = safeDate(
        stripeSub.items.data[0]?.current_period_start
      );

      const endDate = safeDate(
        stripeSub.items.data[0]?.current_period_end
      );


      const priceId = stripeSub.items.data[0]?.price?.id;
      if (!priceId) return res.json({ received: true });

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

      const user = await User.findOne({
        stripeCustomerId: stripeSub.customer
      });

      if (!user) return res.json({ received: true });

      await Subscription.updateOne(
        { stripeSubscriptionId: stripeSub.id },
        {
          $set: {
            userId: user._id,
            stripeCustomerId: stripeSub.customer,
            stripeSubscriptionId: stripeSub.id,
            planType,
            priceId,
            comicsPerWeek: planConfig.comicsPerWeek,
            studentsLimit: planConfig.studentsLimit,
            status: "active",
            startDate,
            endDate
          }
        },
        { upsert: true }
      );

      console.log("✅ Subscription created/updated safely");

      return res.json({ received: true });
    }




    return res.json({ received: true });

  } catch (err) {
    console.error("❌ Webhook handling error:", err);
    return res.status(500).json({ message: "Webhook handler failed" });
  }
};

module.exports = { stripeWebhook };
