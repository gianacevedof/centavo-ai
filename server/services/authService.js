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

/**
 * Generates a JWT token for a user.
 * @param {Object} user - The user object containing id and email.
 * @returns {string} The generated JWT token.
 * @throws {Error} If JWT_SECRET is not defined in environment variables.
 */
export const generateToken = (user) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};
