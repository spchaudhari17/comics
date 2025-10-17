const Country = require("../../models/Country");


// Get all countries
const getAllCountries = async (req, res) => {
    try {
        const countries = await Country.find().sort({ label: 1 });
        res.json({ success: true, countries });
    } catch (err) {
        console.error(" Error fetching countries:", err);
        res.status(500).json({ success: false, message: "Failed to fetch countries" });
    }
};

module.exports = { getAllCountries }