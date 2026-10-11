const Users = require("../../../models/User");
let validator = require("email-validator");
const jwt = require("jsonwebtoken")
var bcrypt = require('bcryptjs');
var crypto = require("crypto");
const MOMENT = require('moment');
const { upload_files } = require("../../../../helper/helper");


const USER_ROLES = ["admin", "moderator", "user", "parent", "student"];

// Frontend ke sortField -> DB fields
const SORT_FIELDS = {
    name: ["firstname", "lastname"],
    username: ["username"],
    email: ["email"],
    userType: ["userType"],
    createdAt: ["createdAt"]
};

const USER_HIDDEN_FIELDS = "-password -reset_key -otp";

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getAllUsers = async (req, res) => {
    try {
        // 🔒 Admin check: admin panel ke roles confirm karke enable karo
        // (AllUsers page admin + moderator dono khol sakte hain shayad)
        // const panelRoles = ["admin", "moderator"];
        // if (!panelRoles.includes(req.user?.login_data?.userType)) {
        //     return res.status(403).json({ success: false, message: "Admin access required" });
        // }

        const { search, role } = req.query;
        const usePagination = req.query.page !== undefined;

        const page = Math.max(parseInt(req.query.page) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);

        // ---------------- Search ----------------
        // Har word kisi na kisi field me match hona chahiye,
        // taaki "rahul sharma" (first + last name) bhi mil jaye
        const baseFilter = {};
        if (search && search.trim() !== "") {
            const words = search.trim().split(/\s+/).slice(0, 5);
            baseFilter.$and = words.map((word) => {
                const rx = new RegExp(escapeRegex(word), "i");
                return {
                    $or: [
                        { firstname: rx },
                        { lastname: rx },
                        { username: rx },
                        { email: rx }
                    ]
                };
            });
        }

        // ---------------- Role filter ----------------
        const listFilter = { ...baseFilter };
        if (role && USER_ROLES.includes(role)) {
            listFilter.userType = role;
        }

        // ---------------- Sorting ----------------
        const direction = req.query.order === "asc" ? 1 : -1;
        const sortFields = SORT_FIELDS[req.query.sortBy] || SORT_FIELDS.createdAt;
        const sortOption = {};
        sortFields.forEach((field) => { sortOption[field] = direction; });
        sortOption._id = direction; // tie-break, page change pe order stable rahe

        // ---------------- Purana response (bina pagination) ----------------
        if (!usePagination) {
            const users = await Users.find(listFilter)
                .select(USER_HIDDEN_FIELDS)
                .sort(sortOption);

            return res.status(200).json({
                success: true,
                count: users.length,
                data: users
            });
        }

        // ---------------- Paginated response ----------------
        const [users, total, roleCounts] = await Promise.all([
            Users.find(listFilter)
                .select(USER_HIDDEN_FIELDS)
                .collation({ locale: "en", strength: 2 }) // A-Z sort case-insensitive
                .sort(sortOption)
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),

            Users.countDocuments(listFilter),

            // Role dropdown me counts (search ke hisaab se, role filter ke bina)
            Users.aggregate([
                { $match: baseFilter },
                { $group: { _id: "$userType", count: { $sum: 1 } } }
            ])
        ]);

        const stats = { total: 0 };
        USER_ROLES.forEach((r) => { stats[r] = 0; });
        roleCounts.forEach(({ _id, count }) => {
            if (_id) stats[_id] = (stats[_id] || 0) + count;
            stats.total += count;
        });

        return res.status(200).json({
            success: true,
            count: users.length,
            data: users,
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
            stats
        });

    } catch (err) {
        console.error("Error in getAllUsers:", err);
        return res.status(500).json({
            success: false,
            message: "Something went wrong!",
            error: err.message
        });
    }
};

module.exports = { getAllUsers };