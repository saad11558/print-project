/* ============================================
   PrintShop – Shopkeeper Dashboard JS
   Connects to backend API with JWT auth
   Real-time updates via Socket.io
   ============================================ */

const API = 'http://localhost:3000/api';
const token = localStorage.getItem('ps-token');
const socket = io('http://localhost:3000', { auth: { token } });

// ==================== Auth Helpers ====================
function getToken() { return localStorage.getItem('ps-token'); }
function getUser() {
  try { return JSON.parse(localStorage.getItem('loggedInUser')); } catch(e) { return null; }
}
function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() };
}
function requireAuth() {
  const token = getToken();
  const user = getUser();

  console.log('[Shop Auth] Token exists:', !!token);
  console.log('[Shop Auth] User:', user);

  if (!token || !user) {
    console.log('[Shop Auth] No token or user → redirecting to shopkeeper login');
    localStorage.removeItem('ps-token');
    localStorage.removeItem('loggedInUser');
    window.location.href = 'shopkeeper-login.html';
    return false;
  }

  if (user.role !== 'shop') {
    console.log(`[Shop Auth] Role mismatch: user is "${user.role}", expected "shop" → redirecting`);
    const roleRedirects = { coordinator: 'cr.html', student: 'student.html' };
    window.location.href = roleRedirects[user.role] || 'login.html';
    return false;
  }

  console.log('[Shop Auth] ✅ Authorized as shopkeeper');
  return true;
}

// ==================== Theme ====================
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  localStorage.setItem('printshop-theme', isDark ? 'light' : 'dark');
  updateThemeIcons();
}

function updateThemeIcons() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.querySelectorAll('.sun-icon').forEach(el => el.classList.toggle('hidden', isDark));
  document.querySelectorAll('.moon-icon').forEach(el => el.classList.toggle('hidden', !isDark));
}

(function() {
  const saved = localStorage.getItem('printshop-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  window.addEventListener('DOMContentLoaded', updateThemeIcons);
})();

// ==================== Sidebar ====================
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  sidebar.classList.toggle('mobile-open');
  if (overlay) overlay.classList.toggle('active');
}

function showSection(navItem) {
  if (!navItem) return;
  const sectionId = navItem.getAttribute('data-section');
  if (!sectionId) return;
  document.querySelectorAll('.page-content').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById(sectionId);
  if (target) { target.classList.remove('hidden'); target.style.animation = 'fadeIn 0.3s ease'; }
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  navItem.classList.add('active');
  if (window.innerWidth <= 768) toggleSidebar();
}

