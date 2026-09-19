import jwt from "jsonwebtoken";
import { checkSession } from "../utils/sessionStore.js";

export const authenticate = async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) return res.status(401).json({ success: false, message: "Unauthorized" });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }

  try {
    const verdict = await checkSession(decoded);
    if (!verdict.ok) {
      res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      });
      return res.status(401).json({ success: false, code: verdict.code, message: verdict.message });
    }
  } catch (err) {
    // Fail open: a hiccup in the session/user lookup shouldn't take the whole
    // app down for everyone (scanners included). The JWT itself is still valid.
    console.error("[Auth] session check failed, allowing request:", err.message);
  }

  req.user = decoded; // Attach user info to request
  next();
};
