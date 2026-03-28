/**
 * PrintShop — Deadline Reminder Service
 * Centralized cron scheduler that scans active polls
 * and emits room-scoped deadline alerts via Socket.io.
 */
const cron = require('node-cron');
const { readDB, writeDB } = require('../config/db');
const socketService = require('./socket.service');

// Track which alerts have been sent: Set of "pollId:alertType"
const sentAlerts = new Set();

// Alert thresholds in milliseconds
const ALERT_THRESHOLDS = [
  { type: '10min', min: 9.5 * 60 * 1000, max: 10 * 60 * 1000 },
  { type: '5min',  min: 4.5 * 60 * 1000, max: 5 * 60 * 1000 },
  { type: '1min',  min: 0.5 * 60 * 1000, max: 1 * 60 * 1000 },
];

/**
 * Check all active polls and emit deadline alerts.
 */
function checkDeadlines() {
  const now = Date.now();
  const polls = readDB('polls');
  let pollsModified = false;

  polls.forEach(poll => {
    const timeLeft = poll.expiresAt - now;

    // Skip already-expired polls that have been marked
    if (poll.expired) return;

    // Check if poll has expired
    if (timeLeft <= 0) {
      const key = `${poll.id}:expired`;
      if (!sentAlerts.has(key)) {
        sentAlerts.add(key);
        poll.expired = true;
        pollsModified = true;

        socketService.emitToRoom(`poll:${poll.id}`, 'deadline:expired', {
          pollId: poll.id,
          title: poll.title,
          message: 'This poll has expired. No more responses accepted.'
        });

        // Also notify classroom
        socketService.emitToRoom(`classroom:${poll.classroomId}`, 'deadline:expired', {
          pollId: poll.id,
          title: poll.title
        });

        console.log(`[Deadline] Poll "${poll.title}" expired.`);
      }
      return;
    }

    // Check alert thresholds
    ALERT_THRESHOLDS.forEach(threshold => {
      const key = `${poll.id}:${threshold.type}`;
      if (!sentAlerts.has(key) && timeLeft >= threshold.min && timeLeft <= threshold.max) {
        sentAlerts.add(key);

        const event = `deadline:${threshold.type}`;
        const data = {
          pollId: poll.id,
          title: poll.title,
          timeLeft: threshold.type,
          expiresAt: poll.expiresAt,
          message: getAlertMessage(threshold.type, poll.title)
        };

        socketService.emitToRoom(`poll:${poll.id}`, event, data);
        socketService.emitToRoom(`classroom:${poll.classroomId}`, event, data);

        console.log(`[Deadline] Alert "${threshold.type}" sent for poll "${poll.title}"`);
      }
    });
  });

  if (pollsModified) {
    writeDB('polls', polls);
  }
}

function getAlertMessage(type, title) {
  switch (type) {
    case '10min': return `⏰ 10 minutes left for "${title}"!`;
    case '5min':  return `⚠️ Only 5 minutes left for "${title}"!`;
    case '1min':  return `🔴 Last chance! 1 minute left for "${title}"!`;
    default:      return `Deadline alert for "${title}"`;
  }
}

/**
 * Clean up old alert tracking entries for expired polls.
 * Run periodically to prevent memory growth.
 */
function cleanupAlerts() {
  const polls = readDB('polls');
  const activePollIds = new Set(polls.filter(p => !p.expired).map(p => p.id));

  sentAlerts.forEach(key => {
    const pollId = key.split(':')[0];
    if (!activePollIds.has(pollId)) {
      sentAlerts.delete(key);
    }
  });
}

/**
 * Start the deadline scheduler.
 * Runs check every 30 seconds, cleanup every 5 minutes.
 */
function start() {
  // Every 30 seconds: check deadlines
  cron.schedule('*/30 * * * * *', () => {
    try {
      checkDeadlines();
    } catch (e) {
      console.error('[Deadline] Scheduler error:', e.message);
    }
  });

  // Every 5 minutes: cleanup old alerts
  cron.schedule('*/5 * * * *', () => {
    try {
      cleanupAlerts();
    } catch (e) {
      console.error('[Deadline] Cleanup error:', e.message);
    }
  });

  console.log('[Deadline] Scheduler started (30s interval)');
}

module.exports = { start, checkDeadlines, sentAlerts };
