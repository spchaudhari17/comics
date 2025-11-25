const User = require("../../models/User");
const ParentChild = require("../../models/ParentChild");


const isParentUser = (user) => {
    // e.g. userType === "parent" or "teacher"
    return user.userType === "parent" || user.userType === "user";
};


const addChild = async (req, res) => {
    try {
        const parent = req.user?.login_data;
        const { username } = req.body;

        if (!parent) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!isParentUser(parent)) {
            return res
                .status(403)
                .json({ success: false, message: "Only parent accounts can add children." });
        }

        if (!username || !username.trim()) {
            return res
                .status(400)
                .json({ success: false, message: "Child username is required." });
        }

        // 🔍 Find child by username
        const child = await User.findOne({ username: username.trim() }).lean();
        if (!child) {
            return res
                .status(404)
                .json({ success: false, message: "No user found with this username." });
        }

        // Parent khud ko child nahi bana sakta
        if (child._id.toString() === parent._id.toString()) {
            return res
                .status(400)
                .json({ success: false, message: "You cannot link yourself as a child." });
        }

        // ⚠️ Optional: allow only student-type as child
        // if (child.userType !== "student") {
        //   return res
        //     .status(400)
        //     .json({ success: false, message: "Only student accounts can be linked as child." });
        // }

        // 🔢 Check existing children count (max 2)
        const linkedCount = await ParentChild.countDocuments({ parentId: parent._id });

        if (linkedCount >= 2) {
            return res.status(400).json({
                success: false,
                message: "You can only link up to 2 children.",
            });
        }

        // 🔁 Check already linked
        const existing = await ParentChild.findOne({
            parentId: parent._id,
            childId: child._id,
        });

        if (existing) {
            return res.status(400).json({
                success: false,
                message: "This child is already linked to your account.",
            });
        }

        // ✅ Create link
        const link = await ParentChild.create({
            parentId: parent._id,
            childId: child._id,
        });

        return res.json({
            success: true,
            message: "Child successfully linked.",
            child: {
                _id: child._id,
                username: child.username,
                grade: child.grade,
                country: child.country,
            },
            linkId: link._id,
        });
    } catch (err) {
        console.error("Add Child Error:", err);
        // Unique index error handle
        if (err.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "This child is already linked.",
            });
        }
        res.status(500).json({ success: false, message: "Failed to add child." });
    }
};


const getMyChildren = async (req, res) => {
    try {
        const parent = req.user?.login_data;

        if (!parent) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!isParentUser(parent)) {
            return res
                .status(403)
                .json({ success: false, message: "Only parent accounts can view children." });
        }

        const links = await ParentChild.find({ parentId: parent._id })
            .populate({
                path: "childId",
                select: "username grade country userType",
            })
            .lean();

        const children = links
            .filter((l) => l.childId)
            .map((l) => ({
                _id: l.childId._id,
                username: l.childId.username,
                grade: l.childId.grade,
                country: l.childId.country,
                userType: l.childId.userType,
                profile_pic: l.childId.profile_pic,
                linkedAt: l.createdAt,
            }));

        return res.json({
            success: true,
            children,
            maxChildren: 2,
        });
    } catch (err) {
        console.error("Get My Children Error:", err);
        res.status(500).json({ success: false, message: "Failed to fetch children." });
    }
};


const removeChild = async (req, res) => {
    try {
        const parent = req.user?.login_data;
        const { childId } = req.body;

        if (!parent) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        if (!isParentUser(parent)) {
            return res
                .status(403)
                .json({ success: false, message: "Only parent accounts can remove children." });
        }

        await ParentChild.deleteOne({
            parentId: parent._id,
            childId,
        });

        return res.json({
            success: true,
            message: "Child removed from your list.",
        });
    } catch (err) {
        console.error("Remove Child Error:", err);
        res.status(500).json({ success: false, message: "Failed to remove child." });
    }
};


module.exports = { addChild, getMyChildren, removeChild }