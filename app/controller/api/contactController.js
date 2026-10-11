// =====================================================================
// Contact controller: pagination + search + role filter + sorting
//
// ⚠️ ROUTE ME AUTH ZAROOR LAGAO
//    Abhi:  router.get("/user/contacts", getAllContacts);
//    Iska matlab koi bhi (bina login) saare contact messages ke
//    naam, email, phone aur message dekh sakta hai.
//
//    Ab:    router.get("/user/contacts", authentication, getAllContacts);
//    Delete route pe bhi `authentication` hona chahiye, check kar lena.
//    createContact public hi rahega (website ka contact form).
//
// Query params (sab optional):
//   page, limit       -> pagination (page na bhejo to pehle jaisa poora data)
//   search            -> name / email / phone / role / message
//   role              -> exact role
//   sortBy, order     -> name | email | role | createdAt , asc | desc
// Default: latest pehle (createdAt desc)
// =====================================================================

const mongoose = require("mongoose");
const Contact = require("../../models/Contact");

const SORT_FIELDS = ["name", "email", "role", "createdAt"];

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Create new contact message (same as before)
const createContact = async (req, res) => {
  try {
    const { name, email, phone, role, message } = req.body;

    if (!name || !email || !phone || !role || !message) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const contact = await Contact.create({
      name,
      email,
      phone,
      role,
      message
    });

    res.status(201).json({ success: true, contact });
  } catch (error) {
    console.error("Error creating contact:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

// Get all contacts (for admin)
const getAllContacts = async (req, res) => {
  try {
    // 🔒 Admin check: panel ke roles confirm karke enable karo
    // const panelRoles = ["admin", "moderator"];
    // if (!panelRoles.includes(req.user?.login_data?.userType)) {
    //   return res.status(403).json({ success: false, message: "Admin access required" });
    // }

    const { search, role } = req.query;
    const usePagination = req.query.page !== undefined;

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 100);

    // ---------------- Search (har word kisi field me match ho) ----------------
    const baseFilter = {};
    if (search && search.trim() !== "") {
      const words = search.trim().split(/\s+/).slice(0, 5);
      baseFilter.$and = words.map((word) => {
        const rx = new RegExp(escapeRegex(word), "i");
        return {
          $or: [
            { name: rx },
            { email: rx },
            { phone: rx },
            { role: rx },
            { message: rx }
          ]
        };
      });
    }

    // ---------------- Role filter ----------------
    const listFilter = { ...baseFilter };
    if (typeof role === "string" && role.trim() !== "") {
      listFilter.role = role.trim();
    }

    // ---------------- Sorting ----------------
    const sortBy = SORT_FIELDS.includes(req.query.sortBy) ? req.query.sortBy : "createdAt";
    const direction = req.query.order === "asc" ? 1 : -1;
    const sortOption = { [sortBy]: direction, _id: direction };

    // ---------------- Purana response (bina pagination) ----------------
    if (!usePagination) {
      const contacts = await Contact.find(listFilter).sort(sortOption);
      return res.json({ success: true, contacts });
    }

    // ---------------- Paginated response ----------------
    const [contacts, total, roleCounts] = await Promise.all([
      Contact.find(listFilter)
        .collation({ locale: "en", strength: 2 }) // A-Z sort case-insensitive
        .sort(sortOption)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Contact.countDocuments(listFilter),

      // Role dropdown ke options + counts (search ke hisaab se)
      Contact.aggregate([
        { $match: baseFilter },
        { $group: { _id: "$role", count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);

    const roles = roleCounts
      .filter((r) => r._id)
      .map((r) => ({ role: r._id, count: r.count }));

    const stats = {
      total: roleCounts.reduce((sum, r) => sum + r.count, 0),
      roles
    };

    res.json({
      success: true,
      contacts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      stats
    });
  } catch (error) {
    console.error("Error fetching contacts:", error);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
};

// Delete a contact (for admin)
const deleteContact = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid contact id" });
    }

    const deleted = await Contact.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: "Contact not found" });

    res.json({ success: true, message: "Contact deleted successfully" });
  } catch (error) {
    console.error("Error deleting contact:", error);
    res.status(500).json({ error: "Failed to delete contact" });
  }
};

module.exports = { createContact, getAllContacts, deleteContact };