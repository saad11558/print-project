/**
 * PrintShop — Auth Controller
 */
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { readDB, writeDB } = require('../config/db');
const { sanitize, validateEmail } = require('../middleware/validate');
const { genId } = require('../utils/helpers');
const { JWT_SECRET } = require('../middleware/auth');

async function signup(req, res) {
  const { name, email, password, role, accessKey } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const allowedRoles = ['student', 'coordinator', 'shop'];
  const userRole = allowedRoles.includes(role) ? role : 'student';
  const users = readDB('users');

  if (users.find(u => u.email === email && u.role === userRole)) {
    return res.status(400).json({ error: 'Email already registered for this role' });
  }

  // Coordinator access key validation
  if (userRole === 'coordinator') {
    if (!accessKey) {
      return res.status(400).json({ error: 'Coordinator access key is required' });
    }
    const keys = readDB('keys');
    const keyIndex = keys.findIndex(k => k.key === accessKey);
    if (keyIndex === -1) {
      return res.status(400).json({ error: 'Invalid access key' });
    }
    if (keys[keyIndex].used) {
      return res.status(400).json({ error: 'This access key has already been used' });
    }
    keys[keyIndex].used = true;
    writeDB('keys', keys);
  }

  const hashed = await bcrypt.hash(password, 10);
  const user = {
    id: genId(),
    name: sanitize(name),
    email: email.toLowerCase().trim(),
    password: hashed,
    role: userRole,
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeDB('users', users);
  res.status(201).json({ success: true, message: 'Signup successful' });
}

async function login(req, res) {
  const { email, password, role } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const users = readDB('users');
  const user = users.find(u => u.email === normalizedEmail && u.role === role);

  // Constant-time comparison to prevent timing attacks
  const dummyHash = '$2a$10$invalidhashforstupidtimingattacks.........';
  const isValid = user
    ? await bcrypt.compare(password, user.password)
    : await bcrypt.compare(password, dummyHash).then(() => false);

  if (!user || !isValid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
  res.json({
    success: true,
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role }
  });
}

function verifyToken(req, res) {
  res.json({ valid: true, user: req.user });
}

// Forgot / Reset password
const resetTokens = {};

// Cleanup expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const token in resetTokens) {
    if (resetTokens[token].expiresAt < now) {
      delete resetTokens[token];
    }
  }
}, 5 * 60 * 1000);

async function forgotPassword(req, res) {
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const users = readDB('users');
  const user = users.find(u => u.email === email.toLowerCase().trim() && u.role === (role || 'student'));

  // Always return success to prevent user enumeration
  if (!user) {
    return res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
  }

  const { v4: uuidv4 } = require('uuid');
  const token = uuidv4().replace(/-/g, '').slice(0, 20);
  resetTokens[token] = { email: user.email, role: user.role, expiresAt: Date.now() + 15 * 60000 };

  const PORT = process.env.PORT || 3000;
  console.log('\n  ============================================');
  console.log('  📧 PASSWORD RESET EMAIL (Demo)');
  console.log(`  To: ${user.email}`);
  console.log(`  Token: ${token}`);
  console.log(`  Link: http://localhost:${PORT}/reset-password.html?token=${token}`);
  console.log('  ============================================\n');

  res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
}

async function resetPassword(req, res) {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password are required' });
  if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const entry = resetTokens[token];
  if (!entry || Date.now() > entry.expiresAt) {
    return res.status(400).json({ error: 'Invalid or expired reset token' });
  }

  const users = readDB('users');
  const user = users.find(u => u.email === entry.email && u.role === entry.role);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.password = await bcrypt.hash(newPassword, 10);
  writeDB('users', users);
  delete resetTokens[token];
  res.json({ success: true, message: 'Password reset successful. You can now login.' });
}

module.exports = { signup, login, verifyToken, forgotPassword, resetPassword };
