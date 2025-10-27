const Country = require("../../models/Country");


// Get all countries
// const getAllCountries = async (req, res) => {
//     try {
//         const countries = await Country.find().sort({ label: 1 });
//         res.json({ success: true, countries });
//     } catch (err) {
//         console.error(" Error fetching countries:", err);
//         res.status(500).json({ success: false, message: "Failed to fetch countries" });
//     }
// };


const getAllCountries = async (req, res) => {
  try {
    const { search } = req.query;

    // Build search filter (case-insensitive, ignoring emojis)
    const filter = {};
    if (search && search.trim()) {
      filter.label = { $regex: search.trim(), $options: "i" };
    }

    // Fetch countries
    const countries = await Country.find(filter).lean();

    // Clean labels (remove emoji for sorting only)
    const sortedCountries = countries.sort((a, b) => {
      const cleanA = a.label.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").trim().toLowerCase();
      const cleanB = b.label.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").trim().toLowerCase();
      return cleanA.localeCompare(cleanB);
    });

    return res.status(200).json({
      success: true,
      count: sortedCountries.length,
      countries: sortedCountries,
    });
  } catch (err) {
    console.error("❌ Error fetching countries:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch countries",
      error: err.message,
    });
  }
};


module.exports = { getAllCountries }