const express = require('express');
const router = express.Router();
const { authMiddleware, roleGuard } = require('../middleware/auth');
const ctrl = require('../controllers/classroom.controller');

router.post('/', authMiddleware, roleGuard('coordinator'), ctrl.createClassroom);
router.get('/', authMiddleware, ctrl.getClassrooms);
router.get('/all', authMiddleware, ctrl.getAllClassrooms);
router.post('/join', authMiddleware, roleGuard('student'), ctrl.joinClassroom);

module.exports = router;
