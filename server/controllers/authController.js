const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// Local user directory
const LOCAL_USER_DB = path.join(__dirname, '../data/users.json');

// Ensure local DB file exists
if (!fs.existsSync(LOCAL_USER_DB)) {
  fs.writeFileSync(LOCAL_USER_DB, JSON.stringify([]));
}

// Helper: Load local users
const loadLocalUsers = () => {
  try {
    return JSON.parse(fs.readFileSync(LOCAL_USER_DB, 'utf8'));
  } catch (e) {
    return [];
  }
};

// Helper: Save local users
const saveLocalUsers = (users) => {
  fs.writeFileSync(LOCAL_USER_DB, JSON.stringify(users, null, 2));
};

// Helper: Generate JWT
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });
};

// -----------------------------------------------------------
// ✅ REGISTER USER
// Admin → saved in MongoDB
// Others → saved locally in /data/users.json
// -----------------------------------------------------------
exports.registerUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: 'All fields are required' });

    // If role is admin → save to MongoDB
    if (role === "admin") {
      const existingUser = await User.findOne({ email });
      if (existingUser)
        return res.status(400).json({ message: 'Admin already exists' });

      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(password, salt);

      const user = await User.create({
        name,
        email,
        password: hashedPassword,
        role: "admin",
      });

      const token = generateToken(user._id, "admin");

      return res.status(201).json({
        success: true,
        message: 'Admin registered & saved in MongoDB',
        token,
        user: user.toJSON(),
      });
    }

    // Otherwise → save in local file
    const users = loadLocalUsers();

    const existingLocal = users.find((u) => u.email === email);
    if (existingLocal)
      return res.status(400).json({ message: "User already exists locally" });

    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = {
      id: Date.now().toString(),
      name,
      email,
      password: hashedPassword,
      role: role || "staff",
      createdAt: new Date(),
    };

    users.push(newUser);
    saveLocalUsers(users);

    const token = generateToken(newUser.id, newUser.role);

    return res.status(201).json({
      success: true,
      message: "User registered & saved locally",
      token,
      user: newUser,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during registration' });
  }
};

// -----------------------------------------------------------
// ✅ LOGIN USER
// 1. Check MongoDB (admin)
// 2. If not found → check local users JSON
// -----------------------------------------------------------
exports.loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: 'Email and password required' });

    // ------------------------
    // 1. TRY MONGODB (ADMIN)
    // ------------------------
    let user = await User.findOne({ email }).select('+password');

    if (user) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch)
        return res.status(401).json({ message: 'Invalid credentials' });

      user.lastLogin = new Date();
      await user.save();

      const token = generateToken(user._id, "admin");

      return res.json({
        success: true,
        message: 'Admin login successful (MongoDB)',
        token,
        user: user.toJSON(),
      });
    }

    // ------------------------
    // 2. TRY LOCAL USERS
    // ------------------------
    const users = loadLocalUsers();
    const localUser = users.find((u) => u.email === email);

    if (!localUser)
      return res.status(401).json({ message: 'Invalid credentials' });

    const isMatchLocal = await bcrypt.compare(password, localUser.password);
    if (!isMatchLocal)
      return res.status(401).json({ message: 'Invalid credentials' });

    const token = generateToken(localUser.id, localUser.role);

    return res.json({
      success: true,
      message: "Local user login successful",
      token,
      user: localUser,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during login' });
  }
};
