/**
 * PrintShop — Socket.io Service
 * Room-based architecture with JWT authentication on connection.
 * No global broadcasts — all events targeted to rooms.
 */
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');
const { readDB } = require('../config/db');

let io = null;
const connectedUsers = new Map(); // socketId → { userId, email, role, rooms: Set }

/**
 * Initialize Socket.io with the HTTP server.
 */
function init(socketIo) {
  io = socketIo;

  // Authenticate sockets via JWT in handshake
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      // Allow unauthenticated connections but mark them
      socket.user = null;
      return next();
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (e) {
      // Allow connection but without user context
      socket.user = null;
      next();
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id} (user: ${socket.user?.email || 'anonymous'})`);

    if (socket.user) {
      connectedUsers.set(socket.id, {
        userId: socket.user.id,
        email: socket.user.email,
        role: socket.user.role,
        rooms: new Set()
      });

      // Auto-join role room
      joinRoom(socket, `role:${socket.user.role}`);

      // Auto-join relevant rooms based on user data
      autoJoinRooms(socket);
    }

    // Client can request to join specific rooms
    socket.on('join:rooms', (data) => {
      if (!socket.user) return;
      if (data.pollIds) {
        data.pollIds.forEach(id => joinRoom(socket, `poll:${id}`));
      }
      if (data.orderIds) {
        data.orderIds.forEach(id => joinRoom(socket, `order:${id}`));
      }
      if (data.classroomIds) {
        data.classroomIds.forEach(id => joinRoom(socket, `classroom:${id}`));
      }
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      connectedUsers.delete(socket.id);
    });
  });

  // Ping interval for detecting stale connections
  setInterval(() => {
    io.sockets.sockets.forEach((socket) => {
      if (!socket.connected) {
        connectedUsers.delete(socket.id);
      }
    });
  }, 30000);
}

/**
 * Auto-join rooms based on the user's classrooms/polls/orders.
 */
function autoJoinRooms(socket) {
  if (!socket.user) return;
  const { email, role } = socket.user;

  try {
    const classrooms = readDB('classrooms');
    const polls = readDB('polls');
    const orders = readDB('orders');

    // Join classroom rooms
    if (role === 'coordinator') {
      classrooms.filter(c => c.createdBy === email).forEach(c => {
        joinRoom(socket, `classroom:${c.id}`);
      });
    } else if (role === 'student') {
      classrooms.filter(c => c.joinedUsers && c.joinedUsers.includes(email)).forEach(c => {
        joinRoom(socket, `classroom:${c.id}`);
      });
    } else if (role === 'shop') {
      // Shop joins all classroom rooms
      classrooms.forEach(c => joinRoom(socket, `classroom:${c.id}`));
    }

    // Join poll rooms for active polls
    const now = Date.now();
    polls.filter(p => p.expiresAt > now).forEach(p => {
      joinRoom(socket, `poll:${p.id}`);
    });

    // Join order rooms for active orders
    orders.filter(o => o.status !== 'collected').forEach(o => {
      joinRoom(socket, `order:${o.id}`);
    });
  } catch (e) {
    console.error('[Socket] Error auto-joining rooms:', e.message);
  }
}

/**
 * Join a socket to a room and track it.
 */
function joinRoom(socket, room) {
  socket.join(room);
  const userData = connectedUsers.get(socket.id);
  if (userData) userData.rooms.add(room);
}

// ── Emit Helpers ─────────────────────────────────

/**
 * Emit to a specific room only.
 */
function emitToRoom(room, event, data) {
  if (!io) return;
  io.to(room).emit(event, data);
}

/**
 * Emit to all sockets of a specific user (by email).
 */
function emitToUser(email, event, data) {
  if (!io) return;
  connectedUsers.forEach((userData, socketId) => {
    if (userData.email === email) {
      io.to(socketId).emit(event, data);
    }
  });
}

/**
 * Emit to all sockets of a specific role.
 */
function emitToRole(role, event, data) {
  emitToRoom(`role:${role}`, event, data);
}

/**
 * Broadcast to everyone (use sparingly — only for truly global events).
 */
function emitGlobal(event, data) {
  if (!io) return;
  io.emit(event, data);
}

/**
 * Get the io instance.
 */
function getIO() {
  return io;
}

module.exports = {
  init,
  emitToRoom,
  emitToUser,
  emitToRole,
  emitGlobal,
  getIO,
  joinRoom,
  connectedUsers
};
