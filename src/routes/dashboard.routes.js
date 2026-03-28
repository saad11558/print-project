const express = require('express');
const router = express.Router();
const { authMiddleware, roleGuard } = require('../middleware/auth');
const ctrl = require('../controllers/dashboard.controller');

router.get('/shop', authMiddleware, roleGuard('shop'), ctrl.getShopDashboard);
router.get('/server-time', ctrl.getServerTime);

module.exports = router;
