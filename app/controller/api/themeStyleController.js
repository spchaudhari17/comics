const Theme = require("../../models/Theme");
const Style = require("../../models/Style");
const { upload_files, deleteFiles } = require("../../../helper/helper");
const sharp = require("sharp");


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


// const createStyle = async (req, res) => {
//     try {
//         const style = await Style.create(req.body);
//         res.json(style);
//     } catch (err) {
//         res.status(500).json({ error: err.message });
//     }
// };

const createStyle = async (req, res) => {
  try {
    const { name, description, subjects, grades, prompt } = req.body;
    const imageFile = req.files?.image;

    if (!name || !imageFile) {
      return res.status(400).json({ error: "Name and image are required" });
    }

    // Read buffer
    const buffer = Buffer.from(imageFile.data, "binary");

    // 🔹 Optimize
    const optimizedBuffer = await sharp(buffer)
      .resize({ width: 600 })
      .jpeg({ quality: 75 })
      .toBuffer();

    // Fake file object for helper
    const optimizedFile = {
      name: imageFile.name.replace(/\.[^/.]+$/, ".jpg"),
      data: optimizedBuffer,
      mimetype: "image/jpeg",
    };

    // Upload to S3
    const uploadedUrl = await upload_files("styles", optimizedFile);
    if (!uploadedUrl) {
      return res.status(500).json({ error: "Image upload failed" });
    }

    // Save in DB
    const style = await Style.create({
      name,
      description,
      subjects: subjects ? JSON.parse(subjects) : [],
      grades,
      prompt,
      image: uploadedUrl,
    });

    res.json(style);
  } catch (error) {
    console.error("Error creating style:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
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


const deleteStyle = async (req, res) => {
  try {
    const { id } = req.body;

    const style = await Style.findById(id);
    if (!style) {
      return res.status(404).json({ error: "Style not found" });
    }

    // Delete from S3
    if (style.image) {
      try {
        const fileName = style.image.split("/").pop();
        await deleteFiles("styles", fileName);
      } catch (err) {
        console.warn("S3 delete failed:", err);
      }
    }

    // Delete from DB
    await Style.findByIdAndDelete(id);

    res.json({ success: true, message: "Style deleted successfully" });
  } catch (error) {
    console.error("Error deleting style:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};


const updateStyle = async (req, res) => {
  try {
    const { id } = req.body;
    const { name, description, subjects, grades, prompt } = req.body;
    const imageFile = req.files?.image;

    // Find style
    const style = await Style.findById(id);
    if (!style) {
      return res.status(404).json({ error: "Style not found" });
    }

    let uploadedUrl = style.image;

    // 🔹 If new image uploaded
    if (imageFile) {
      // delete old image from S3 (if exists)
      if (style.image) {
        try {
          const oldFileName = style.image.split("/").pop();
          await deleteFiles("styles", oldFileName);
        } catch (err) {
          console.warn("S3 delete failed:", err.message);
        }
      }

      // Read + optimize
      const buffer = Buffer.from(imageFile.data, "binary");
      const optimizedBuffer = await sharp(buffer)
        .resize({ width: 600 })
        .jpeg({ quality: 75 })
        .toBuffer();

      const optimizedFile = {
        name: imageFile.name.replace(/\.[^/.]+$/, ".jpg"),
        data: optimizedBuffer,
        mimetype: "image/jpeg",
      };

      uploadedUrl = await upload_files("styles", optimizedFile);
      if (!uploadedUrl) {
        return res.status(500).json({ error: "Image upload failed" });
      }
    }

    // Update document
    style.name = name || style.name;
    style.description = description || style.description;
    style.subjects = subjects ? JSON.parse(subjects) : style.subjects;
    style.grades = grades || style.grades;
    style.prompt = prompt || style.prompt;
    style.image = uploadedUrl;

    await style.save();

    res.json({ success: true, style });
  } catch (error) {
    console.error("Error updating style:", error);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
};


module.exports = { createTheme, getAllThemes, createStyle, getAllStyles, updateStyle };
