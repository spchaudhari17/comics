const OpenAI = require("openai");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const { upload_files } = require("../../../../helper/helper");
const Comic = require("../../../models/Comic");
const ComicPage = require("../../../models/ComicPage");
const PDFDocument = require("pdfkit");
const sharp = require("sharp");
const HardcoreQuiz = require("../../../models/HardcoreQuiz");
const DidYouKnow = require("../../../models/DidYouKnow");
const Quiz = require("../../../models/Quiz");
const FAQ = require("../../../models/FAQ");
const User = require("../../../models/User");
const transporter = require("../../../../config/mailer");


const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});






const ADMIN_STATUSES = ["pending", "approved", "rejected"];

// User ka search text regex me safe banane ke liye
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const listAllComicsAdmin = async (req, res) => {
  try {
    // 🔒 Admin check (pichhle message wala isAdminUser / ADMIN_ROLES)
    // Pehle confirm karo ki admin panel kaun-kaun se userType use karte hain,
    // phir ise enable karo, warna admin panel khud lock ho jayega
    // if (!isAdminUser(req)) {
    //     return res.status(403).json({ success: false, message: "Admin access required" });
    // }

    const { country, search, status } = req.query;
    const usePagination = req.query.page !== undefined;

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);

    const andConditions = [];

    // 🌍 Country: us country ki comics + jo "ALL" countries ke liye hain
    // (auto-approve ke baad zyada tar comics "ALL" hongi, purana
    //  `country: "IN"` filter unhe dikhata hi nahi tha)
    if (country && country.trim() !== "") {
      const code = country.trim().toUpperCase();
      andConditions.push({
        $or: [
          { country: code },
          { countries: code },
          { country: "ALL" },
          { countries: "ALL" }
        ]
      });
    }

    // 🔍 Search: title / subject / concept + creator ka naam / email / userType
    if (search && search.trim() !== "") {
      const rx = new RegExp(escapeRegex(search.trim()), "i");

      const matchedUsers = await User.find({
        $or: [{ firstname: rx }, { lastname: rx }, { email: rx }, { userType: rx }]
      })
        .select("_id")
        .lean();

      andConditions.push({
        $or: [
          { title: rx },
          { subject: rx },
          { concept: rx },
          { user_id: { $in: matchedUsers.map((u) => u._id) } }
        ]
      });
    }

    // Stats cards ke liye filter (status ke bina)
    const baseFilter = { comicStatus: "published" };
    if (andConditions.length) baseFilter.$and = andConditions;

    // Table ke liye filter (status ke saath)
    const listFilter = { ...baseFilter };
    if (status && ADMIN_STATUSES.includes(status)) {
      listFilter.status = status;
    }

    // ⬇️ Latest pehle (same time ho to _id se tie-break)
    const sortOption = { createdAt: -1, _id: -1 };

    // ---------------- Purana response (bina pagination) ----------------
    if (!usePagination) {
      const comics = await Comic.find(listFilter, "-prompt")
        .populate("user_id", "name email userType firstname")
        .sort(sortOption);

      return res.json({
        success: true,
        total: comics.length,
        country: country || "ALL",
        comics
      });
    }

    // ---------------- Paginated response ----------------
    const [comics, total, statusCounts] = await Promise.all([
      Comic.find(listFilter, "-prompt -story -userStory")
        .populate("user_id", "name email userType firstname lastname")
        .sort(sortOption)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Comic.countDocuments(listFilter),

      Comic.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$status", count: { $sum: 1 } } }
      ])
    ]);

    const stats = { pending: 0, approved: 0, rejected: 0, total: 0 };
    statusCounts.forEach(({ _id, count }) => {
      if (_id in stats) stats[_id] = count;
      stats.total += count;
    });

    return res.json({
      success: true,
      comics,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats,
      country: country || "ALL"
    });
  } catch (error) {
    console.error("❌ Admin list comics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch comics",
      error: error.message
    });
  }
};




const getAdminComicDetails = async (req, res) => {
  try {
    const comicId = req.params.id;

    // 1️⃣ Find the main comic
    const comic = await Comic.findById(comicId)
      .populate("user_id", "firstname email userType")
      .populate("subjectId", "name")
      .populate("themeId", "name")
      .populate("styleId", "name")
      .lean();

    if (!comic) {
      return res.status(404).json({
        error: true,
        status: 404,
        message: "Comic not found",
      });
    }

    // 2️⃣ Find pages
    const pages = await ComicPage.find({ comicId })
      .sort({ pageNumber: 1 })
      .lean();

    // 3️⃣ Find Quiz
    const quiz = await Quiz.findOne({ comicId })
      .populate({
        path: "questions",
        select:
          "question options correctAnswer explanation hint difficulty",
      })
      .lean();

    // 4️⃣ Find Did You Know
    const didYouKnow = await DidYouKnow.find({ comicId }).lean();

    // 5️⃣ Find FAQs
    const faqs = await FAQ.find({ comicId }).lean();

    // 6️⃣ Find Hardcore Quiz
    const hardcoreQuiz = await HardcoreQuiz.findOne({ comicId })
      .populate({
        path: "questions",
        select:
          "question options correctAnswer difficulty explanation hint",
      })
      .lean();

    // 7️⃣ Create section flags
    const hasQuiz = !!quiz;
    const hasDidYouKnow = didYouKnow && didYouKnow.length > 0;
    const hasFaq = faqs && faqs.length > 0;
    const hasHardcoreQuiz = !!hardcoreQuiz;

    // 8️⃣ Prepare final response object
    const response = {
      comic,
      pages,
      quiz: quiz || null,
      didYouKnow: didYouKnow || [],
      faqs: faqs || [],
      hardcoreQuiz: hardcoreQuiz || null,

      // ⚡️ Section flags
      hasQuiz,
      hasDidYouKnow,
      hasFaq,
      hasHardcoreQuiz,
    };

    // ✅ Send response
    return res.status(200).json({
      error: false,
      status: 200,
      message: "Admin comic details fetched successfully",
      data: response,
    });
  } catch (error) {
    console.error("❌ Error fetching admin comic details:", error);
    return res.status(500).json({
      error: true,
      status: 500,
      message: "Failed to fetch comic details",
      details: error.message,
    });
  }
};


