/**
 * PrintShop — Utility Helpers
 */
const { v4: uuidv4 } = require('uuid');

function genId() {
  return uuidv4();
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function genUniqueCode(existingCodes) {
  let code;
  let attempts = 0;
  do {
    code = genCode();
    attempts++;
  } while (existingCodes.includes(code) && attempts < 100);
  return code;
}

function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return 'Just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  return new Date(ts).toLocaleDateString();
}

module.exports = { genId, genCode, genUniqueCode, timeAgo };
