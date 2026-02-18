// routes/auth.js
const express = require("express");
const router = express.Router();
const { login } = require("../controllers/authController");

// POST /api/auth/login
router.post("/Login", login);

module.exports = router;