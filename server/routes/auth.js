import { sendError } from "../utils/errors.js";
import express from "express";
import pool from "../db.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  verifyRefreshToken,
} from "../services/authService.js";
import { getPasswordValidationError } from "../services/passwordValidation.js";
import { clearAiCache } from "../services/aiCache.js";

const router = express.Router();

const COOKIE_BASE = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "Strict",
};
const ACCESS_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

function setAccessCookie(res, user) {
  res.cookie("access_token", generateAccessToken(user), {
    ...COOKIE_BASE,
    path: "/",
    maxAge: ACCESS_MAX_AGE,
  });
}

function setSessionCookies(res, user, refreshToken) {
  setAccessCookie(res, user);
  // Refresh cookie is only sent to /api/auth routes
  res.cookie("refresh_token", refreshToken, {
    ...COOKIE_BASE,
    path: "/api/auth",
    maxAge: REFRESH_MAX_AGE,
  });
}

async function createRefreshSession(user) {
  const refreshToken = generateRefreshToken(user);
  const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE);
  await pool.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
    [user.id, hashRefreshToken(refreshToken), expiresAt],
  );
  return refreshToken;
}

async function rotateRefreshSession(refreshToken, userId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [sessions] = await connection.query(
      `SELECT id FROM sessions
       WHERE user_id = ? AND token_hash = ? AND is_logged_out = FALSE
         AND expires_at > CURRENT_TIMESTAMP
       FOR UPDATE`,
      [userId, hashRefreshToken(refreshToken)],
    );
    if (sessions.length === 0) {
      await connection.rollback();
      return null;
    }

    const [users] = await connection.query(
      "SELECT id, email FROM users WHERE id = ?",
      [userId],
    );
    if (users.length === 0) {
      await connection.rollback();
      return null;
    }

    const user = users[0];
    const nextRefreshToken = generateRefreshToken(user);
    const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE);
    const [result] = await connection.query(
      `UPDATE sessions
       SET token_hash = ?, expires_at = ?
       WHERE id = ? AND token_hash = ? AND is_logged_out = FALSE`,
      [
        hashRefreshToken(nextRefreshToken),
        expiresAt,
        sessions[0].id,
        hashRefreshToken(refreshToken),
      ],
    );
    if (result.affectedRows !== 1) {
      await connection.rollback();
      return null;
    }

    await connection.commit();
    return { user, refreshToken: nextRefreshToken };
  } catch (error) {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      console.error("Refresh rollback error:", rollbackError);
    }
    throw error;
  } finally {
    connection.release();
  }
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
    return sendError(res, 400, "Please provide all required fields.");
  }

  if (!isValidEmail(email)) {
    return sendError(res, 400, "Please enter a valid email address.");
  }

  const passwordError = getPasswordValidationError(password);
  if (passwordError) return sendError(res, 400, passwordError);

  try {
    // Check if user already exists
    const [existingUsers] = await pool.query(
      "SELECT id FROM users WHERE email = ?",
      [email],
    );
    if (existingUsers.length > 0) {
      return sendError(res, 409, "This email is already registered.");
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
    sendError(res, 500, "An internal server error occurred.");
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
    return sendError(res, 400, "Please provide all required fields.");
  }

  if (!isValidEmail(email)) {
    return sendError(res, 400, "Please enter a valid email address.");
  }

  try {
    // Find user by email
    const [users] = await pool.query("SELECT * FROM users WHERE email = ?", [
      email,
    ]);
    const user = users[0];

    if (!user || !(await verifyPassword(user.password_hash, password))) {
      return sendError(
        res,
        401,
        "Incorrect email or password. Please check your credentials and try again.",
      );
    }

    const refreshToken = await createRefreshSession(user);
    setSessionCookies(res, user, refreshToken);

    res.status(200).json({
      message: "Login successful",
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    console.error("Login error:", error);
    sendError(res, 500, "An internal server error occurred.");
  }
});

router.post("/change-password", authMiddleware, async (req, res) => {
  const currentPassword =
    typeof req.body?.current_password === "string"
      ? req.body.current_password
      : "";
  const newPassword = req.body?.new_password;

  if (!currentPassword) {
    return sendError(res, 400, "Current password is required.");
  }
  const passwordError = getPasswordValidationError(newPassword);
  if (passwordError) return sendError(res, 400, passwordError);

  const refreshToken = req.cookies.refresh_token;
  const refreshPayload = refreshToken
    ? verifyRefreshToken(refreshToken)
    : null;
  if (!refreshPayload || Number(refreshPayload.id) !== Number(req.user.id)) {
    return sendError(res, 401, "Your current session is invalid. Please log in again.");
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [users] = await connection.query(
      "SELECT id, email, name, password_hash FROM users WHERE id = ? FOR UPDATE",
      [req.user.id],
    );
    if (users.length === 0) {
      await connection.rollback();
      return sendError(res, 404, "User not found.");
    }

    const user = users[0];
    if (!(await verifyPassword(user.password_hash, currentPassword))) {
      await connection.rollback();
      return sendError(res, 401, "Current password is incorrect.");
    }
    if (await verifyPassword(user.password_hash, newPassword)) {
      await connection.rollback();
      return sendError(
        res,
        400,
        "New password must be different from your current password.",
      );
    }

    const currentTokenHash = hashRefreshToken(refreshToken);
    const [sessions] = await connection.query(
      `SELECT id FROM sessions
       WHERE user_id = ? AND token_hash = ? AND is_logged_out = FALSE
         AND expires_at > CURRENT_TIMESTAMP
       FOR UPDATE`,
      [req.user.id, currentTokenHash],
    );
    if (sessions.length === 0) {
      await connection.rollback();
      return sendError(res, 401, "Your current session has expired. Please log in again.");
    }

    const passwordHash = await hashPassword(newPassword);
    await connection.query(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [passwordHash, req.user.id],
    );
    await connection.query(
      "UPDATE sessions SET is_logged_out = TRUE WHERE user_id = ? AND id <> ?",
      [req.user.id, sessions[0].id],
    );
    await connection.commit();

    setSessionCookies(res, user, refreshToken);
    res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        console.error("Password change rollback failed.");
      }
    }
    console.error(
      "Password change failed:",
      error?.code || error?.name || "Unknown error",
    );
    sendError(
      res,
      500,
      "Could not change your password because of a server error. Please try again.",
    );
  } finally {
    connection?.release();
  }
});

