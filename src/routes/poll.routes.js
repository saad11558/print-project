const express = require('express');
const router = express.Router();
const { authMiddleware, roleGuard } = require('../middleware/auth');
const ctrl = require('../controllers/poll.controller');

router.post('/', authMiddleware, roleGuard('coordinator'), ctrl.createPoll);
router.get('/', authMiddleware, ctrl.getPolls);
router.post('/:id/join', authMiddleware, ctrl.joinPoll);
router.post('/:id/leave', authMiddleware, ctrl.leavePoll);
router.get('/:id/participants', authMiddleware, ctrl.getParticipants);

module.exports = router;
