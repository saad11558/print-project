/**
 * PrintShop — Payment Controller
 */
const { readDB, writeDB, atomicUpdate } = require('../config/db');
const { genId } = require('../utils/helpers');
const socketService = require('../services/socket.service');

async function confirmPayment(req, res) {
  const { pollId, method } = req.body;
  if (!pollId) return res.status(400).json({ error: 'Poll ID is required' });

  const polls = readDB('polls');
  const orders = readDB('orders');
  const classrooms = readDB('classrooms');

  const poll = polls.find(p => p.id === pollId);
  if (!poll) return res.status(404).json({ error: 'Poll not found' });

  if (poll.expiresAt < Date.now() || poll.expired) {
    return res.status(400).json({ error: 'This poll has expired' });
  }

  const classroom = classrooms.find(c => c.id === poll.classroomId);
  if (!classroom || !classroom.joinedUsers || !classroom.joinedUsers.includes(req.user.email)) {
    return res.status(403).json({ error: 'You are not a member of this classroom' });
  }

  const participants = readDB('participants');
  const participant = participants.find(p => p.pollId === pollId && p.userId === req.user.email);
  if (!participant) return res.status(400).json({ error: 'You must join the poll before paying' });
  if (participant.status === 'paid' || participant.status === 'verified') {
    return res.status(400).json({ error: 'Already submitted payment for this poll' });
  }

  const existingOrder = orders.find(o => o.pollId === pollId && o.studentEmail === req.user.email);
  if (existingOrder) {
    return res.status(400).json({ error: 'You already have an order for this poll' });
  }

  // Update participant status
  participant.status = 'paid';
  participant.paidAt = Date.now();
  writeDB('participants', participants);

  // Update or add response in poll
  let response = poll.responses.find(r => r.studentEmail === req.user.email);
  if (response) {
    response.paid = true;
    response.paidAt = Date.now();
    response.verified = false;
  } else {
    response = {
      student: req.user.name,
      studentEmail: req.user.email,
      paid: true,
      paidAt: Date.now(),
      verified: false
    };
    poll.responses.push(response);
  }
  writeDB('polls', polls);

  const doc = poll.document || { name: 'document.pdf', pages: 10 };
  const txnId = 'TXN_' + Math.random().toString(36).slice(2, 8).toUpperCase() + '_' + genId().slice(0, 4).toUpperCase();

  const order = {
    id: genId(),
    student: req.user.name,
    studentEmail: req.user.email,
    pollId: poll.id,
    poll: poll.title,
    file: doc.name,
    pages: doc.pages || 10,
    price: poll.price,
    status: 'pending',
    paymentStatus: 'submitted',
    classroom: classroom?.name || '',
    classroomId: poll.classroomId,
    subject: classroom?.subject || '',
    semester: classroom?.semester || 0,
    txnId,
    method: method || 'qr',
    createdAt: Date.now(),
    collectedBy: [],
    statusHistory: [{ from: null, to: 'pending', at: Date.now(), by: 'system' }]
  };
  orders.push(order);
  writeDB('orders', orders);

  const payments = readDB('payments');
  const payment = {
    id: genId(),
    orderId: order.id,
    studentName: req.user.name,
    studentEmail: req.user.email,
    amount: poll.price,
    method: method || 'qr',
    txnId,
    status: 'submitted',
    pollTitle: poll.title,
    classroom: classroom?.name || '',
    createdAt: Date.now()
  };
  payments.push(payment);
  writeDB('payments', payments);

  // Emit to relevant rooms
  const eventData = {
    student: req.user.name,
    pollTitle: poll.title,
    amount: poll.price,
    classroom: classroom?.name,
    txnId,
    paymentId: payment.id,
    order
  };
  socketService.emitToRoom(`poll:${pollId}`, 'payment-submitted', eventData);
  socketService.emitToRole('shop', 'payment-submitted', eventData);
  socketService.emitGlobal('payment-submitted', eventData);

  res.json({ success: true, txnId, order, paymentId: payment.id });
}

async function verifyPayment(req, res) {
  const { action } = req.body;
  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Action must be approve or reject' });
  }

  const payments = readDB('payments');
  const orders = readDB('orders');
  const polls = readDB('polls');

  const payment = payments.find(p => p.id === req.params.id);
  if (!payment) return res.status(404).json({ error: 'Payment not found' });

  if (payment.status === 'verified') {
    return res.status(400).json({ error: 'Payment already verified' });
  }
  if (payment.status === 'rejected') {
    return res.status(400).json({ error: 'Payment already rejected' });
  }

  const order = orders.find(o => o.id === payment.orderId);

  if (action === 'approve') {
    payment.status = 'verified';
    payment.verifiedAt = Date.now();
    payment.verifiedBy = req.user.name;

    if (order) order.paymentStatus = 'verified';

    const participants = readDB('participants');
    if (order) {
      const participant = participants.find(p => p.pollId === order.pollId && p.userId === payment.studentEmail);
      if (participant) participant.status = 'verified';
      writeDB('participants', participants);

      const poll = polls.find(p => p.id === order.pollId);
      if (poll) {
        const resp = poll.responses.find(r => r.studentEmail === payment.studentEmail);
        if (resp) resp.verified = true;
      }
    }
    writeDB('polls', polls);

    socketService.emitToUser(payment.studentEmail, 'payment-verified', {
      student: payment.studentName,
      studentEmail: payment.studentEmail,
      pollTitle: payment.pollTitle,
      amount: payment.amount,
      txnId: payment.txnId
    });
    socketService.emitGlobal('payment-verified', {
      student: payment.studentName,
      studentEmail: payment.studentEmail,
      pollTitle: payment.pollTitle,
      amount: payment.amount,
      txnId: payment.txnId
    });
  } else {
    payment.status = 'rejected';
    payment.rejectedAt = Date.now();
    payment.rejectedBy = req.user.name;

    if (order) order.paymentStatus = 'rejected';

    const participants = readDB('participants');
    if (order) {
      const participant = participants.find(p => p.pollId === order.pollId && p.userId === payment.studentEmail);
      if (participant) participant.status = 'joined';
      writeDB('participants', participants);

      const poll = polls.find(p => p.id === order.pollId);
      if (poll) {
        const resp = poll.responses.find(r => r.studentEmail === payment.studentEmail);
        if (resp) { resp.paid = false; resp.verified = false; }
      }
    }
    writeDB('polls', polls);

    socketService.emitToUser(payment.studentEmail, 'payment-rejected', {
      student: payment.studentName,
      studentEmail: payment.studentEmail,
      pollTitle: payment.pollTitle,
      reason: 'Payment rejected by shopkeeper'
    });
    socketService.emitGlobal('payment-rejected', {
      student: payment.studentName,
      studentEmail: payment.studentEmail,
      pollTitle: payment.pollTitle,
      reason: 'Payment rejected by shopkeeper'
    });
  }

  writeDB('payments', payments);
  writeDB('orders', orders);
  res.json({ success: true, payment });
}

function getPayments(req, res) {
  const payments = readDB('payments');
  if (req.user.role === 'student') {
    return res.json(payments.filter(p => p.studentEmail === req.user.email));
  }
  res.json(payments);
}

module.exports = { confirmPayment, verifyPayment, getPayments };
