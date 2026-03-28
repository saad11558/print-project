/**
 * PrintShop — Order Controller
 * Full lifecycle: pending → printing → ready → collected
 * With concurrency locks, collection tracking, and status history.
 */
const { readDB, writeDB, atomicUpdate } = require('../config/db');
const { genId } = require('../utils/helpers');
const socketService = require('../services/socket.service');

// Valid status transitions (strict sequential)
const VALID_TRANSITIONS = {
  pending: ['printing'],
  printing: ['ready'],
  ready: ['collected'],
  collected: []
};

function getOrders(req, res) {
  const orders = readDB('orders');
  if (req.user.role === 'student') {
    return res.json(orders.filter(o => o.studentEmail === req.user.email));
  }
  if (req.user.role === 'coordinator') {
    const classrooms = readDB('classrooms');
    const myClassrooms = classrooms.filter(c => c.createdBy === req.user.email).map(c => c.id);
    return res.json(orders.filter(o => myClassrooms.includes(o.classroomId)));
  }
  // Shop sees all
  res.json(orders);
}

function getOrderById(req, res) {
  const orders = readDB('orders');
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // Access control
  if (req.user.role === 'student' && order.studentEmail !== req.user.email) {
    return res.status(403).json({ error: 'Access denied' });
  }

  res.json(order);
}

function getPendingPickups(req, res) {
  const orders = readDB('orders');
  const order = orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  // For single-student orders, check if collected
  const isPending = order.status === 'ready' && (!order.collectedBy || order.collectedBy.length === 0);
  res.json({
    orderId: order.id,
    status: order.status,
    pending: isPending ? [{ email: order.studentEmail, name: order.student }] : [],
    collected: order.collectedBy || []
  });
}

async function updateOrderStatus(req, res) {
  const { status } = req.body;
  const orderId = req.params.id;

  if (!status) {
    return res.status(400).json({ error: 'Status is required' });
  }

  const validStatuses = ['pending', 'printing', 'ready', 'collected'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status. Must be one of: ' + validStatuses.join(', ') });
  }

  try {
    const result = await atomicUpdate('orders', (orders) => {
      const order = orders.find(o => o.id === orderId);
      if (!order) return { error: 'Order not found', status: 404 };

      // Enforce sequential transitions
      const allowed = VALID_TRANSITIONS[order.status];
      if (!allowed || !allowed.includes(status)) {
        return {
          error: `Cannot transition from "${order.status}" to "${status}". Allowed: ${allowed?.join(', ') || 'none'}`,
          status: 400
        };
      }

      // Prevent processing on unverified payments
      if (['printing', 'ready', 'collected'].includes(status) && order.paymentStatus !== 'verified') {
        return { error: 'Cannot process order: payment not yet verified', status: 400 };
      }

      const oldStatus = order.status;
      order.status = status;
      order.updatedAt = Date.now();

      // Track status history
      if (!order.statusHistory) order.statusHistory = [];
      order.statusHistory.push({
        from: oldStatus,
        to: status,
        at: Date.now(),
        by: req.user.email
      });

      return { success: true, order, oldStatus };
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    // Emit to order room
    socketService.emitToRoom(`order:${orderId}`, 'status_updated', {
      orderId,
      oldStatus: result.oldStatus,
      newStatus: status,
      updatedBy: req.user.email,
      order: result.order
    });
    // Global compat
    socketService.emitGlobal('order-updated', { order: result.order });

    res.json({ success: true, order: result.order });
  } catch (e) {
    console.error('[Order] Status update error:', e);
    res.status(500).json({ error: 'Failed to update order status' });
  }
}

async function collectOrder(req, res) {
  const orderId = req.params.id;
  const { studentEmail } = req.body;

  if (!studentEmail) {
    return res.status(400).json({ error: 'Student email is required' });
  }

  try {
    const result = await atomicUpdate('orders', (orders) => {
      const order = orders.find(o => o.id === orderId);
      if (!order) return { error: 'Order not found', status: 404 };

      if (order.status !== 'ready') {
        return { error: 'Order must be in "ready" status to collect', status: 400 };
      }

      // For single-student orders, verify the email matches
      if (order.studentEmail !== studentEmail) {
        return { error: 'Student email does not match this order', status: 400 };
      }

      // Initialize collectedBy if not present
      if (!order.collectedBy) order.collectedBy = [];

      // Prevent duplicate collection
      const alreadyCollected = order.collectedBy.find(c => c.email === studentEmail);
      if (alreadyCollected) {
        return { error: 'This student has already collected their order', status: 400 };
      }

      order.collectedBy.push({
        email: studentEmail,
        collectedAt: Date.now(),
        markedBy: req.user.email
      });

      // Auto-transition to collected
      const oldStatus = order.status;
      order.status = 'collected';
      order.updatedAt = Date.now();

      if (!order.statusHistory) order.statusHistory = [];
      order.statusHistory.push({
        from: oldStatus,
        to: 'collected',
        at: Date.now(),
        by: req.user.email
      });

      return { success: true, order };
    });

    if (result.error) {
      return res.status(result.status).json({ error: result.error });
    }

    socketService.emitToRoom(`order:${orderId}`, 'order_collected', {
      orderId,
      studentEmail,
      order: result.order
    });
    socketService.emitGlobal('order-updated', { order: result.order });

    // Also notify the student directly
    socketService.emitToUser(studentEmail, 'order_collected', {
      orderId,
      message: 'Your order has been collected!'
    });

    res.json({ success: true, order: result.order });
  } catch (e) {
    console.error('[Order] Collection error:', e);
    res.status(500).json({ error: 'Failed to process collection' });
  }
}

module.exports = { getOrders, getOrderById, getPendingPickups, updateOrderStatus, collectOrder };
