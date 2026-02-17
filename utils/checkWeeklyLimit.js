const Comic = require("../app/models/Comic");

const checkWeeklyComicLimit = async (userId, allowedCount) => {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const count = await Comic.countDocuments({
    user_id: userId,
    createdAt: { $gte: oneWeekAgo },

    // ✅ ONLY count completed comics
    pdfUrl: { $exists: true, $ne: null },

    // Optional: only published comics
    comicStatus: "published"
  });


  if (count >= allowedCount) {
    throw {
      code: "WEEKLY_LIMIT_REACHED",
      message: `Weekly comic limit reached (${allowedCount})`,
    };
  }
};

module.exports = { checkWeeklyComicLimit };
