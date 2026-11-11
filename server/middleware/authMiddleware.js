import jwt from "jsonwebtoken";

const expired = (res) =>
  res.status(401).json({
    message: "Your session has expired. Please log in again.",
    code: "TOKEN_EXPIRED",
  });

/**
 * Verifies the access token cookie and attaches the user to the request.
 * Responds with code TOKEN_EXPIRED when the client should try /auth/refresh.
 */
export const authMiddleware = (req, res, next) => {
  const token = req.cookies.access_token;
  if (!token) return expired(res);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== "access") return expired(res);
    req.user = decoded;
    next();
  } catch {
    return expired(res);
  }
};
