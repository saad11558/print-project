/**
 * PrintShop Server — Entry Point
 * Thin bootstrapper that mounts routes, initializes Socket.io, and starts the deadline scheduler.
 */
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// ── Services ──
const socketService = require('./src/services/socket.service');
const deadlineService = require('./src/services/deadline.service');

// ── Middleware ──
const { errorHandler } = require('./src/middleware/errorHandler');

// ── Routes ──
const authRoutes = require('./src/routes/auth.routes');
const classroomRoutes = require('./src/routes/classroom.routes');
const pollRoutes = require('./src/routes/poll.routes');
const orderRoutes = require('./src/routes/order.routes');
const paymentRoutes = require('./src/routes/payment.routes');
const dashboardRoutes = require('./src/routes/dashboard.routes');

// ── App Setup ──
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;

// ── Global Middleware ──
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// ── Mount API Routes ──
app.use('/api', authRoutes);
app.use('/api/classrooms', classroomRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Server-time endpoint (also on /api for consistency)
app.get('/api/server-time', (req, res) => {
  const { readDB } = require('./src/config/db');
  const polls = readDB('polls');
  const activePolls = polls
    .filter(p => !p.expired)
    .map(p => ({ id: p.id, expiresAt: p.expiresAt, title: p.title }));
  res.json({ serverTime: Date.now(), polls: activePolls });
});

// ── 404 handler for API routes ──
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// ── Centralized Error Handler ──
app.use(errorHandler);

// ── Initialize Socket.io ──
socketService.init(io);

// ── Start Deadline Scheduler ──
deadlineService.start();

// ── Start Server ──
server.listen(PORT, () => {
  console.log(`\n  🖨️  PrintShop Server running on http://localhost:${PORT}\n`);
  console.log(`  📁 Database: ${path.join(__dirname, 'db')}`);
  console.log(`  🔐 JWT: Enabled`);
  console.log(`  ⚡ Socket.io: Rooms-based architecture`);
  console.log(`  ⏰ Deadline Scheduler: Active (30s interval)`);
  console.log(`  📦 MVC: controllers / routes / services / middleware\n`);
});