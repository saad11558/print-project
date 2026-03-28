const express = require('express');
const router = express.Router();
const { authMiddleware, roleGuard } = require('../middleware/auth');
const ctrl = require('../controllers/order.controller');

router.get('/', authMiddleware, ctrl.getOrders);
router.get('/:id', authMiddleware, ctrl.getOrderById);
router.get('/:id/pending', authMiddleware, roleGuard('shop', 'coordinator'), ctrl.getPendingPickups);

// PATCH for status updates (new), PUT for backward compat
router.patch('/:id/status', authMiddleware, roleGuard('shop', 'coordinator'), ctrl.updateOrderStatus);
router.put('/:id/status', authMiddleware, roleGuard('shop', 'coordinator'), ctrl.updateOrderStatus);

// Collection endpoint
router.post('/:id/collect', authMiddleware, roleGuard('shop', 'coordinator'), ctrl.collectOrder);

module.exports = router;
