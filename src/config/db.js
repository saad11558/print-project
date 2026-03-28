/**
 * PrintShop — Cached JSON File Database Layer
 * In-memory cache backed by JSON files on disk.
 * Simple mutex prevents concurrent write corruption.
 */
const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, '..', '..', 'db');
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

// ── In-Memory Cache ──
const cache = new Map();

// ── Simple Mutex per collection ──
const locks = new Map();

function acquireLock(name) {
  return new Promise((resolve) => {
    const check = () => {
      if (!locks.get(name)) {
        locks.set(name, true);
        resolve();
      } else {
        setTimeout(check, 5);
      }
    };
    check();
  });
}

function releaseLock(name) {
  locks.set(name, false);
}

function dbPath(name) {
  return path.join(DB_DIR, name + '.json');
}

/**
 * Read a collection. Returns cached data if available.
 */
function readDB(name) {
  if (cache.has(name)) return cache.get(name);
  const p = dbPath(name);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, '[]');
    cache.set(name, []);
    return [];
  }
  try {
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw || raw.trim() === '') {
      cache.set(name, []);
      return [];
    }
    const data = JSON.parse(raw);
    cache.set(name, data);
    return data;
  } catch (e) {
    console.error(`[DB] Error reading ${name}:`, e.message);
    return [];
  }
}

/**
 * Write a collection. Updates cache and persists to disk.
 */
function writeDB(name, data) {
  try {
    cache.set(name, data);
    fs.writeFileSync(dbPath(name), JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`[DB] Error writing ${name}:`, e.message);
    throw e;
  }
}

/**
 * Atomic read-modify-write with mutex lock.
 * Prevents race conditions on concurrent updates.
 * @param {string} name - collection name
 * @param {function} mutator - receives current data array, must return updated array
 * @returns {Promise<*>} - whatever mutator returns
 */
async function atomicUpdate(name, mutator) {
  await acquireLock(name);
  try {
    // Force re-read from file to avoid stale cache during concurrent ops
    cache.delete(name);
    const data = readDB(name);
    const result = mutator(data);
    writeDB(name, data);
    return result;
  } finally {
    releaseLock(name);
  }
}

/**
 * Invalidate cache for a collection (force next read from disk).
 */
function invalidateCache(name) {
  cache.delete(name);
}

module.exports = { readDB, writeDB, atomicUpdate, invalidateCache, DB_DIR };
