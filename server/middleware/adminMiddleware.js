module.exports = (req, res, next) => {
  // Ensure user exists (should already be set by protect middleware)
  if (!req.user) {
    return res.status(401).json({ message: "Not authorized" });
  }

  // Only allow admin users
  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access only" });
  }

  // ✅ User is admin, proceed
  next();
};
