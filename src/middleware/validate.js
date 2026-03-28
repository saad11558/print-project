/**
 * PrintShop — Input Validation & Sanitization Middleware
 */

/**
 * Sanitize a string to prevent stored XSS.
 */
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
}

/**
 * Validate email format.
 */
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Middleware factory: require certain body fields.
 * Usage: validateRequired('name', 'email')
 */
function validateRequired(...fields) {
  return (req, res, next) => {
    const missing = fields.filter(f => !req.body[f] && req.body[f] !== 0);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }
    next();
  };
}

module.exports = { sanitize, validateEmail, validateRequired };
