const express = require('express');
const router = express.Router();
const { authMiddleware, roleGuard } = require('../middleware/auth');
const ctrl = require('../controllers/payment.controller');

router.post('/confirm', authMiddleware, roleGuard('student'), ctrl.confirmPayment);
router.put('/:id/verify', authMiddleware, roleGuard('shop'), ctrl.verifyPayment);
router.get('/', authMiddleware, ctrl.getPayments);

module.exports = router;
