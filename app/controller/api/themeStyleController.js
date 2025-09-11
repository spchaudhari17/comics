const Theme = require("../../models/Theme");
const Style = require("../../models/Style");


const createTheme = async (req, res) => {
    try {
        const theme = await Theme.create(req.body);
        res.json(theme);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


const getAllThemes = async (req, res) => {
    try {
        const themes = await Theme.find();
        res.json(themes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


const createStyle = async (req, res) => {
    try {
        const style = await Style.create(req.body);
        res.json(style);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


const getAllStyles = async (req, res) => {
    try {
        const styles = await Style.find();
        res.json(styles);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = { createTheme, getAllThemes, createStyle, getAllStyles };
