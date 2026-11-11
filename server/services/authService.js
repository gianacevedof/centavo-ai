import argon2 from 'argon2';
import jwt from 'jsonwebtoken';

/**
 * Hashes a password using argon2.
 * @param {string} password - The plain text password to hash.
 * @returns {Promise<string>} The hashed password.
 */
export const hashPassword = async (password) => {
  return await argon2.hash(password);
};

/**
 * Verifies a password against a hash using argon2.
 * @param {string} hash - The hashed password.
 * @param {string} password - The plain text password to verify.
 * @returns {Promise<boolean>} True if the password matches the hash, false otherwise.
 */
export const verifyPassword = async (hash, password) => {
  return await argon2.verify(hash, password);
};

const ACCESS_TTL = "15m";
const REFRESH_TTL = "7d";

const getSecret = () => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in environment variables");
  }
  return process.env.JWT_SECRET;
};

/**
 * Short-lived token that authenticates normal API requests.
 * @param {Object} user - The user object containing id and email.
 * @returns {string} The signed access token.
 */
export const generateAccessToken = (user) =>
  jwt.sign({ id: user.id, email: user.email, type: "access" }, getSecret(), {
    expiresIn: ACCESS_TTL,
  });

/**
 * Longer-lived token that is only used to get a new access token.
 * @param {Object} user - The user object containing id.
 * @returns {string} The signed refresh token.
 */
export const generateRefreshToken = (user) =>
  jwt.sign({ id: user.id, type: "refresh" }, getSecret(), {
    expiresIn: REFRESH_TTL,
  });

/**
 * Checks a refresh token.
 * @param {string} token - The refresh token from the cookie.
 * @returns {Object|null} The decoded payload, or null if invalid or expired.
 */
export const verifyRefreshToken = (token) => {
  try {
    const payload = jwt.verify(token, getSecret());
    return payload.type === "refresh" ? payload : null;
  } catch {
    return null;
  }
};
