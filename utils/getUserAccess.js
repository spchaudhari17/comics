const Subscription = require("../app/models/Subscription");
const User = require("../app/models/User");

const getUserAccess = async (userId) => {

  const user = await User.findById(userId);

  // 🔥 UNLIMITED USER
  if (user?.isUnlimited) {
    return {
      type: "UNLIMITED",
      comicsAllowed: true,
      comicsPerWeek: Infinity,
      studentsAllowed: true
    };
  }

  const sub = await Subscription.findOne({
    userId,
    status: { $in: ["active", "to_cancel"] },
    endDate: { $gte: new Date() },
  });

  // 🆓 FREE
  if (!sub) {
    return {
      type: "FREE",
      comicsAllowed: true,
      comicsPerWeek: 1,
      studentsAllowed: false
    };
  }

  // 📊 DASHBOARD PLAN
  if (sub.comicsPerWeek === 0) {
    return {
      type: "DASHBOARD",
      comicsAllowed: false,
      comicsPerWeek: 0,
      studentsAllowed: true
    };
  }

  // 📦 BUNDLE PLAN
  return {
    type: "BUNDLE",
    comicsAllowed: true,
    comicsPerWeek: sub.comicsPerWeek,
    studentsAllowed: true
  };
};

module.exports = { getUserAccess };
