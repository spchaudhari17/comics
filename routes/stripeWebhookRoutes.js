// routes/stripeWebhook.js
const express = require("express");
const { stripeWebhook } = require("../app/controller/api/stripeWebhookController");
const router = express.Router();

router.post(
  "/stripe/webhook",
  express.raw({ type: "application/json" }),
  stripeWebhook
);

module.exports = router;
