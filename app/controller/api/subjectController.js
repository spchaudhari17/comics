const { upload_files, deleteFiles } = require("../../../helper/helper");
const Subject = require("../../models/Subject");
const sharp = require("sharp");

const createSubject = async (req, res) => {
    try {
        const { name } = req.body;
        const imageFile = req.files?.image;

        if (!name || !imageFile) {
            return res.status(400).json({ error: "Name and image are required" });
        }

        // Read buffer from uploaded file
        const buffer = Buffer.from(imageFile.data, "binary");

        // 🔹 Resize + compress before upload
        const optimizedBuffer = await sharp(buffer)
            .resize({ width: 600 })        // fix width, auto height
            .jpeg({ quality: 75 })         // compress to 75%
            .toBuffer();

        // Ab helper ke liye ek "fake file object" banao jisme optimized buffer ho
        const optimizedFile = {
            name: imageFile.name.replace(/\.[^/.]+$/, ".jpg"), // png -> jpg
            data: optimizedBuffer,
            mimetype: "image/jpeg"
        };

        // Upload image to S3
        const uploadedUrl = await upload_files("subjects", optimizedFile);
        if (!uploadedUrl) {
            return res.status(500).json({ error: "Image upload failed" });
        }

        // Save subject in DB
        const subject = await Subject.create({
            name,
            image: uploadedUrl,
        });

        res.json(subject);
    } catch (error) {
        console.error("Error adding subject:", error);
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
};

const getAllSubjects = async (req, res) => {
    const subjects = await Subject.find();
    res.json(subjects);
};


const deleteSubject = async (req, res) => {
    try {
        const { id } = req.body;

        // Subject find karo
        const subject = await Subject.findById(id);
        if (!subject) {
            return res.status(404).json({ error: "Subject not found" });
        }

        // Agar image hai toh S3 se delete karo
        if (subject.image) {
            try {
                // S3 me se sirf fileName nikalna hoga (path ke last part)
                const imageUrl = subject.image;
                const fileName = imageUrl.split("/").pop(); // last part after '/'

                await deleteFiles("subjects", fileName);
            } catch (err) {
                console.warn("S3 delete failed:", err);
            }
        }

        // Subject ko DB se delete karo
        await Subject.findByIdAndDelete(id);

        res.json({ success: true, message: "Subject deleted successfully" });
    } catch (error) {
        console.error("Error deleting subject:", error);
        res.status(500).json({ error: "Internal server error", details: error.message });
    }
};

module.exports = { createSubject, getAllSubjects, deleteSubject };