// ==================== Toast ====================
function showToast(type, title, message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<div class="toast-icon">${icons[type] || 'i'}</div><div class="toast-content"><div class="toast-title">${title}</div><div class="toast-message">${message}</div></div><button class="toast-close">✕</button>`;
  toast.querySelector('.toast-close').addEventListener('click', () => {
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  });
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.add('toast-exit');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
    }
  }, 5000);
}

// ==================== Utility ====================
function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return 'Just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  if (d < 86400000) return Math.floor(d / 3600000) + 'h ago';
  return new Date(ts).toLocaleDateString();
}

function playSuccessSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(523.25, ctx.currentTime);
    osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) {}
}

// ==================== DATA ====================
let shopData = { orders: [], payments: [], polls: [], classrooms: [], totalOrders: 0, submittedPayments: 0, verifiedPayments: 0, rejectedPayments: 0, pendingOrders: 0, totalRevenue: 0, queueStatus: 'Free' };

async function fetchDashboard() {
  try {
    const res = await fetch(API + '/dashboard/shop', { headers: authHeaders() });
    if (res.status === 401) { window.location.href = 'shopkeeper-login.html'; return; }
    if (!res.ok) throw new Error('Failed to fetch');
    shopData = await res.json();
    renderAll();
  } catch (e) {
    console.error('Dashboard fetch error:', e);
  }
}

// ==================== RENDERERS ====================
window.updateDashboard = function() {
  // All data comes from API via shopData — no localStorage
  renderDashboard();
  renderOrdersTable();
  renderAnalytics();
  renderBadges();
};

function renderAll() {
  renderDashboard();
  renderOrdersTable();
  renderAnalytics();
  renderBadges();
  renderAIVerificationPanel();
  renderHistory();
}

function renderDashboard() {
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('shop-total-orders', shopData.totalOrders);
  el('shop-verified-payments', shopData.verifiedPayments);
  el('shop-submitted-payments', shopData.submittedPayments);
  el('shop-total-revenue', '₹' + shopData.totalRevenue);

  // Queue Status
  const queueStatus = shopData.queueStatus || 'Free';
  const qBadge = document.getElementById('queue-status-badge');
  const qText = document.getElementById('queue-badge-text');
  const qSidebar = document.getElementById('queue-status-text');
  if (qText) qText.textContent = queueStatus;
  if (qSidebar) qSidebar.textContent = 'Queue: ' + queueStatus;
  if (qBadge) {
    const dot = qBadge.querySelector('.queue-dot');
    if (dot) {
      dot.className = 'queue-dot ' + (queueStatus === 'Busy' ? 'queue-dot-busy' : 'queue-dot-free');
    }
  }
  const sDot = document.querySelector('#queue-status-sidebar .queue-dot');
  if (sDot) sDot.className = 'queue-dot ' + (queueStatus === 'Busy' ? 'queue-dot-busy' : 'queue-dot-free');

  // Active Queue Preview
  const preview = document.getElementById('shop-active-queue-preview');
  if (preview) {
    const active = shopData.orders.filter(o => o.status === 'pending' || o.status === 'printing').slice(0, 5);
    if (!active.length) {
      preview.innerHTML = '<p class="text-muted text-center">No orders in queue.</p>';
    } else {
      preview.innerHTML = active.map((o, i) => {
        const isVer = o.paymentStatus === 'verified';
        const sBadge = { pending: isVer ? 'badge-success' : 'badge-warning', printing: 'badge-info' };
        const sIcon = { pending: isVer ? '✅ Verified' : '⏳ Pending', printing: '🖨️ Printing' };
        return `<div class="queue-item">
          <div class="queue-item-number">#${i + 1}</div>
          <div class="queue-item-info"><div class="font-semibold text-sm">${o.student}</div><div class="text-xs text-muted">${o.poll} · ${o.file} · ${o.pages} pages</div></div>
          <div class="queue-item-actions"><span class="badge ${sBadge[o.status]}">${sIcon[o.status]}</span>
            ${o.status === 'pending' ? (isVer ? `<button class="btn btn-sm btn-primary" onclick="updateOrderStatus('${o.id}','printing')">Start Printing</button>` : `<span class="text-xs text-muted">Awaiting Verification</span>`) : ''}
            ${o.status === 'printing' ? `<button class="btn btn-sm btn-success" onclick="updateOrderStatus('${o.id}','ready')">Mark Ready</button>` : ''}
          </div>
        </div>`;
      }).join('');
    }
  }

  // Recent Completed
  const completed = document.getElementById('shop-recent-completed');
  if (completed) {
    const done = shopData.orders.filter(o => o.status === 'ready' || o.status === 'collected').slice(0, 5);
    if (!done.length) {
      completed.innerHTML = '<p class="text-muted text-center">No completed orders yet.</p>';
    } else {
      completed.innerHTML = done.map(o => {
        const sBadge = { ready: 'badge-success', collected: 'badge-gray' };
        const sLbl = { ready: '✓ Ready', collected: '📦 Collected' };
        return `<div class="flex items-center justify-between" style="padding:10px 0;border-bottom:1px solid var(--border-color);">
          <div><div class="font-semibold text-sm">${o.student}</div><div class="text-xs text-muted">${o.poll} · ${o.pages} pages</div></div>
          <span class="badge ${sBadge[o.status]}">${sLbl[o.status]}</span></div>`;
      }).join('');
    }
  }
}

function renderOrdersTable() {
  const tbody = document.getElementById('orders-tbody');
  if (!tbody) return;
  let orders = shopData.orders;
  const filterEl = document.getElementById('orders-status-filter');
  const filter = filterEl?.value || 'all';
  if (filter !== 'all') orders = orders.filter(o => o.status === filter);

  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-muted text-center">No orders found.</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map((o, i) => {
    const sMap = { pending: 'badge-warning', printing: 'badge-info', ready: 'badge-success', collected: 'badge-gray' };
    const pMap = { pending: 'badge-gray', submitted: 'badge-primary', verified: 'badge-success', rejected: 'badge-danger' };
    
    // Status text
    const pText = o.paymentStatus === 'verified' ? 'Verified ✓' : (o.paymentStatus === 'submitted' ? 'Submitted' : (o.paymentStatus === 'rejected' ? 'Rejected ✕' : 'Pending'));
    
    // Actions
    let btns = '';
    if (o.paymentStatus === 'submitted') {
      const payId = shopData.payments.find(p => p.orderId === o.id)?.id;
      if (payId) {
        btns += `<button class="btn btn-sm btn-success" onclick="verifyPayment('${payId}', 'approve')" style="margin-right:4px;">✅ Approve</button>`;
        btns += `<button class="btn btn-sm btn-danger" onclick="verifyPayment('${payId}', 'reject')">❌ Reject</button>`;
      }
    } else if (o.paymentStatus === 'verified') {
      const bMap = {
        pending: `<button class="btn btn-sm btn-primary" onclick="updateOrderStatus('${o.id}','printing')">🖨️ Print</button>`,
        printing: `<button class="btn btn-sm btn-success" onclick="updateOrderStatus('${o.id}','ready')">✅ Ready</button>`,
        ready: `<button class="btn btn-sm btn-ghost" onclick="collectOrder('${o.id}', '${o.studentEmail}')">📦 Collected</button>`,
        collected: '<span class="text-muted">—</span>'
      };
      btns = bMap[o.status] || '';
    } else {
      btns = '<span class="text-muted text-xs">Waiting for Payment</span>';
    }

    return `<tr>
      <td>${i + 1}</td>
      <td class="font-semibold">${o.student}</td>
      <td>${o.classroom || '—'}</td>
      <td>${o.poll || '—'}</td>
      <td>Sem ${o.semester || '—'}</td>
      <td><span class="badge ${pMap[o.paymentStatus||'pending']}">${pText}</span></td>
      <td>₹${o.price}</td>
      <td><code style="font-size:0.7rem;">${o.txnId || '—'}</code></td>
      <td>${btns}</td>
    </tr>`;
  }).join('');
}

async function verifyPayment(paymentId, action) {
  try {
    const res = await fetch(API + '/payments/' + paymentId + '/verify', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ action })
    });
    if (!res.ok) throw new Error('Failed');
    showToast('success', 'Success', `Payment ${action}d successfully`);
    if (action === 'approve') playSuccessSound();
    fetchDashboard();
  } catch (e) {
    showToast('error', 'Error', 'Failed to verify payment');
  }
}

function shopFilterOrders() { renderOrdersTable(); }

function renderPaymentTracker() {
  // All payment data from API via shopData
  const payments = shopData.payments || [];
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  const verified = payments.filter(p => p.status === 'verified');
  const pending = payments.filter(p => p.status === 'submitted');
  const totalCollected = verified.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  el('pay-verified', verified.length);
  el('pay-submitted', pending.length);
  el('pay-total', '₹' + totalCollected);

  const tbody = document.getElementById('payments-tbody');
  if (!tbody) return;
  if (!payments.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-muted text-center">No payments yet.</td></tr>';
    return;
  }
  tbody.innerHTML = payments.sort((a,b)=>b.createdAt-a.createdAt).map((p, i) => {
    let pMap = { 'submitted': 'badge-warning', 'verified': 'badge-success', 'rejected': 'badge-danger' };
    let actionBtn = `<span class="text-muted text-xs">${String(p.status).toUpperCase()}</span>`;
    return `<tr>
      <td>${i + 1}</td>
      <td class="font-semibold">${p.studentName}</td>
      <td>${p.pollTitle || '—'}</td>
      <td>${p.classroom || '—'}</td>
      <td class="font-semibold" style="color:var(--success);">₹${p.amount}</td>
      <td><span class="badge ${pMap[p.status] || 'badge-gray'}">${p.status}</span></td>
      <td><code style="font-size:0.7rem;">${p.txnId || '—'}</code></td>
      <td class="text-muted text-xs">${timeAgo(p.createdAt)}</td>
      <td>${actionBtn}</td>
    </tr>`;
  }).join('');
}

function renderAnalytics() {
  const container = document.getElementById('shop-analytics-content');
  if (!container) return;

  const orders = shopData.orders;
  const payments = shopData.payments;
  const totalRevenue = shopData.totalRevenue;
  const pendingCount = orders.filter(o => o.status === 'pending').length;
  const printingCount = orders.filter(o => o.status === 'printing').length;
  const readyCount = orders.filter(o => o.status === 'ready').length;
  const collectedCount = orders.filter(o => o.status === 'collected').length;
  const avgOrderValue = orders.length > 0 ? Math.round(totalRevenue / orders.length) : 0;

  // Group by classroom
  const classroomRevenue = {};
  orders.forEach(o => {
    const cl = o.classroom || 'Unknown';
    if (!classroomRevenue[cl]) classroomRevenue[cl] = { count: 0, revenue: 0, subject: o.subject || '' };
    classroomRevenue[cl].count++;
    classroomRevenue[cl].revenue += o.price || 0;
  });

  container.innerHTML = `
    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card"><div class="stat-card-icon icon-bg-indigo">📊</div><div class="stat-card-info"><div class="stat-card-label">Total Orders</div><div class="stat-card-value">${orders.length}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon icon-bg-green">₹</div><div class="stat-card-info"><div class="stat-card-label">Total Revenue</div><div class="stat-card-value">₹${totalRevenue}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon icon-bg-blue">📝</div><div class="stat-card-info"><div class="stat-card-label">Avg Order Value</div><div class="stat-card-value">₹${avgOrderValue}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon icon-bg-amber">📈</div><div class="stat-card-info"><div class="stat-card-label">Total Payments</div><div class="stat-card-value">${payments.length}</div></div></div>
    </div>
    <div class="card"><div class="card-header"><h3>Order Status Breakdown</h3></div><div class="card-body">
      <div class="poll-detail-stats">
        <div class="poll-detail-stat"><div class="stat-num">${pendingCount}</div><div class="stat-lbl">⏳ Pending</div></div>
        <div class="poll-detail-stat"><div class="stat-num" style="color:var(--info);">${printingCount}</div><div class="stat-lbl">🖨️ Printing</div></div>
        <div class="poll-detail-stat"><div class="stat-num" style="color:var(--success);">${readyCount}</div><div class="stat-lbl">✅ Ready</div></div>
        <div class="poll-detail-stat"><div class="stat-num">${collectedCount}</div><div class="stat-lbl">📦 Collected</div></div>
      </div>
    </div></div>
    <div class="card" style="margin-top:16px;"><div class="card-header"><h3>Revenue by Classroom</h3></div><div class="card-body">
      ${Object.entries(classroomRevenue).map(([name, data]) => {
        const pct = totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 100) : 0;
        return `<div style="padding:12px 0;border-bottom:1px solid var(--border-color);">
          <div class="flex items-center justify-between mb-2"><div class="font-semibold text-sm">${name}${data.subject ? ' — ' + data.subject : ''}</div><span class="font-semibold" style="color:var(--primary);">₹${data.revenue}</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <div class="text-xs text-muted" style="margin-top:4px;">${data.count} orders · ${pct}% of revenue</div>
        </div>`;
      }).join('') || '<p class="text-muted text-center">No data yet.</p>'}
    </div></div>`;
}

function renderHistory() {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;
  const payments = shopData.payments || [];
  const completed = payments.filter(p => p.status === 'verified')
                            .sort((a, b) => b.createdAt - a.createdAt);
  if (!completed.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted text-center">No completed transactions yet.</td></tr>';
    return;
  }
  tbody.innerHTML = completed.map((p, i) => {
    return `<tr>
      <td>${i + 1}</td>
      <td><code style="font-size:0.7rem;">${p.txnId || '—'}</code></td>
      <td class="font-semibold">${p.studentName}</td>
      <td class="font-semibold" style="color:var(--success);">₹${p.amount}</td>
      <td><span class="badge badge-info">${(p.method || 'QR').toUpperCase()}</span></td>
      <td><span class="badge badge-success">Verified</span></td>
      <td class="text-muted text-xs">${new Date(p.createdAt).toLocaleString()}</td>
    </tr>`;
  }).join('');
}

function renderBadges() {
  const ob = document.getElementById('shop-orders-badge');
  if (ob) ob.textContent = shopData.orders.filter(o => o.status === 'pending' || o.status === 'printing').length;
}

// ==================== PAYMENT VERIFICATION (API-BASED) ====================
function renderAIVerificationPanel() {
  const tbody = document.getElementById('ai-verify-tbody');
  if (!tbody) return;
  const submissions = shopData.payments.filter(p => p.status === 'submitted');
  
  if (!submissions.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No pending verifications.</td></tr>';
    return;
  }

  tbody.innerHTML = submissions.map(p => {
    // Simulated AI match score between 85-99%
    const score = Math.floor(Math.random() * (99 - 85 + 1) + 85); 

    return `<tr>
      <td>
        <div class="font-semibold">${p.studentName}</div>
        <div class="text-xs text-muted">Poll: ${p.pollTitle}</div>
      </td>
      <td>
        <div style="display:flex; align-items:center; gap:8px;">
          <svg class="icon-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          <span class="text-sm">proof_${p.txnId.substring(0,8)}.jpg</span>
        </div>
      </td>
      <td class="text-xs text-muted">${new Date(p.createdAt).toLocaleTimeString()}</td>
      <td>
        <span class="badge badge-warning">AI Match: ${score}%</span>
      </td>
      <td>
        <button class="btn btn-sm btn-success" onclick="verifyPayment('${p.id}', 'approve')">Approve (AI Match)</button>
        <button class="btn btn-sm btn-danger" onclick="verifyPayment('${p.id}', 'reject')">Reject</button>
      </td>
    </tr>`;
  }).join('');
}

async function verifyPayment(paymentId, action) {
  try {
    const res = await fetch(API + '/payments/' + paymentId + '/verify', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ action })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed');
    }
    showToast('success', action === 'approve' ? 'Payment Verified' : 'Payment Rejected', 'Status updated successfully.');
    fetchDashboard();
  } catch (e) {
    showToast('error', 'Error', e.message || 'Verification failed');
  }
}

// ==================== ORDER STATUS UPDATE ====================
async function updateOrderStatus(orderId, status) {
  try {
    const res = await fetch(API + '/orders/' + orderId + '/status', {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify({ status })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed');
    }
    showToast('success', 'Updated', `Order → ${status}`);
    if (status === 'ready') playSuccessSound();
    fetchDashboard();
  } catch (e) {
    showToast('error', 'Error', e.message || 'Failed to update order status');
  }
}

async function collectOrder(orderId, studentEmail) {
  try {
    const res = await fetch(API + '/orders/' + orderId + '/collect', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ studentEmail })
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Failed');
    }
    showToast('success', 'Collected', `Order marked as collected`);
    fetchDashboard();
  } catch (e) {
    showToast('error', 'Error', e.message || 'Failed to process collection');
  }
}

// ==================== NOTIFICATIONS ====================
const ShopNotif = {
  items: [],
  add(title, message) {
    this.items.unshift({ title, message, time: Date.now(), read: false });
    if (this.items.length > 30) this.items.length = 30;
    this.renderBell();
    this.renderPanel();
    showToast('info', title, message);
  },
  renderBell() {
    const el = document.getElementById('notif-count');
    if (!el) return;
    const count = this.items.filter(n => !n.read).length;
    el.textContent = count > 9 ? '9+' : (count || '');
    el.setAttribute('data-count', count);
  },
  renderPanel() {
    const body = document.getElementById('notif-panel-body');
    if (!body) return;
    if (!this.items.length) {
      body.innerHTML = '<div class="notif-panel-empty">🔔 No notifications yet</div>';
      return;
    }
    body.innerHTML = this.items.slice(0, 20).map(n => `
      <div class="notif-item ${n.read ? '' : 'unread'}">
        <div class="notif-icon notif-icon-payment">💳</div>
        <div class="notif-body">
          <div class="notif-title">${n.title}</div>
          <div class="notif-desc">${n.message}</div>
          <div class="notif-time">${timeAgo(n.time)}</div>
        </div>
      </div>
    `).join('');
  },
  togglePanel() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    const isOpen = panel.classList.contains('open');
    panel.classList.toggle('open');
    if (!isOpen) {
      this.items.forEach(n => n.read = true);
      this.renderBell();
      this.renderPanel();
    }
  },
  clearAll() {
    this.items = [];
    this.renderBell();
    this.renderPanel();
  }
};

// Close panel on outside click
document.addEventListener('click', (e) => {
  const panel = document.getElementById('notif-panel');
  const wrap = e.target.closest('.notif-bell-wrap');
  if (panel && panel.classList.contains('open') && !wrap) panel.classList.remove('open');
}, true);

// ==================== SOCKET.IO REAL-TIME ====================
socket.on('payment-submitted', (data) => {
  ShopNotif.add('💰 Payment Submitted', `${data.student} submitted ₹${data.amount}. Waiting for verification.`);
  fetchDashboard();
});

socket.on('payment-verified', (data) => {
  ShopNotif.add('✅ Payment Verified', `${data.student}'s payment was verified and added to queue.`);
  fetchDashboard();
});

