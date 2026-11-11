import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../services/authService.js";

const router = express.Router();

const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Strict",
};
const ACCESS_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function setSessionCookies(res, user) {
  res.cookie("access_token", generateAccessToken(user), {
    ...COOKIE_BASE,
    path: "/",
    maxAge: ACCESS_MAX_AGE,
  });
  // Refresh cookie is only sent to /api/auth routes
  res.cookie("refresh_token", generateRefreshToken(user), {
    ...COOKIE_BASE,
    path: "/api/auth",
    maxAge: REFRESH_MAX_AGE,
  });
}

function clearSessionCookies(res) {
  res.clearCookie("access_token", { ...COOKIE_BASE, path: "/" });
  res.clearCookie("refresh_token", { ...COOKIE_BASE, path: "/api/auth" });
}

// Practical email check: something@something.tld, no spaces, max 254 chars.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (email) => email.length <= 254 && EMAIL_REGEX.test(email);

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
  const { password, name } = req.body;
  const email = typeof req.body.email === "string" ? req.body.email.trim() : "";

  if (!email || !password || !name) {
    return res
      .status(400)
      .json({ message: "Please provide all required fields." });
  }

  if (!isValidEmail(email)) {
    return res
      .status(400)
      .json({ message: "Please enter a valid email address." });
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
  const { password } = req.body;
  const email = typeof req.body.email === "string" ? req.body.email.trim() : "";

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Please provide all required fields." });
  }

  if (!isValidEmail(email)) {
    return res
      .status(400)
      .json({ message: "Please enter a valid email address." });
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

    setSessionCookies(res, user);

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
  clearSessionCookies(res);
  res.status(200).json({ message: "Logged out successfully." });
});

/**
 * POST /api/auth/refresh
 * Uses the refresh cookie to issue a new access token and refresh token.
 */
router.post("/refresh", async (req, res) => {
  const payload = req.cookies.refresh_token
    ? verifyRefreshToken(req.cookies.refresh_token)
    : null;

  if (!payload) {
    clearSessionCookies(res);
    return res.status(401).json({
      message: "Your session has expired. Please log in again.",
      code: "SESSION_EXPIRED",
    });
  }

  try {
    // Make sure the user still exists before issuing new tokens
    const [rows] = await pool.query(
      "SELECT id, email FROM users WHERE id = ?",
      [payload.id],
    );
    if (rows.length === 0) {
      clearSessionCookies(res);
      return res.status(401).json({
        message: "Your session has expired. Please log in again.",
        code: "SESSION_EXPIRED",
      });
    }

    setSessionCookies(res, rows[0]);
    res.status(200).json({ message: "Session refreshed." });
  } catch (error) {
    console.error("Refresh error:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, email, name FROM users WHERE id = ?",
      [req.user.id],
    );
    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }
    res.status(200).json({ user: rows[0] });
  } catch (error) {
    console.error("Me error:", error);
    res.status(500).json({ message: "An internal server error occurred." });
  }
});

export default router;
