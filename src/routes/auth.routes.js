const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');

router.post('/signup', ctrl.signup);
router.post('/login', ctrl.login);
router.get('/verify-token', authMiddleware, ctrl.verifyToken);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);

module.exports = router;
