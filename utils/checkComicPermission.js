const Subscription = require("../app/models/Subscription");

const checkComicPermission = async (userId) => {
  const sub = await Subscription.findOne({
    userId,
    status: { $in: ["active", "to_cancel"] },
    endDate: { $gte: new Date() },
  });

  if (!sub) {
    throw {
      code: "NO_SUBSCRIPTION",
      message: "Subscription required to create comics",
    };
  }

  if (sub.comicsPerWeek === 0) {
    throw {
      code: "DASHBOARD_PLAN",
      message: "Your plan does not allow comic creation",
    };
  }

  return sub;
};

module.exports = { checkComicPermission };
