/**
 * PrintShop — Poll Controller
 */
const { readDB, writeDB } = require('../config/db');
const { sanitize } = require('../middleware/validate');
const { genId } = require('../utils/helpers');
const socketService = require('../services/socket.service');

function createPoll(req, res) {
  const { classroomId, title, desc, price, duration, document: doc, qrCode } = req.body;
  if (!classroomId || !title || !price) {
    return res.status(400).json({ error: 'Classroom, title, and price are required' });
  }

  const priceNum = parseInt(price);
  if (isNaN(priceNum) || priceNum < 1) {
    return res.status(400).json({ error: 'Price must be a positive number' });
  }

  const classrooms = readDB('classrooms');
  const classroom = classrooms.find(c => c.id === classroomId);

  if (!classroom) {
    return res.status(404).json({ error: 'Classroom not found' });
  }
  if (classroom.createdBy !== req.user.email) {
    return res.status(403).json({ error: 'You do not own this classroom' });
  }

  const durationMins = parseInt(duration) || 60;
  const polls = readDB('polls');
  const poll = {
    id: genId(),
    classroomId,
    title: sanitize(title),
    desc: sanitize(desc || ''),
    price: priceNum,
    createdAt: Date.now(),
    expiresAt: Date.now() + durationMins * 60000,
    document: doc || null,
    qrCode: qrCode || null,
    responses: [],
    createdBy: req.user.email,
    expired: false
  };
  polls.push(poll);
  writeDB('polls', polls);

  socketService.emitToRoom(`classroom:${classroomId}`, 'poll-created', { poll, classroomName: classroom.name });
  // Global compat
  socketService.emitGlobal('poll-created', { poll, classroomName: classroom.name });

  res.status(201).json({ success: true, poll });
}

function getPolls(req, res) {
  const polls = readDB('polls');
  const classrooms = readDB('classrooms');
  const participants = readDB('participants');

  let result = polls;
  if (req.user.role === 'coordinator') {
    const myClassrooms = classrooms.filter(c => c.createdBy === req.user.email).map(c => c.id);
    result = polls.filter(p => myClassrooms.includes(p.classroomId));
  } else if (req.user.role === 'student') {
    const myClassrooms = classrooms.filter(c => c.joinedUsers && c.joinedUsers.includes(req.user.email)).map(c => c.id);
    result = polls.filter(p => myClassrooms.includes(p.classroomId));
  }

  // Attach user's participant status
  const mapped = result.map(p => {
    const myPart = participants.find(part => part.pollId === p.id && part.userId === req.user.email);
    return { ...p, participantStatus: myPart ? myPart.status : 'not_joined' };
  });

  res.json(mapped);
}

// Poll participation
function joinPoll(req, res) {
  const pollId = req.params.id;
  const participants = readDB('participants');
  const polls = readDB('polls');

  const poll = polls.find(p => p.id === pollId);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });

  // Check if poll has expired
  if (poll.expiresAt < Date.now() || poll.expired) {
    return res.status(400).json({ error: 'This poll has expired' });
  }

  const existing = participants.find(p => p.pollId === pollId && p.userId === req.user.email);
  if (existing) return res.status(400).json({ error: 'Already joined this poll' });

  const participant = {
    id: genId(),
    pollId,
    userId: req.user.email,
    userName: req.user.name,
    status: 'joined',
    joinedAt: Date.now()
  };
  participants.push(participant);
  writeDB('participants', participants);

  socketService.emitToRoom(`poll:${pollId}`, 'poll-participation', { pollId, action: 'joined', participant });
  socketService.emitGlobal('poll-participation', { pollId, action: 'joined', participant });

  res.json({ success: true, participant });
}

function leavePoll(req, res) {
  const pollId = req.params.id;
  let participants = readDB('participants');

  const existing = participants.find(p => p.pollId === pollId && p.userId === req.user.email);
  if (!existing) return res.status(400).json({ error: 'Not joined in this poll' });

  if (existing.status !== 'joined') {
    return res.status(400).json({ error: 'Cannot leave poll after payment is submitted or verified' });
  }

  participants = participants.filter(p => !(p.pollId === pollId && p.userId === req.user.email));
  writeDB('participants', participants);

  socketService.emitToRoom(`poll:${pollId}`, 'poll-participation', { pollId, action: 'left', userId: req.user.email });
  socketService.emitGlobal('poll-participation', { pollId, action: 'left', userId: req.user.email });

  res.json({ success: true });
}

function getParticipants(req, res) {
  const pollId = req.params.id;
  const participants = readDB('participants');
  res.json(participants.filter(p => p.pollId === pollId));
}

module.exports = { createPoll, getPolls, joinPoll, leavePoll, getParticipants };
