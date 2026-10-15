import jwt from 'jsonwebtoken';

/**
 * Middleware to verify JWT from cookies and attach user identity to the request.
 */
export const authMiddleware = (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({ message: "Your session has expired. Please log in again." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Your session has expired. Please log in again." });
  }
};
