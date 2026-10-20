import express from "express";
import pool from "../db.js";
import {
  hashPassword,
  verifyPassword,
  generateToken,
} from "../services/authService.js";

const router = express.Router();

/**
 * POST /api/auth/signup
 * Creates a new user account.
 */

const DEFAULT_ACCOUNTS = [
  { name: "Main Checking", type: "checking" },
  { name: "Savings Account", type: "savings" },
  { name: "Personal Credit Card", type: "credit_card" },
  { name: "Cash Wallet", type: "cash" },
];

router.post("/signup", async (req, res) => {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res
      .status(400)
      .json({ message: "Please provide all required fields." });
  }

  // NIST SP 800-63-4 inspired password restrictions:
  // Focus on length and avoiding complexity requirements that lead to predictable passwords.
  if (password.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters long." });
  }
  if (password.length > 128) {
    return res
      .status(400)
      .json({ message: "Password must not exceed 128 characters." });
  }

  try {
    // Check if user already exists
    const [existingUsers] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      [email],
    );
    if (existingUsers.length > 0) {
      return res
        .status(409)
        .json({ message: "This email is already registered." });
    }

    // Hash password and save user + default accounts (all or nothing)
    const passwordHash = await hashPassword(password);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [userResult] = await connection.query(
        "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
        [email, passwordHash, name],
      );

      for (const acc of DEFAULT_ACCOUNTS) {
        await connection.query(
          "INSERT INTO accounts (user_id, name, type, balance) VALUES (?, ?, ?, 0)",
          [userResult.insertId, acc.name, acc.type],
        );
      }

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

    res.status(201).json({ message: "User created successfully." });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
});

/**
 * POST /api/auth/login
 * Verifies credentials and sets an auth cookie.
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Please provide all required fields." });
  }

  try {
    // Find user by email
    const [users] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    const user = users[0];

    if (!user || !(await verifyPassword(user.password_hash, password))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    // Generate token and set cookie
    const token = generateToken(user);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.status(200).json({
      message: "Login successful",
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
});

/**
 * POST /api/auth/logout
 * Clears the auth cookie.
 */
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.status(200).json({ message: "Logged out successfully." });
});

export default router;