// const approveComicStatusAdmin = async (req, res) => {
//   try {
//     const { id } = req.body;
//     const { status } = req.body;

//     if (!["approved", "rejected", "pending"].includes(status)) {
//       return res.status(400).json({ error: "Invalid status value" });
//     }

//     const comic = await Comic.findByIdAndUpdate(
//       id,
//       { status },
//       { new: true }
//     );

//     if (!comic) {
//       return res.status(404).json({ error: "Comic not found" });
//     }

//     res.json({ message: `Comic ${status} successfully`, comic });
//   } catch (error) {
//     console.error("Update comic status error:", error);
//     res.status(500).json({ error: "Failed to update comic status" });
//   }
// };

const approveComicStatusAdmin = async (req, res) => {
  try {
    const { id, status } = req.body;

    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    // ⭐ Fetch comic with user data
    const comic = await Comic.findById(id).populate("user_id");

    if (!comic) {
      return res.status(404).json({ error: "Comic not found" });
    }

    // ⭐ Update status
    comic.status = status;
    await comic.save();

    // ⭐ If approved → send email to user
    if (status === "approved") {
      const userEmail = comic.user_id?.email;

      if (userEmail) {
        const mailOptions = {
          from: "ajinkya.kridemy@gmail.com",
          to: userEmail,
          subject: "Your Comic Has Been Approved! 🎉",
          html: `
            <h2>Congratulations!</h2>
            <p>Your comic <strong>"${comic.title}"</strong> has been approved by the admin.</p>

            <p>You can now see it live in the public comics section.</p>

            <br/>
            <p>Keep creating great educational comics! 🚀</p>
          `
        };

        transporter.sendMail(mailOptions, (err, info) => {
          if (err) {
            console.error("❌ Failed to send approval email:", err.message);
          } else {
            console.log("📨 Approval email sent to user:", info.response);
          }
        });
      }
    }

    // ⭐ If rejected → (optional) user ko rejection email bhi bhej sakte ho
    if (status === "rejected") {
      const userEmail = comic.user_id?.email;

      if (userEmail) {
        const mailOptions = {
          from: "ajinkya.kridemy@gmail.com",
          to: userEmail,
          subject: "Your Comic Was Rejected 😕",
          html: `
            <h2>Your Comic Review Result</h2>
            <p>Unfortunately, your comic <strong>"${comic.title}"</strong> has been rejected.</p>

            <p>You may revise it and submit again.</p>
          `
        };

        transporter.sendMail(mailOptions, (err, info) => {
          if (err) {
            console.error("❌ Failed to send rejection email:", err.message);
          } else {
            console.log("📨 Rejection email sent:", info.response);
          }
        });
      }
    }

    res.json({ message: `Comic ${status} successfully`, comic });
  } catch (error) {
    console.error("Update comic status error:", error);
    res.status(500).json({ error: "Failed to update comic status" });
  }
};





const assignModeratorRole = async (req, res) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).send({ error: true, message: "User ID is required" });
    }

    const adminUser = await User.findById(req.user.login_data._id);

    if (!adminUser || adminUser.userType !== 'admin') {
      return res.status(403).send({ error: true, message: "Unauthorized action" });
    }

    const user = await User.findById(user_id);

    if (!user) {
      return res.status(404).send({ error: true, message: "User not found" });
    }

    // Toggle userType logic
    const newUserType = user.userType === 'moderator' ? 'user' : 'moderator';
    user.userType = newUserType;

    await user.save();

    return res.status(200).send({
      error: false,
      message: `User type updated to ${newUserType}`,
      data: user,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send({ error: true, message: "An error occurred" });
  }
};

const deleteUser = async (req, res) => {


  try {

    const { user_id } = req.body;

    if (!user_id) {
      return res.send({ error: true, status: 400, message: "User ID is required." });
    }

    const isDeleted = await User.deleteOne({ "_id": user_id })

    if (isDeleted) {

      return res.send({ "error": false, "status": 200, "message": "Account Deleted successfully." })

    } else {

      return res.send({ "error": true, "status": 201, "message": "An error has occured." })
    }

  } catch (e) {

    return res.send({ "error": true, "status": 201, "message": "Something went wrong." + e })
  }

}


const toggleUnlimited = async (req, res) => {
  try {
    const { isUnlimited, userId } = req.body;

    // agar value nahi bhejoge to error dega
    if (typeof isUnlimited !== "boolean") {
      return res.status(400).json({
        error: "Please provide isUnlimited as true or false"
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { isUnlimited },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      success: true,
      message: `User unlimited access set to ${isUnlimited}`,
      user: updatedUser
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};


module.exports = { approveComicStatusAdmin, listAllComicsAdmin, getAdminComicDetails, assignModeratorRole, deleteUser, toggleUnlimited }

