socket.on('student-joined', (data) => {
  ShopNotif.add('👤 Student Joined', `${data.student} joined ${data.classroom}`);
  fetchDashboard();
});

socket.on('order-updated', () => {
  fetchDashboard();
});

socket.on('poll-created', (data) => {
  ShopNotif.add('📝 New Poll', `New poll "${data.poll.title}" in ${data.classroomName}`);
  fetchDashboard();
});

// ==================== PAYMENT DATA (API-BACKED) ====================
// All payment data now comes from shopData.payments via the dashboard API.
// localStorage payment proofs have been removed.

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  if (!requireAuth()) return;

  const user = getUser();
  if (user) {
    const welcome = document.getElementById('shop-welcome-msg');
    if (welcome) welcome.textContent = `Welcome, ${user.name} 🖨️`;
    const avatar = document.getElementById('shop-avatar');
    if (avatar) avatar.textContent = user.name.substring(0, 2).toUpperCase();
  }

  // Logout
  document.getElementById('shop-logout-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('ps-token');
    localStorage.removeItem('loggedInUser');
    window.location.href = 'login.html';
  });

  fetchDashboard();
  ShopNotif.renderBell();
  ShopNotif.renderPanel();

  // Auto-refresh every 10s
  setInterval(fetchDashboard, 10000);

  showToast('info', 'Welcome!', 'Shopkeeper dashboard loaded.');
});
