/**
 * PrintShop — Classroom Controller
 */
const { readDB, writeDB } = require('../config/db');
const { sanitize } = require('../middleware/validate');
const { genId, genUniqueCode } = require('../utils/helpers');
const socketService = require('../services/socket.service');

function createClassroom(req, res) {
  const { name, subject, semester } = req.body;
  if (!name || !subject) {
    return res.status(400).json({ error: 'Name and subject are required' });
  }
  const semNum = parseInt(semester);
  if (isNaN(semNum) || semNum < 1 || semNum > 8) {
    return res.status(400).json({ error: 'Semester must be between 1 and 8' });
  }

  const classrooms = readDB('classrooms');
  const existingCodes = classrooms.map(c => c.code);
  const code = genUniqueCode(existingCodes);

  const classroom = {
    id: genId(),
    name: sanitize(name),
    subject: sanitize(subject),
    semester: semNum,
    code,
    cr: req.user.name,
    createdBy: req.user.email,
    joinedUsers: [],
    createdAt: new Date().toISOString()
  };
  classrooms.push(classroom);
  writeDB('classrooms', classrooms);

  socketService.emitGlobal('classroom-created', classroom);
  res.status(201).json({ success: true, classroom });
}

function getClassrooms(req, res) {
  const classrooms = readDB('classrooms');
  if (req.user.role === 'coordinator') {
    return res.json(classrooms.filter(c => c.createdBy === req.user.email));
  }
  if (req.user.role === 'student') {
    return res.json(classrooms.filter(c => c.joinedUsers && c.joinedUsers.includes(req.user.email)));
  }
  // Shop sees all
  res.json(classrooms);
}

function getAllClassrooms(req, res) {
  res.json(readDB('classrooms'));
}

function joinClassroom(req, res) {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code is required' });

  const classrooms = readDB('classrooms');
  const cl = classrooms.find(c => c.code === code.toUpperCase().trim());
  if (!cl) return res.status(404).json({ error: 'Invalid code. No classroom found.' });

  if (!cl.joinedUsers) cl.joinedUsers = [];
  if (cl.joinedUsers.includes(req.user.email)) {
    return res.status(400).json({ error: `You are already in ${cl.name}` });
  }
  cl.joinedUsers.push(req.user.email);
  writeDB('classrooms', classrooms);

  socketService.emitToRoom(`classroom:${cl.id}`, 'student-joined', {
    classroom: cl.name,
    student: req.user.name,
    classroomId: cl.id
  });
  // Also emit globally for backward compat
  socketService.emitGlobal('student-joined', {
    classroom: cl.name,
    student: req.user.name,
    classroomId: cl.id
  });

  res.json({ success: true, classroom: cl });
}

module.exports = { createClassroom, getClassrooms, getAllClassrooms, joinClassroom };
