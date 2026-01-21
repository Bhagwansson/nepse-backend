const jwt = require("jsonwebtoken");
const User = require("../models/User");

const optionalAuth = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id); // User is Logged In
    } catch (error) {
      console.log("Token invalid, treating as Guest");
      req.user = null; // Token failed, treat as Guest
    }
  } else {
    req.user = null; // No token, treat as Guest
  }
  next();
};

module.exports = { optionalAuth };
