const Contact = require("../../models/Contact");

// Create new contact message
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
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json({ success: true, contacts });
  } catch (error) {
    console.error("Error fetching contacts:", error);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
};

// Delete a contact (for admin)
const deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Contact.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ error: "Contact not found" });

    res.json({ success: true, message: "Contact deleted successfully" });
  } catch (error) {
    console.error("Error deleting contact:", error);
    res.status(500).json({ error: "Failed to delete contact" });
  }
};

module.exports = { createContact, getAllContacts, deleteContact };
