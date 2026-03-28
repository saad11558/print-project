/**
 * PrintShop — Dashboard Controller
 */
const { readDB } = require('../config/db');

function getShopDashboard(req, res) {
  const orders = readDB('orders');
  const payments = readDB('payments');
  const polls = readDB('polls');
  const classrooms = readDB('classrooms');

  const totalOrders = orders.length;
  const submittedPayments = payments.filter(p => p.status === 'submitted').length;
  const verifiedPayments = payments.filter(p => p.status === 'verified').length;
  const rejectedPayments = payments.filter(p => p.status === 'rejected').length;
  const pendingOrders = orders.filter(o => o.status === 'pending').length;
  const totalRevenue = payments.filter(p => p.status === 'verified').reduce((s, p) => s + (p.amount || 0), 0);
  const printingOrders = orders.filter(o => o.status === 'printing').length;
  const readyOrders = orders.filter(o => o.status === 'ready').length;
  const collectedOrders = orders.filter(o => o.status === 'collected').length;
  const queueBusy = (pendingOrders + printingOrders) > 5;

  res.json({
    totalOrders,
    submittedPayments,
    verifiedPayments,
    rejectedPayments,
    pendingOrders,
    printingOrders,
    readyOrders,
    collectedOrders,
    totalRevenue,
    queueStatus: queueBusy ? 'Busy' : 'Free',
    orders,
    payments,
    polls,
    classrooms
  });
}

function getServerTime(req, res) {
  const polls = readDB('polls');
  const activePolls = polls
    .filter(p => !p.expired)
    .map(p => ({ id: p.id, expiresAt: p.expiresAt, title: p.title }));

  res.json({
    serverTime: Date.now(),
    polls: activePolls
  });
}

module.exports = { getShopDashboard, getServerTime };