/**
 * POST /api/auth/logout
 * Revokes the refresh session and clears the auth cookies.
 */
router.post("/logout", async (req, res) => {
  try {
    const refreshToken = req.cookies.refresh_token;
    if (refreshToken) {
      await pool.query(
        "UPDATE sessions SET is_logged_out = TRUE WHERE token_hash = ?",
        [hashRefreshToken(refreshToken)],
      );
    }
    clearSessionCookies(res);
    res.status(200).json({ message: "Logged out successfully." });
  } catch (error) {
    console.error("Logout error:", error);
    sendError(res, 500, "Could not log out.");
  }
});

/**
 * POST /api/auth/refresh
 * Uses the refresh cookie to issue a new access token and refresh token.
 */
router.post("/refresh", async (req, res) => {
  const refreshToken = req.cookies.refresh_token;
  const payload = refreshToken ? verifyRefreshToken(refreshToken) : null;

  if (!payload) {
    clearSessionCookies(res);
    return sendError(res, 401, "Your session has expired. Please log in again.", { code: "SESSION_EXPIRED" });
  }

  try {
    const session = await rotateRefreshSession(refreshToken, payload.id);
    if (!session) {
      clearSessionCookies(res);
      return sendError(res, 401, "Your session has expired. Please log in again.", { code: "SESSION_EXPIRED" });
    }

    setSessionCookies(res, session.user, session.refreshToken);
    res.status(200).json({ message: "Session refreshed." });
  } catch (error) {
    console.error("Refresh error:", error);
    sendError(res, 500, "An internal server error occurred.");
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, email, name FROM users WHERE id = ?",
      [req.user.id],
    );
    if (rows.length === 0) {
      return sendError(res, 404, "User not found.");
    }
    res.status(200).json({ user: rows[0] });
  } catch (error) {
    console.error("Me error:", error);
    sendError(res, 500, "An internal server error occurred.");
  }
});

router.patch("/me", authMiddleware, async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";

  if (!name || name.length > 100) {
    return sendError(res, 400, "Name must be between 1 and 100 characters.");
  }
  if (!isValidEmail(email)) {
    return sendError(res, 400, "Please enter a valid email address.");
  }

  try {
    await pool.query(
      "UPDATE users SET email = ?, name = ? WHERE id = ?",
      [email, name, req.user.id],
    );
    const [rows] = await pool.query(
      "SELECT id, email, name FROM users WHERE id = ?",
      [req.user.id],
    );
    if (rows.length === 0) {
      return sendError(res, 404, "User not found.");
    }

    const user = rows[0];
    setAccessCookie(res, user);
    res.status(200).json({ user });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return sendError(res, 409, "That email address is already in use.");
    }
    console.error("Profile update error:", error);
    sendError(res, 500, "An internal server error occurred.");
  }
});

router.delete("/me", authMiddleware, async (req, res) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query("DELETE FROM transactions WHERE user_id = ?", [req.user.id]);
    await connection.query("DELETE FROM budgets WHERE user_id = ?", [req.user.id]);
    await connection.query("DELETE FROM savings_goals WHERE user_id = ?", [req.user.id]);
    await connection.query("DELETE FROM accounts WHERE user_id = ?", [req.user.id]);
    await connection.query("DELETE FROM categories WHERE user_id = ?", [req.user.id]);
    const [result] = await connection.query(
      "DELETE FROM users WHERE id = ?",
      [req.user.id],
    );
    if (result.affectedRows === 0) {
      await connection.rollback();
      return sendError(res, 404, "User not found.");
    }
    await connection.commit();
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error("Account deletion rollback error:", rollbackError);
      }
    }
    console.error("Account deletion error:", error);
    return sendError(res, 500, "Could not delete the account.");
  } finally {
    connection?.release();
  }

  clearAiCache(req.user.id);
  clearSessionCookies(res);
  res.status(200).json({ message: "Account deleted successfully." });
});

export default router;
