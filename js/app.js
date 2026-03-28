/* ============================================
   PrintShop – Smart Campus Printing Queue
   API-connected version with Socket.io
   Server-synced deadlines & room-based events
   ============================================ */

const API = 'http://localhost:3000/api';
let socket;
let serverTimeOffset = 0; // difference between server time and local time

try {
  const token = localStorage.getItem('ps-token');
  socket = io('http://localhost:3000', { auth: { token } });
} catch (e) { socket = null; }

// Server-time sync for accurate countdowns
async function syncServerTime() {
  try {
    const before = Date.now();
    const r = await fetch(API + '/server-time');
    if (!r.ok) return;
    const data = await r.json();
    const latency = (Date.now() - before) / 2;
    serverTimeOffset = (data.serverTime + latency) - Date.now();
  } catch (e) { /* fallback: use local time */ }
}
function getServerNow() { return Date.now() + serverTimeOffset; }

// Sync immediately, then every 30s as fallback
syncServerTime();
setInterval(syncServerTime, 30000);

// ==================== Auth Helpers ====================
function getToken() { return localStorage.getItem('ps-token'); }
function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() };
}
function getLoggedInUser() {
  try { return JSON.parse(localStorage.getItem('loggedInUser')) || null; } catch (e) { return null; }
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
(function () {
  const saved = localStorage.getItem('printshop-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  document.addEventListener('DOMContentLoaded', updateThemeIcons);
})();

// ==================== Sidebar ====================
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  sidebar.classList.toggle('mobile-open');
  if (overlay) overlay.classList.toggle('active');
}

// ==================== Navigation ====================
function showSection(navItem) {
  if (!navItem) return;
  const sectionId = navItem.getAttribute('data-section');
  if (!sectionId) return;
  document.querySelectorAll('.page-content').forEach(s => s.classList.add('hidden'));
  const target = document.getElementById(sectionId);
  if (target) { target.classList.remove('hidden'); target.style.animation = 'fadeIn 0.3s ease'; }
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  navItem.classList.add('active');
  if (window.innerWidth <= 768) {
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    document.getElementById('sidebar-overlay')?.classList.remove('active');
  }
}

// ==================== Toast ====================
function showToast(type, title, message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<div class="toast-icon">${icons[type] || 'i'}</div><div class="toast-content"><div class="toast-title">${title}</div><div class="toast-message">${message}</div></div><button class="toast-close">✕</button>`;
  toast.querySelector('.toast-close').addEventListener('click', () => dismissToast(toast));
  container.appendChild(toast);
  setTimeout(() => dismissToast(toast), 5000);
}
function dismissToast(toast) {
  if (!toast || !toast.parentElement) return;
  toast.classList.add('toast-exit');
  toast.addEventListener('animationend', () => toast.remove(), { once: true });
}

// ==================== Utility ====================
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = ''; for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)]; return c;
}
function fmtTime(ms) {
  if (ms <= 0) return 'Expired';
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
// Server-synced time left for a poll
function pollTimeLeft(poll) { return poll.expiresAt - getServerNow(); }
// Deadline status badge
function getDeadlineStatus(poll) {
  const tl = pollTimeLeft(poll);
  if (tl <= 0 || poll.expired) return { label: '⛔ Deadline Closed', cls: 'badge-danger', disabled: true };
  if (tl <= 60000) return { label: '🔴 Last chance!', cls: 'badge-danger', disabled: false };
  if (tl <= 5 * 60000) return { label: '🟠 5 min left', cls: 'badge-warning', disabled: false };
  if (tl <= 10 * 60000) return { label: '🟡 10 min left', cls: 'badge-warning', disabled: false };
  return { label: '⏱ ' + fmtTime(tl), cls: 'badge-info', disabled: false };
}
function fmtSize(b) { return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }
function timeAgo(ts) {
  const d = Date.now() - ts;
  if (d < 60000) return 'Just now';
  if (d < 3600000) return Math.floor(d / 60000) + 'm ago';
  return Math.floor(d / 3600000) + 'h ago';
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
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
  } catch (e) { }
}

// ==================== DATA CACHE ====================
let _classrooms = [], _polls = [], _orders = [];

async function fetchClassrooms() {
  try {
    const r = await fetch(API + '/classrooms', { headers: authHeaders() });
    if (r.ok) _classrooms = await r.json();
  } catch (e) { }
  return _classrooms;
}
async function fetchAllClassrooms() {
  try {
    const r = await fetch(API + '/classrooms/all', { headers: authHeaders() });
    if (r.ok) return await r.json();
  } catch (e) { }
  return _classrooms;
}
async function fetchPolls() {
  try {
    const r = await fetch(API + '/polls', { headers: authHeaders() });
    if (r.ok) _polls = await r.json();
  } catch (e) { }
  return _polls;
}
async function fetchOrders() {
  try {
    const r = await fetch(API + '/orders', { headers: authHeaders() });
    if (r.ok) _orders = await r.json();
  } catch (e) { }
  return _orders;
}

// ==================== MASTER REFRESH ====================
async function refreshAll() {
  if (!getToken()) return;
  await Promise.all([fetchClassrooms(), fetchPolls(), fetchOrders()]);
  
  if (socket) {
    socket.emit('join:rooms', {
      pollIds: _polls.map(p => p.id),
      classroomIds: _classrooms.map(c => c.id),
      orderIds: _orders.map(o => o.id)
    });
  }
  const u = getLoggedInUser();
  if (u && u.name) {
    const wMsg = document.getElementById('student-welcome-msg');
    if (wMsg) wMsg.innerText = `Welcome back, ${u.name.split(' ')[0]} 👋`;
    const crMsg = document.getElementById('cr-overview');
    if (crMsg) {
      const h1 = crMsg.querySelector('h1');
      if (h1) h1.textContent = `Welcome, ${u.name.split(' ')[0]} ✌️`;
    }
    const avatar = document.querySelector('.avatar-sm');
    if (avatar) avatar.innerText = u.name.substring(0, 2).toUpperCase();
  }
  // CR
  renderCRStats(); renderCRClassrooms(); populatePollClassroomSelect();
  renderClassroomsList(); renderStatusQueue(); renderCRStudents();
  renderCRPayments(); renderCRAnalytics();
  // Student
  renderStudentStats(); renderStudentClassrooms(); renderStudentMyClassrooms(); renderStudentPolls();
  renderStudentQueue(); renderStudentTracking(); renderStudentActivity(); updateQueueCard();
  // Badges
  const pb = document.getElementById('polls-badge');
  if (pb) pb.textContent = _polls.filter(p => p.expiresAt > Date.now()).length;
  const cb = document.getElementById('classroom-badge');
  if (cb) cb.textContent = _classrooms.length;
  const crbadge = document.getElementById('cr-classrooms-badge');
  if (crbadge) crbadge.textContent = _classrooms.length;
}

// ============================================================
// CR DASHBOARD
// ============================================================
function renderCRStats() {
  const c = _classrooms, p = _polls;
  const students = new Set();
  c.forEach(cl => { if (cl.joinedUsers) cl.joinedUsers.forEach(s => students.add(s)); });
  let revenue = 0;
  p.forEach(pp => revenue += pp.responses.filter(r => r.paid).length * pp.price);
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('stat-classrooms', c.length);
  el('stat-polls', p.filter(pp => pp.expiresAt > Date.now()).length);
  el('stat-students', students.size);
  el('stat-payments', '₹' + revenue);
  
  renderCRPendingPickups();
}

function renderCRPendingPickups() {
  const container = document.getElementById('cr-pending-pickups');
  if (!container) return;
  const items = _orders.filter(o => o.status === 'ready' || o.paymentStatus === 'submitted');
  if (!items.length) {
    container.innerHTML = '<p class="text-muted text-center" style="margin-top:20px;">No pending items.</p>';
    return;
  }
  
  container.innerHTML = items.map(o => {
    if (o.paymentStatus === 'submitted') {
      return `
      <div style="padding:12px; border:1px solid #FCD34D; border-radius:8px; margin-bottom:12px; background:#FEF3C7; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div class="font-semibold text-sm" style="color:#92400E;">${o.student}</div>
          <div class="text-xs" style="color:#B45309;">Poll: ${o.poll}</div>
        </div>
        <span class="badge badge-warning" style="background:#F59E0B; color:white; border:none;">⏳ Pending Payment</span>
      </div>`;
    } else {
      return `
      <div style="padding:12px; border:1px solid var(--border-color); border-radius:8px; margin-bottom:12px; background:var(--bg-secondary); display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div class="font-semibold text-sm">${o.student}</div>
          <div class="text-xs text-muted">Poll: ${o.poll}</div>
        </div>
        <button class="btn btn-sm btn-ghost" style="border:1px solid var(--border-color);" onclick="collectOrder('${o.id}', '${o.studentEmail}')">Mark Collected</button>
      </div>`;
    }
  }).join('');
}

function renderCRClassrooms() {
  const container = document.getElementById('cr-recent-classrooms');
  if (!container) return;
  if (!_classrooms.length) { container.innerHTML = '<p class="text-muted text-center">No classrooms yet.</p>'; return; }
  container.innerHTML = _classrooms.map(c => `
    <div class="flex items-center justify-between" style="padding:10px 0;border-bottom:1px solid var(--border-color);cursor:pointer;" data-action="nav-my-classrooms">
      <div><div class="font-semibold text-sm">${c.name} — ${c.subject}</div><div class="text-xs text-muted">${c.joinedUsers ? c.joinedUsers.length : 0} students · Sem ${c.semester}</div></div>
      <code>${c.code}</code>
    </div>`).join('');
}

async function createClassroom() {
  const n = document.getElementById('classroom-name'), s = document.getElementById('classroom-subject'), sem = document.getElementById('classroom-semester');
  if (!n?.value.trim() || !s?.value.trim()) { showToast('warning', 'Missing Fields', 'Fill in class name and subject.'); return; }
  try {
    const res = await fetch(API + '/classrooms', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name: n.value.trim(), subject: s.value.trim(), semester: sem?.value || 4 })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('success', 'Classroom Created!', `Code: ${data.classroom.code}`);
      const preview = document.getElementById('preview-join-code');
      if (preview) preview.textContent = data.classroom.code;
      n.value = ''; s.value = '';
      refreshAll();
    } else { showToast('error', 'Error', data.error); }
  } catch (e) { showToast('error', 'Error', 'Network error'); }
}

function populatePollClassroomSelect() {
  const sel = document.getElementById('poll-classroom');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- Select --</option>' + _classrooms.map(cl => `<option value="${cl.id}">${cl.name} — ${cl.subject}</option>`).join('');
}

// CR file upload
let _crFileDataUrl = null, _crFileType = null, _qrDataUrl = null;

function setupCRFileUpload() {
  const zone = document.getElementById('cr-upload-zone'), input = document.getElementById('cr-file-input');
  if (!zone || !input) return;
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', e => { e.preventDefault(); zone.classList.remove('dragover'); });
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); if (e.dataTransfer.files[0]) handleCRFile(e.dataTransfer.files[0]); });
  input.addEventListener('change', e => { if (e.target.files[0]) handleCRFile(e.target.files[0]); });
  const qrZone = document.getElementById('qr-upload-zone'), qrInput = document.getElementById('qr-file-input');
  if (qrZone && qrInput) {
    qrZone.addEventListener('click', () => qrInput.click());
    qrZone.addEventListener('dragover', e => { e.preventDefault(); qrZone.classList.add('dragover'); });
    qrZone.addEventListener('dragleave', e => { e.preventDefault(); qrZone.classList.remove('dragover'); });
    qrZone.addEventListener('drop', e => { e.preventDefault(); qrZone.classList.remove('dragover'); if (e.dataTransfer.files[0]) handleQRFile(e.dataTransfer.files[0]); });
    qrInput.addEventListener('change', e => { if (e.target.files[0]) handleQRFile(e.target.files[0]); });
  }
}
function handleCRFile(f) {
  const reader = new FileReader();
  reader.onload = (e) => {
    _crFileDataUrl = e.target.result; _crFileType = f.type;
    document.getElementById('cr-file-preview')?.classList.remove('hidden');
    const n = document.getElementById('cr-file-name'); if (n) n.textContent = f.name;
    const s = document.getElementById('cr-file-size'); if (s) s.textContent = fmtSize(f.size);
    document.getElementById('cr-upload-zone').style.display = 'none';
  };
  reader.readAsDataURL(f);
}
function removeCRFile() {
  _crFileDataUrl = null; _crFileType = null;
  document.getElementById('cr-file-preview')?.classList.add('hidden');
  const z = document.getElementById('cr-upload-zone'); if (z) z.style.display = '';
}
function handleQRFile(f) {
  if (!f.type.startsWith('image/')) { showToast('warning', 'Invalid File', 'Please upload an image file.'); return; }
  const reader = new FileReader();
  reader.onload = (e) => {
    _qrDataUrl = e.target.result;
    const preview = document.getElementById('qr-preview');
    const img = document.getElementById('qr-preview-img');
    const zone = document.getElementById('qr-upload-zone');
    if (preview) preview.classList.remove('hidden');
    if (img) img.src = _qrDataUrl;
    if (zone) zone.style.display = 'none';
    showToast('success', 'QR Uploaded', 'Payment QR code is ready.');
  };
  reader.readAsDataURL(f);
}
function removeQRFile() {
  _qrDataUrl = null;
  const preview = document.getElementById('qr-preview'), zone = document.getElementById('qr-upload-zone');
  if (preview) preview.classList.add('hidden');
  if (zone) zone.style.display = '';
}

async function createPrintPoll() {
  const cid = document.getElementById('poll-classroom')?.value;
  const title = document.getElementById('poll-title');
  const desc = document.getElementById('poll-description');
  const price = document.getElementById('poll-price');
  const dur = document.getElementById('poll-duration');
  if (!cid || !title?.value.trim() || !price?.value) { showToast('warning', 'Missing Fields', 'Select classroom, fill title & price.'); return; }
  const filePreview = document.getElementById('cr-file-preview');
  const fileName = document.getElementById('cr-file-name')?.textContent;
  let docData = null;
  if (filePreview && !filePreview.classList.contains('hidden') && fileName) {
    const fileSize = document.getElementById('cr-file-size')?.textContent || '1 MB';
    docData = { name: fileName, pages: Math.floor(Math.random() * 20) + 5, size: fileSize, uploadedAt: Date.now() };
  }
  try {
    const res = await fetch(API + '/polls', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ classroomId: cid, title: title.value.trim(), desc: desc?.value || '', price: parseInt(price.value), duration: parseInt(dur?.value || 60), document: docData, qrCode: _qrDataUrl })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('success', 'Poll Created!', `"${title.value.trim()}" is now live.`);
      title.value = ''; if (desc) desc.value = ''; price.value = '';
      removeCRFile(); removeQRFile(); refreshAll();
    } else { showToast('error', 'Error', data.error); }
  } catch (e) { showToast('error', 'Error', 'Network error'); }
}

function renderClassroomsList() {
  const container = document.getElementById('classrooms-list');
  if (!container) return;
  if (!_classrooms.length) { container.innerHTML = '<p class="text-muted text-center">No classrooms yet.</p>'; return; }
  container.innerHTML = _classrooms.map(c => {
    const cPolls = _polls.filter(p => p.classroomId === c.id);
    const activePolls = cPolls.filter(p => p.expiresAt > Date.now());
    return `<div class="classroom-card">
      <div class="flex items-center justify-between mb-2">
        <div><h3>${c.name} — ${c.subject}</h3><p class="text-xs text-muted">Sem ${c.semester} · ${c.joinedUsers ? c.joinedUsers.length : 0} students</p></div>
        <code style="font-size:1rem;">${c.code}</code>
      </div>
      <div class="flex gap-2 mb-3" style="flex-wrap:wrap;">
        <span class="badge badge-primary">${c.joinedUsers ? c.joinedUsers.length : 0} students</span>
        <span class="badge badge-info">${activePolls.length} active polls</span>
      </div>
      ${cPolls.length > 0 ? cPolls.map(poll => {
      const tl = poll.expiresAt - Date.now();
      const isExpired = tl <= 0;
      const paid = poll.responses.filter(r => r.paid);
      const unpaid = poll.responses.filter(r => !r.paid);
      const totalAmt = paid.length * poll.price;
      return `<div class="card" style="margin-bottom:12px;">
          <div class="card-header"><div><h4>${poll.title}</h4><p class="text-xs text-muted">${poll.desc}</p></div>
            <span class="badge ${isExpired ? 'badge-danger' : tl < 600000 ? 'badge-warning' : 'badge-info'}">${isExpired ? 'Expired' : '⏱ ' + fmtTime(tl)}</span></div>
          <div class="card-body">
            <div class="poll-detail-stats">
              <div class="poll-detail-stat"><div class="stat-num">${poll.responses.length}</div><div class="stat-lbl">Joined</div></div>
              <div class="poll-detail-stat"><div class="stat-num" style="color:var(--success);">${paid.length}</div><div class="stat-lbl">Submitted</div></div>
              <div class="poll-detail-stat"><div class="stat-num" style="color:var(--danger);">${unpaid.length}</div><div class="stat-lbl">Pending ✕</div></div>
              <div class="poll-detail-stat"><div class="stat-num" style="color:var(--primary);">₹${totalAmt}</div><div class="stat-lbl">Submitted Amt</div></div>
            </div>
            ${poll.responses.length > 0 ? `<table class="student-table"><thead><tr><th>Name</th><th>Status</th><th>Verification</th></tr></thead>
              <tbody>${poll.responses.map(r => `<tr><td class="font-semibold">${r.student}</td>
                <td>${r.paid ? '<span class="badge badge-primary">Submitted</span>' : '<span class="badge badge-danger">Pending</span>'}</td>
                <td>${r.verified ? '<span class="badge badge-success">✓ Verified</span>' : (r.paid ? '<span class="badge badge-warning">⏳ Awaiting</span>' : '—')}</td></tr>`).join('')}</tbody></table>` : '<p class="text-muted text-sm text-center" style="padding:12px;">No students have joined yet.</p>'}
          </div></div>`;
    }).join('') : '<p class="text-muted text-sm" style="padding:8px;">No polls in this classroom yet.</p>'}
    </div>`;
  }).join('');
}

let _statusFilter = 'all';
function renderStatusQueue() {
  const container = document.getElementById('status-queue-list');
  if (!container) return;
  let orders = _orders;
  if (_statusFilter !== 'all') orders = orders.filter(o => o.status === _statusFilter);
  if (!orders.length) { container.innerHTML = '<p class="text-muted text-center">No orders.</p>'; return; }
  const active = _orders.filter(o => o.status === 'pending' || o.status === 'printing');
  container.innerHTML = orders.map(o => {
    const pos = active.indexOf(o) + 1;
    const isVer = o.paymentStatus === 'verified';
    const sMap = { pending: isVer ? 'badge-success' : 'badge-warning', printing: 'badge-info', ready: 'badge-success', collected: 'badge-gray' };
    const sIcon = { pending: isVer ? '✅ Verified' : '⏳ Pending', printing: '🖨️ Printing', ready: '✓ Ready', collected: '📦 Done' };
    const btns = {
      pending: isVer ? `<button class="btn btn-sm btn-primary" onclick="updateOrder('${o.id}','printing')">Start Printing</button>` : `<span class="text-xs text-muted">Awaiting Verification</span>`,
      printing: `<button class="btn btn-sm btn-success" onclick="updateOrder('${o.id}','ready')">Mark Ready</button>`,
      ready: `<button class="btn btn-sm btn-ghost" onclick="collectOrder('${o.id}', '${o.studentEmail}')">Collected</button>`,
      collected: ''
    };
    return `<div class="queue-item">
      <div class="queue-item-number">${pos > 0 ? '#' + pos : '—'}</div>
      <div class="queue-item-info"><div class="font-semibold text-sm">${o.student}</div><div class="text-xs text-muted">${o.poll} · ${o.file} · ${o.pages} pages</div></div>
      <div class="queue-item-actions"><span class="badge ${sMap[o.status]}">${sIcon[o.status]}</span>${btns[o.status] || ''}</div>
    </div>`;
  }).join('');
}

function filterStatusQueue(f, el) {
  _statusFilter = f;
  document.querySelectorAll('#status-tabs .tab').forEach(t => t.classList.remove('active'));
  if (el) el.classList.add('active');
  renderStatusQueue();
}

async function updateOrder(id, status) {
  try {
    const res = await fetch(API + '/orders/' + id + '/status', {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ status })
    });
    if (res.ok) { showToast('success', 'Updated', `Order → ${status}`); refreshAll(); }
    else {
      const data = await res.json();
      showToast('error', 'Error', data.error || 'Failed to update');
    }
  } catch (e) { showToast('error', 'Error', 'Network error'); }
}

async function collectOrder(orderId, studentEmail) {
  try {
    const res = await fetch(API + '/orders/' + orderId + '/collect', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ studentEmail })
    });
    if (res.ok) { 
      showToast('success', 'Collected', `Order marked as collected`); 
      refreshAll(); 
    } else {
      const data = await res.json();
      showToast('error', 'Error', data.error || 'Failed to process collection');
    }
  } catch (e) { showToast('error', 'Error', 'Network error'); }
}

function renderCRStudents() {
  const container = document.getElementById('cr-students-list');
  if (!container) return;
  const allStudents = [];
  _classrooms.forEach(cl => {
    if (cl.joinedUsers) cl.joinedUsers.forEach(s => {
      if (!allStudents.find(x => x.email === s && x.classroom === cl.name))
        allStudents.push({ email: s, classroom: cl.name, subject: cl.subject, semester: cl.semester });
    });
  });
  if (!allStudents.length) { container.innerHTML = '<p class="text-muted text-center">No students yet.</p>'; return; }
  container.innerHTML = `<div class="card"><div class="card-header"><h3>All Students (${allStudents.length})</h3></div>
    <div class="card-body" style="overflow-x:auto;"><table class="data-table student-table"><thead><tr><th>#</th><th>Email</th><th>Classroom</th><th>Subject</th><th>Semester</th></tr></thead>
    <tbody>${allStudents.map((s, i) => `<tr><td>${i + 1}</td><td class="font-semibold">${s.email}</td><td>${s.classroom}</td><td>${s.subject}</td><td>Sem ${s.semester}</td></tr>`).join('')}</tbody></table></div></div>`;
}

function renderCRPayments() {
  const container = document.getElementById('cr-payment-tracker-list');
  if (!container) return;
  let totalPaid = 0, totalPending = 0, totalCollected = 0;
  _polls.forEach(p => {
    const paid = p.responses.filter(r => r.paid).length;
    totalPaid += paid; totalPending += p.responses.filter(r => !r.paid).length;
    totalCollected += paid * p.price;
  });
  const totalStudents = totalPaid + totalPending;
  const rate = totalStudents > 0 ? Math.round((totalPaid / totalStudents) * 100) : 0;
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('pay-track-paid', totalPaid); el('pay-track-pending', totalPending);
  el('pay-track-collected', '₹' + totalCollected); el('pay-track-rate', rate + '%');
  el('cr-paid-badge', totalPaid);
  if (!_polls.length) { container.innerHTML = '<p class="text-muted text-center">No polls yet.</p>'; return; }
  container.innerHTML = _polls.map(p => {
    const paid = p.responses.filter(r => r.paid);
    const collected = paid.length * p.price;
    return `<div class="card" style="margin-top:16px;"><div class="card-header"><div><h3>${p.title}</h3><p class="text-xs text-muted">₹${p.price}/student</p></div><span class="badge badge-primary">₹${collected} collected</span></div>
      <div class="card-body"><table class="data-table student-table"><thead><tr><th>Student</th><th>Status</th><th>Verification</th><th>Amount</th></tr></thead>
      <tbody>${p.responses.map(r => `<tr><td class="font-semibold">${r.student}</td>
      <td>${r.paid ? '<span class="badge badge-primary">Submitted</span>' : '<span class="badge badge-danger">Pending</span>'}</td>
      <td>${r.verified ? '<span class="badge badge-success">✓ Verified</span>' : (r.paid ? '<span class="badge badge-warning">⏳ Awaiting</span>' : '—')}</td>
      <td>${r.paid ? '₹' + p.price : '—'}</td></tr>`).join('')}
      ${p.responses.length === 0 ? '<tr><td colspan="4" class="text-muted text-center">No responses yet</td></tr>' : ''}
      </tbody></table></div></div>`;
  }).join('');
}

function renderCRAnalytics() {
  const container = document.getElementById('cr-analytics-content');
  if (!container) return;
  const totalStudents = new Set();
  _classrooms.forEach(cl => { if (cl.joinedUsers) cl.joinedUsers.forEach(s => totalStudents.add(s)); });
  let totalRevenue = 0, totalPaid = 0, totalResponses = 0;
  _polls.forEach(p => {
    const paid = p.responses.filter(r => r.paid).length;
    totalPaid += paid; totalResponses += p.responses.length;
    totalRevenue += paid * p.price;
  });
  const avgResponse = _polls.length > 0 ? Math.round(totalResponses / _polls.length) : 0;
  const collectionRate = totalResponses > 0 ? Math.round((totalPaid / totalResponses) * 100) : 0;
  container.innerHTML = `
    <div class="stats-grid" style="margin-bottom:24px;">
      <div class="stat-card"><div class="stat-card-icon icon-bg-indigo">📊</div><div class="stat-card-info"><div class="stat-card-label">Total Polls</div><div class="stat-card-value">${_polls.length}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon icon-bg-green">₹</div><div class="stat-card-info"><div class="stat-card-label">Total Revenue</div><div class="stat-card-value">₹${totalRevenue}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon icon-bg-blue">📝</div><div class="stat-card-info"><div class="stat-card-label">Avg Responses</div><div class="stat-card-value">${avgResponse}</div></div></div>
      <div class="stat-card"><div class="stat-card-icon icon-bg-amber">📈</div><div class="stat-card-info"><div class="stat-card-label">Collection Rate</div><div class="stat-card-value">${collectionRate}%</div></div></div>
    </div>
    <div class="card"><div class="card-header"><h3>Revenue by Classroom</h3></div><div class="card-body">
      ${_classrooms.map(cl => {
    const clPolls = _polls.filter(p => p.classroomId === cl.id);
    let clRevenue = 0; clPolls.forEach(p => clRevenue += p.responses.filter(r => r.paid).length * p.price);
    const pct = totalRevenue > 0 ? Math.round((clRevenue / totalRevenue) * 100) : 0;
    return `<div style="padding:12px 0;border-bottom:1px solid var(--border-color);">
          <div class="flex items-center justify-between mb-2"><div class="font-semibold text-sm">${cl.name} — ${cl.subject}</div><span class="font-semibold" style="color:var(--primary);">₹${clRevenue}</span></div>
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <div class="text-xs text-muted" style="margin-top:4px;">${clPolls.length} polls · ${pct}% of revenue</div></div>`;
  }).join('')}
    </div></div>`;
}

// ============================================================
// STUDENT DASHBOARD
// ============================================================
function renderStudentStats() {
  const user = getLoggedInUser(); if (!user) return;
  const c = _classrooms;
  const p = _polls.filter(pp => pp.expiresAt > Date.now());
  const paid = _polls.reduce((s, pp) => s + pp.responses.filter(r => r.studentEmail === user.email && r.paid).length, 0);
  const inQ = _orders.filter(o => o.status === 'pending' || o.status === 'printing').length;
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('student-classrooms', c.length); el('student-active-polls', p.length); el('student-paid', paid); el('student-in-queue', inQ);
}

function renderStudentClassrooms() {
  const container = document.getElementById('student-classrooms-list');
  if (!container) return;
  const user = getLoggedInUser(); if (!user) return;
  if (!_classrooms.length) { container.innerHTML = '<p class="text-muted text-center">No classrooms joined.</p>'; return; }
  container.innerHTML = _classrooms.map(cl => `
    <div class="flex items-center justify-between" style="padding:10px 0;border-bottom:1px solid var(--border-color);cursor:pointer;" data-action="nav-active-polls">
      <div><div class="font-semibold text-sm">${cl.name} — ${cl.subject}</div><div class="text-xs text-muted">CR: ${cl.cr} · ${cl.joinedUsers?.length || 0} students</div></div>
      <span class="badge badge-success">Joined</span>
    </div>`).join('');
}

function renderStudentMyClassrooms() {
  const container = document.getElementById('student-my-classrooms-list');
  if (!container) return;
  const user = getLoggedInUser(); if (!user) return;
  if (!_classrooms.length) { container.innerHTML = '<p class="text-muted text-center">No classrooms joined yet. Use the "+ Join Class" button above to join one.</p>'; return; }
  container.innerHTML = _classrooms.map(cl => {
    const clPolls = _polls.filter(p => p.classroomId === cl.id && p.expiresAt > Date.now());
    return `<div class="flex items-center justify-between" style="padding:14px 0;border-bottom:1px solid var(--border-color);">
      <div>
        <div class="font-semibold">${cl.name} — ${cl.subject}</div>
        <div class="text-xs text-muted">CR: ${cl.cr} · Sem ${cl.semester} · ${cl.joinedUsers?.length || 0} students</div>
        <div class="text-xs" style="margin-top:4px;"><span class="badge badge-info">${clPolls.length} active poll${clPolls.length !== 1 ? 's' : ''}</span></div>
      </div>
      <span class="badge badge-success">Joined</span>
    </div>`;
  }).join('');
}

async function joinClassroom() {
  const input = document.getElementById('join-code-input');
  if (!input?.value.trim()) { showToast('warning', 'Enter Code', 'Please enter the join code.'); return; }
  try {
    const res = await fetch(API + '/classrooms/join', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ code: input.value.trim().toUpperCase() })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('success', 'Joined!', `Welcome to ${data.classroom.name}.`);
      input.value = '';
      document.getElementById('join-classroom-modal')?.classList.remove('active');
      refreshAll();
    } else { showToast('error', 'Error', data.error); }
  } catch (e) { showToast('error', 'Error', 'Network error'); }
}

const DEFAULT_QR = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCADcANwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD83Yeh5wMfrTqgDEEGp1+YcVEikNdc4I7Uwgkiptp9DRsJ7GknYLETUlKwwaStCQoxRUuOM44pN2HYipVPWnkZpg4P1oTuAp5xRnnFFHB5piEz1pOuKd2NNUHPvSAUYDEdqF44zk0vb9KD8pPai4CnIAx0pD0pcEKMnmjrQACgDNGcd6XGR1xk0wE6cUA4pKXoaAEopR2pKACiiikAy5HmQuvtmsqtWT/VP2+U/wAqyqYGqAMf/Xr9Gv8Aglv8FfAPxV+HPj6fxj4N0XxPPaa1bRW8uqWizNEhttxVSeQCecV+c2zAGK/U3/gjx/yTL4k/9h21/wDSWonsUtz6Yuf2Uv2f9Pmjjufhn4HtZXPyJPaQxs30DMCaa37Kn7PoIz8NfAoycD/RoeT/AN9V+c3/AAVeAP7VUGVDY8NWBGRnHzz9K8O8G/sr/F34i+GbLxD4Z+Huta5od4Ga2v7SNGil2sUYqSwPDKw6djWVirn7Kr+zR8BQqgfDnwHgAAf6FbdPzo/4Zq+A3/ROfAf/AIA23+NfkEf2Ifj3/wBEm8SH/thH/wDF1Fd/sV/HWytZrm4+FfiKGCFGkkkeFAFVQSSfn7AGqUfMV/I/YSP9mb4ESuqJ8N/AruxwqrYW5JPoAOteF/t2fs5fCzwX+y3468Q+H/h54c0XXLSO0+z6hYaekU0WbuFTtI6ZViPoTX5t/sm4P7TvwlYHg+J7Ag+o80V+tP8AwUS/5M2+In/XKz/9LYKlqzKTuj86/wDgmx4D8NfEj9pF9J8U6Fp/iLTE0G9uRZ6lbiaISK0IV9rcZAZsH3Nfqaf2UvgsAR/wqnwf/wCCiL/CvzO/4JR8ftVT4/6FrUP/AEOCv1U+JHxd8GfCDTbTUPGvibT/AAzZXcxt7ebUJColkC7iq4BJIHNEtHoEdtT81f8AgqR8H/C/w88RfDhPBPg6w0CG7sr5rtdE0/y1lZZYghfYOSAWxn1NfCdxaz2jBbiGWBiM7ZUKHHrgiv6D/hv8Z/A/xit9Qn8EeKNP8Tw2DpHdPp7swhZwSgbIHUK35V8Ef8FJf2dviZ8W/jno+seDfBOreJNLi8PwWsl3YxqyLKs87FDlhyA6n8atS6EtdUehfsE/Bb4T+M/2XPC+reKfBvhTWNbmub9ZrvVLWF7h1W6kVAxbnAUAD2r6MX9lr4KzxrInwt8HSIw+V00qEgj2IHNfkEP2JvjwjAn4VeI/+/Kf/F1+kvwB/aL+GXwY+CPgjwL448b6R4X8X+HtKjsNV0bUJGWezuEyWjcBSAwyOhqX5Ma8z1hv2V/g0Tn/AIVX4Rz/ANgiL/CqR/Zv+Be8k/DvwMGz0Njbda9Oa9h1nQDd2Eq3UF5ZmW2liPEivHlGU+hDAj61+Ges/sg/Gvw9pN7quqfDXX7OwsoXubq6miTZFGilndjv6AAkmklfqU9Oh+in7ZHwQ+Efhf8AZi+IWq+HvBfhLTNatbBHtbvT7WBJ4m8+IEoV5BwSOOxNfEX/AAT08F6B4+/aZsdH8S6NY69pTaRqErWWowLNEXWNSrbTxkHoa+ascZBr6t/4JjcftX6cf+oJqX/otavZEbtH6WXP7MfwVtFDT/DTwbApOA0umwoCfqarH9nL4G4/5J74Gx/15W1fPX/BWnn4K+Cv+xjb/wBJJa/Oj4c/BXx18Xl1A+C/C2o+Jf7P8v7X9gRW8nfu2bskddrY+hqUrq9y3o7WP2aP7OfwN/6J94G/8AramN+zp8Df+ifeB/8AwCtq/Jv/AIYw+OY6/C3xD/35T/4uj/hjH45c/wDFrfEOP+uKf/F0W8w5vI/WE/s6/A7/AKJ94H/8Arep/wDhmH4OPHuT4Y+EWUjIZdKiII9QcV+Ifi/wnq/gbXtT0HX9On0nWbBvKurG5AEkL7QdrAEjOCD+Nful8C/+SHfD3/sXNO/9JY6TTQ079D8Hr1Ql7cqoAUSuAB2G41DVi/8A+P8Auv8ArtJ/6Ear1qY2GyjMb+m08Vk1rS8ROfY/yrJqkI2M1+pn/BHn/kmXxJ/7Dtr/AOktflkBX6m/8EeRj4ZfEr/sO2v/AKS1M9io7nz1/wAFXv8Ak6qH/sWtP/8AQ56+9/8AgnYo/wCGNvh1kDPlXn/pbPXwR/wVe/5Oqg/7FvT/AP0Oevvj/gnZ/wAmbfDr/rnef+ls9Zy+FFR3Po7aPQVjeNFH/CGeIeB/yDLv/wBEPW1WN40/5EzxD/2DLv8A9EPUIs/B39kX/k5X4Q/9jHp3/oxa/Wv/AIKJH/jDf4if9crP/wBLYK/JX9kcY/aV+EP/AGMenf8Aoxa/Wf8A4KIH/jDj4if9crP/ANLYKt7kLY+C/wDglNx+1RMf+pbv/wD0OCvtv9vv9mjxd+014N8I6X4QuNLt7rSdSmu7g6pctCpR4dg2lUbJz244r8vf2Wv2hZf2Zfig/jGLQk8Qu2nT6f8AY5Lo24AlKHfuCt02dMd6+uP+HxN6c/8AFqbX2/4nr/8Axmm073QLaxo/AzWYf+CZFhrGkfF7ffXXjKWK900+Fh9tRY7ZWjk80v5e07pVwBnIz0r01v8Agqz8Fjz9h8WE/wDYLj/+PV8GfteftbT/ALV2p+F7ybwxF4ZOh29xAI4r03Pnea6Nkkou3GzHfOa7j9kn9gy2/af+Gl94rm8azeHHttUl077LHpq3AYJHG+/cZFxnzMYx2ost2Cb2R9cv/wAFVfgwygDT/FhLcf8AILi49/8AXV85fEL9iH4h/tS+MNf+LPg270K38K+Np5NZ0uPVr14LpIJRhRLGsbBW+U5AYj3r5s/aU+C8X7Pnxl1bwNFq766mnxW0v26S3EBk82FZMbAzYxux15xX7AfsZDzP2VvhKnTdoNsufqzUnpsGrZ6N4P02Xwt4E0LTr1kM2maVbW1w0R3LuigVXK+oyhx618g+Kf8AgoJ8LvjT4d1b4eeHrTxCmu+K7WXQdOlvdPSK3FxcoYYmkYSEqm51JOCQM8HpXGeL/wDgqndaX4v1zw1H8NYJIrfULjSluX1lgxCytDvKiLGeM4z7ZrZ8A/8ABLGy8BePfDniRfiTc3raNqVvqAtm0ZEExhkV9m7zTjO3GcHGaSVtyt9j5Y+Kf/BPP4n/AAd+Hut+MNdvPDkmk6NAJrlbK/kklKl1T5VMQBOWHccZrT/4JlcftX6YPTRdS/8ARS1+hP7drbv2SPiefXTkP/kzDX57f8Ezfl/aw07/ALA2pf8Aopaq90K1mj6c/wCCs5z8F/BP/Yxt/wCkktcX/wAEjAPJ+Kn+9pn8rmuz/wCCshz8GPBQ/wCpib/0llri/wDgkdxF8U+3zaZ/K5pfZG/iP0PIHoKjcDaeB09KcTTHOFP0rM3PxQ/bjH/GV/xRx0/tP/23ir9dfgYf+LH/AA9/7FzTv/SWOvyL/bi/5Ou+KR/6if8A7bxV+uPwNOPgf8Pv+xc0/wD9JY60lsjBbs/CW/8A+P8Auv8ArtJ/6Ear1Z1Af6fdf9dpP/QjUKgbc1oiCKUfuZP901k1sTDEMn+6f5Vj1SJZrg8e9fqb/wAEev8AkmXxJ/7Dtr/6S1+WY6Cv1G/4JAXlva/DT4kLNcRQltctSBJIq5/0X3NRLYcdzwH/AIKvD/jKiEjn/im9P/8AQ564X4Uft+fFz4L/AA/0nwb4ZutEi0TS1kW3W80lZ5RvkaRtzlhn5nav178a/Bv4VfEjWhrHivwl4W8R6qIVt/tupwwzS+Wudqbieg3HA9zWD/wy78Bf+iaeBv8AwBg/xqOZbF2Z+Z//AA9O+PP/AD++Gv8AwRJ/8XVfVf8Agp38dNX0y8sJ7/w8sN1C8Ehj0RAwV1KnB3dcE1+mx/Zf+A3b4aeB/wDwBg/xpo/Zi+BCdPht4H/8AYP8aLoSTPxv/ZOTZ+018JlAO1fE2ngfQSrX6xf8FDzn9jn4if8AXKz/APSyCu10f9nT4KeHdfstc0vwF4P07WLGVZ7W9tbaJJIJFOVdcHAYHocZrgf+ChOoWs/7H/xCjjuYJHMdnhUlVif9Mg7A1O7KtZH5rfsMfBDwv+0B8cZfCvi+O8l0ldHur0LY3Jt5PMjaIL8wB4+duK9X/wCCgn7I/wAPf2bvBfg7U/BdvqcN1qmpz2lx/aF+1yCiQ7xtBAwc96wv+CWU8dt+1FK8siRL/wAI5fjdIwUfeg7mvoH/AIK3MNS+G3w6SzIvGTW7pmW2PmlR9mAyQucVpfUnofl7XufwP/bM+JX7PXhK58N+D7jSYdMuLx7+Rb/TluH81lRSQxYYGEXj619H/wDBMj4SeB/Hvhz4hSeOvCej61Na3tkto2u2qs0atFKXEe/HBIXOPQV5p/wUe+HfhzwP8ctHsPBPhyx0fSX0CCaSDRbYLCZjPOGY7MjdhVz3wBTum7BbS589/Fz4s+IPjd49vvGHid7WTWr1Io5ms7cQRERoETCAnHyqM+teweAf+Chfxg+F3gbRvC+hXehJpOiWi21mtzpKyyBEyV3OW5PvX2L+wx8C/hf4u/Zi8Nap4s8EeG9T12W4vlmutWtIzcMFuXCbi+DgKABntivz5/at0PS/Df7RHxN0nRLK107SLTV7iG0tLJQsMUYUYVAOAvXpSunoDVj9HNJ/4J//AAh8YeGrLxpqNprja5q1jHrly8WrMkRuZYhcOVTbwvmMcL2HFfN3wm/4KMfGbxn8UvBuhaneaA2n6rrFnZXIh0dUcxSzIj7W3cHDHB7V+i/gLUbRPg54aQ3dvuHhu1GPOTOfsae9fin8AbC5g+OXw5kktbiNE8RaczO8LKqgXMeSSRwKla7jemx+tv7dvH7JXxPHppyf+lMNfnt/wTPb/jK7Tu3/ABJtS/8ARS1+gP7dGoWs37J/xORLmB3bT0wqSqSf9Jh7A1+fn/BNaaOD9qrTnlkSJP7G1IbnYKP9Wvc0LYb3Pp3/AIKxc/BnwT/2MTf+kktfCXwK/aa8c/s6jWh4Nm06H+2DCbr7fZC5z5W/ZtyRt/1jZ9eK/Z3xt4P8FfEiwt7HxXpWieI7O3l8+G31MRzJHJtK71BPBwSM+hrjD+zV8D/+id+C/wDwDg/xpKVlYpxbdz86v+HmXxv/AOfzw9/4JE/+KpD/AMFMfjewP+meHv8AwSp/8VX6KH9mv4IY/wCSd+C//AOD/Gmn9mz4If8ARO/Bn/gHB/jRzLsHK+5+MnxK8f6v8U/GmueLdeaB9Y1aU3F01tF5UZfYF+VATgYUcV+3XwOOPgh8Pv8AsXNP/wDSWOueb9m34I4x/wAK78Gc/wDTnB/jXountpGj6bbWFjJZWllawrBBbwyoqRRqu1UUZ4AAAA9qTlccY2ep+A19/wAf91/12k/9CNQVYvmze3P/AF2f/wBCNQsPmNbGJHcf6mT/AHT/ACrGrZm5hk/3T/KsarJZskV3nw3+BXxF+Llle3fgnwfq3ia1s5VhuZdNiDrFIV3BW+YYJHNcIPfvX2x+wF+2H4B/Zl8HeMNL8YQazLc6tqcN3b/2XZLOoRINh3EuuDntUMpHiZ/Yt+PgAP8AwqrxRz/07r/8XXl3jLwf4g+HviS88P8AibTLvRNbsyouLC8G2WLcoddwyeqsp+hr96PgT8dfDP7RPgVvFnhSO/TSheS2ONStxDL5kYUt8oZuPnGDn1r4j/a0/wCCfPxQ+Nf7QPivxr4duPDqaPqjW7QLfag0Uw2W8cbblEZx8yHv0xUKXcbXY/NlpSqlmdgo5J3GvZbT9jn46X1rDcW/wv8AE00MyLJHItuNrKwBBB39CCDXmfxF8F6h8OvFniTwrqzQNqei3U9hdNbPviMkZKttYgZGRwcCv6BvD15Dpvw/0m8nyILbRoJ5CoyQiWys2B34Bqm7AkfiUP2L/jznH/Cq/E+f+vcf/F1ieMf2ZPi58P8Aw3ea/wCJfAGvaLolmFNxfXsIWKIMwVdx3HqzAfU1+k4/4Kq/BJ8EW3iwgjIP9kJyP+/1cn8Uv2r/AAP+2n4D1T4M/D2HV4fGHicRpYSa3Zra2gMMi3D+ZKruV+SF8fKcnA75qbsLI/LZTtI5wcdq+yv+CZ/xa8HfCXx746vPGniaw8N2l7pNvBbTalIVWWQXBZlXg8hear/8OrvjRyftXhMf9xV//jNKP+CWPxpUf8fXhMH/ALCz/wDxmm2mCTNT/gpr8YfBXxZ8Q/DyfwV4o07xJDYWV7HdPp0pYQs8sRUNwOSFJH0r0n/gnL+0F8Nvhb8DdX0nxj410jw7qkuvz3KWuoTFZGiMMADgYPBKsPwNeQn/AIJZ/GnHN14UP/cWf/4zTf8Ah1r8aAf+Prwp9P7Wf/4zS0tYdne5N+1t8JvGn7RPx213x78MfDeo+OfBeoQWkVpreix+ZaztFAkcqqxIyVdWU8dQa+S/EnhzVfB3iC/0TW7GbTNY0+YwXdncjEkMg6qw9RkV+lPwq/aU8IfsQ+BbH4OfEaLU5/GGivLcXT6Fai7tCty5ni2yMyEnZIuflGDkc15D47/Yo+IX7T/jfWPiv4Nm0OLwt40u21fTE1S+aC6EEmAvmxiNgrfKcgMfrRfuFux8W6dN5eoWkjyFUWeNmYk4ADgk/lX7B/Gr9q/4N6/8IPHemaZ8SfD17qN7od9bWttDcEvLK8DqiL8vUkgD61+Qmq6FcaL4hvdFnZDd2l5JYyFGynmJIY2we43A8+lfVY/4Je/GVWI+1eFce+qv/wDGqHbQav0PkIFtoBJ6DOTQpweCQTxxX13/AMOvPjJnP2nwr/4NX/8AjVcL8Z/2IviL8B/As3i3xLLoL6VFcw2rDT75ppd8rFV+Uxrxkc80XFZnlHgD4YeLPipqdzp3hHQL/wAR31rD9omt9PTe8cW4LvIJHG4gfjVn4g/B3xt8JzYjxj4Y1Lw39u3/AGX+0I9nnbNu/bgnONy5+or6n/4JT4Pxm8Z5H/MuD/0rir6M/br/AGYPGP7RreCz4Sk0mP8AscXguRqV00GfN8rbtwjZ/wBW2enahuzsNRurn5q+A/gV8QvinplxqPhDwhq3iKxt5vs81xYRB0jl2hthJYc7WB/GumH7H3xtA5+GHiPn/p3X/wCKr63+DHxA0r/gnj4ev/A/xVW4uNb1y7/ty1bw5GL2EW+xYMO7GPD74m4weMHPNfX3wc+L+gfHPwJb+LfDcd4mlTzzW6i/hEUu+JtrZUM3GenNTzFKKZ+RTfsf/Gwcf8Kx8RgH/p3H/wAVSH9kD42r1+GfiPj/AKd1/wDiq/R34nft7fC/4T+PNZ8I61Dr8uq6TKILlrPTlki3lVbCsZBnhhziuWb/AIKb/BwggW3ig8df7KT/AOO0XYWj3PypdSjsrDDKSCD2I60Yz1NSXUonuZpFHyu7MM+hJNNCZHpVoyIpseTJ/un+VY5BGM8ZGa2p8GCTA42nn8Kxpzny/wDcFWhM2BxX1T+x3+xFF+1Z4Y8TatJ4xk8Mto1/FZCJNOFyJd8XmbsmRcY6Y5r5Xb1HGa/Uf/gkC2Phn8Sf+w5a/wDpLUy0Q1qz6d/ZY/Z7T9mT4Wt4Nj11vEStqVxqH2x7UW5/ehBs2Bm6bOue9evE18Aftzftu/Er9n/43Q+FPCD6LHpX9j2t6xv9OFxK0sjSBvmLDAwgwMV9PfsmfFDXPjL+z54T8Y+JGtm1rU0uGuDZweTF8lxJGu1MnHyoO/XNZNPc0v0Pm34rf8EsLb4rfE3xV4pPxJm0w+IdTnvjaDRllEBmYkru84bsZ64Ga4v/AIegzk/8IJ/wrmLbn/hHft/9sHOP+PXzdnlf8C259s96/SSBx9ph5/5aL/MV/PiVI+MXQ4/4Sb0/6fapa7kvTY+8h/wR7trdhF/wtac+V8mf7CXnHGf9f7VFN+x3F+wlG3xzi8WP40fwn+8GhyWAshdef/o2PODuV2+fu+6c7ccZzX3N8ePGV/8AD34S+PvFGlCE6lo2lXl/bC5TfH5kaMy7lyMjPbNfkV8Vv28fip8ZfAOq+DvEc2hvo2prGtwLPSxDKdkiyLh95x8yDtQrsHZH0P8A8Pebj/olcP8A4PW/+MUz/h71cHP/ABauHP8A2HW/+MV82/sQ/BPwx8ffjbJ4X8WpePpI0i6vQLG5MEnmRtGF+YA8fO3Fep/t8fsm+AP2cfB/hDU/BseqJdapqU9pcHUL83C7Eg3jaNowc96LK9hpvdHfH/grvcMP+SWQ5P8A1HG/+M19XfspftGt+0v8NdS8WzaHH4aWy1KWweD7Z56hUjjcyM5Vdo/ed+mOvNfAv7BP7L3w/wD2hfD3jq/8cnUY10O4tlinsr82qRxPFK8jP8pzjYDnsAa8n+O/7QEfiq1/4QH4fRSeF/hBpUrJp+j27lX1JgcG8vX+9NJIRuw2QowMZGaTS2Qcz3Z7h+2B8NPBnxV/aC1/xTB8cvhxo9tdRWsSWt1fzzzAxQJG24wROg+ZTj5jxX3V+yhdaLp/wN8FeH9J8U6F4sn8P6bFaXdzoF8txDvRjz2ZQc/xKK/DdTsGF+Ueg4rY8I+MNb8BeILXXfDmrXeh6xbNuivbGUxyL7Ej7w9VbIPcGhptCUkmfov4g/4JZW+ueMNT13/hZU0P2zUZdQ+z/wBiq2zfMZdm7zucZxnFfd7HJr89B+3N8SvF/wAB7Dxr4Yn0eDWfD19b6X4u06504TBlnYLb38J3DYjkMjJyFbpxX6EscZqW+5qrX0OG+OfxPHwZ+Evifxr/AGd/ax0a1FwLLzvK84mREA34O37+c4PSvieL9op/+Chj/wDCmptAXwIl5/xNv7ZiuzflDafP5flFY87t2M7uMdDX03+3G2f2TfiWB/0Dk/8ASiGvgD/gmx/ydTp//YH1H/0WtNJbkybvY+1P2Vv2Kov2ZPGOta9H4wk8RHUdOFh9nfTxb+X+9WTduEjZ+7jGO9aX7XH7WrfsvDwssfhceJH1v7STvvfswhEXl+iNuJ8z2xiq37dHx/8AFX7Pfw58Pax4S+wLf6hq5spX1C289RGIHk+Vdw5yo59K8E+AWP8Agoiuut8YP358ImEaX/wj/wDxL8fad/m+Zjdv/wBRHjpjn1pb6sd+kT5g/aj/AGj3/aa8a6Rr8nh9fDpsNO/s8W6XZuRJ+9eTfuKrj7+MY7V+gn/BOE/8Yp6T/wBhbUv/AEcKrD/gmp8FAeLfxHx3/tk//EV7n8JPhL4f+CXgiDwn4ZW7TSIZ5rhBez+dJvkbc/zYHGenFU2rWCMWndn5K/trDP7VnxOPpqg/9ERV4ojADnNfsF8RP2FfhX8U/HWr+Ktdh1ttW1acTXRtdUMUZbaq/Ku044Ud6/Kj4h+HdP8AC/xI8VaFZrL9j07Vruyt/NfcwjjmdE3N3OFGT3qk7mck46nKMwI4zmhXABB5phGCaKZNx0/+okA4+U1iSsH2Y7KAa2mJcFTyCMGsVwFdgOgJFWhM21GTz0Fdv8PfjB8Q/hlZXtt4L8V674dtLqVZbmLSJ3jSWQLtDMFHJA4+lcOeK/Qn/gmV8cPh58KfAXjuz8aeLtH8NXV7q9vPbRanNsaVFt9rMvB4B4qGykfDvjbxh4u+JOtLrHivVNX8RaqIktxealvll8tc7U3EdBuOB7mv2L/4J9o0X7IHw+V1ZGEd5lWBBH+mT9jXRf8ADYfwKIH/ABdPwrj/AK+//sa9K8I+L9D8eeHLTXfDeqWus6Ldhjb31k26KXaxVtp9mUj6is27lJH5BftLftRfF3w18fviXpuk/EnxLpmnWGuXsFpaWl80cUEaOQioo6AACv0s8K/sw/CK70bRNVm+GvhmbU5bW2vJLt9PUyNO0aSGQn+8XJbPrX5B/tYgn9pP4sADJPiLUAAP+ujV+rC/tb/BpfhgLFfid4cF+NB+ziAXhDiX7Js29Ou7j6035CR7trtrpHiTSb7S9WSy1LTr6J7e6tLl0eOeNhhkdSeQe4r5B/bV/Z/+FXg/9mXxpq/hfwJ4b0vXbZLb7Pd6baIs8ebqJW2lTnlSwPsTX5W+HdH1TxPqul6PpNvc6hq188dtbWkBLSzTNgBFGeWJ4r7B/Ys/Zu+K3gX9prwVrniXwDr2j6JaPcm4vb632wxhrWVV3HJ6syj6kU7Dvc+VfBXi/wAWfDjWTq/hXU9W8PaoYXtzeadvil8tsbk3AdDtGR7CtTx18WPiH8TrK0tfF3ibX/E1taSNNbw6nJJKsLsu0soI4JHFfub428deGPhtoLaz4p1nT/D2krIkJvL9xHH5jZ2rnHJODx7GvOz+158DsHHxR8K/+BX/ANjRfyHy+Z8Gfsi3N9pH7Hn7UUtsJbe7/syHYSCrbTBKrkZ5+6zfnXxcQAcDoOlfqp8YfiNF8TfjT4A8QfDOxk+Kvg2003UdA8YQeGF+0eVaXpRSj9MPtVpFHcx1+f37RX7Pev8A7Ovj650LVIZp9Ildn0jVzGVivrf+E5xxIBgOh5Ug8YIJFuS0eWUUU6KJ55UjjRpJJGCIiKWZmPQADkk+g5qiT339kpnuLb4w2EqGTTLjwRdSXIzwrx3EDQNt7nfwPTJr9avjRq99ofwj8dalpk8lpqVpod9cW08P345VgdkZfcEAivnj/gn5+zRqHwW8Eah4h8TWptPE/iERl7KUDfZ2yZMcT/7bFi7Dt8q9Qa+q9T1K10jTru/v7iK0sbWJ557idgqRRqCzMxPQAAkn2rF6s2UdD8mf2Zviz8Qvi78dPBfg7x54n13xX4Q1e7aDUtG1mV5rS6jEMjhZUIww3ojc91Ffph4T+Bvw4+HurprXh3wVoPh/VI43iF9ZWiwyKjjDLu9D0NUPC/7SHwp8a6/ZaLoHj3QNX1e9fZa2VncbpZm2lsKNvJwCfwryX/gpLKyfss6mUdlzrGnA7SRkeY3FUwSsrnD/APBVO5im+D3gxY5Y5CPELHCOGP8Ax6y+lfnv4C+KHjf4cC+Hg7xJrHh8Xmz7V/ZUzR+btzs37euNzY+pqDwL8N/FvxS1G50/wnoOoeJL22h+0TW9gnmNHHuC7yM8DJA/Gvt/9htV/Zbj8aD4wBfhydcNmdM/4SICD7YIvN83y+udvmR5/wB4U9lYj4mek/8ABPT4vav40+F/imfxx4wl1XVbXXFgjfW75fOjjaCPao3kEAvuwO5zX1t5ySIWjdXXsUYEfmK/M/8AbQ+H8v7R/wAUrDxb8HtEPj/TBpkdnquqeHohPEt2juVjkPGHERjPToVr3L9kj4keF/2e/gnYeDPiZ4gsfA/iyC+u7qXR9blMVzHFLIGicrg8MvIqbdTRPofNf7XHx++K/hP9onx7pmieNvEmk6PZ3whs7WyuHjhjXyYyAgAx1J+pr7T+GvwH+FXiz4deFtf13wT4a1TXtT0i0vNQv723R57i4khV5ZJCTy7OzEk8kk10R/az+CjTxq/xL8MuSd3zXO4DBHfbxX5DfFrV7bV/it401DT7pbmwutbvbi3nhclJY2uHZWX2III+tNambdn3OVvAFvLgKAFErgAem41FQeTRWhADrWNJ/rH/AN4/zrZ6VjS8SNn1P86qJLNzqMtThhenFMPXkcelfUP7Iv7FK/tUeGfEmqnxefDR0e+isvKGn/afN3xeZuz5i4x0xzU3saHzFkkj5v1r9pf+CfLlv2QPh/nr5d5/6WT184/8Og4wB/xdR89/+JEP/j9faP7P/wAJR8CfhD4f8DLqh1kaUsw+3GDyfN8yZ5fubmxjfjqelRJ3Q0u5+Mf7Vr7P2lPiq7dF8R37HHoJWr2XT/8AgmT8Z9V020u4ZfC4guoY549+rMG2uoYZ/ddcEcV9FfFr/gl5H8T/AIj+LPFX/CyG03+3tQuL/wCyf2MJPI81i2zd5w3Yz1wM19qAr4U8JDdm5XStOGcfKZRDD29M7PwzRfsFj8wfBX7C/wASv2fPGOi/E7xXJoLeGfB15FrupjT9QM9wbaBvMk8qMxrvfA4XIz619L/8PRPgrn/V+KR/3B1/+O15Gv8AwUMP7TKL8Kf+EEHh5PHIGgf2t/an2g2Quf3fm+V5S79u7O3cM+op/wDw6Nj7/FJ/w0Mf/H6PUEn0Nz40/Grw7+3/AODR8LfhYL2PxQl3FrZPiG3FlbfZ7cMJP3gZ/mzKmBjnnmvCD/wS/wDjSP8Alt4X/wDBu3/xqvWW+BK/8E3F/wCFvLrR+IDP/wASD+yGtv7Px9p+bzfN3Sfd8n7u3nd1GK9z/ZL/AG0G/ai8R+ItKPhEeG/7IsorzzhqH2nzd8vl7ceWuMdc80bbDSTdmeH/AAK1WD/gnDZazpfxe3y3Xi6WK803/hG1+3qI7dWjk8wnZtO6VcDnPPSvqjwB8QPh1+2P8NNQuYtFbW/DK3r2M1n4gsFXMyIrFlXc2MCQYYEHrXH/ALWv7Hq/tR6n4YvG8Vt4bOiQXEGwWAufO810bOd67cbMd+tfPz/F/wD4dpsfhemlf8LCGp/8VD/ajT/2f5fm/ufJ8vbJnH2fO7dzuxjjlPUfw6PY8u/aS8Kfs+/Bn4w614Rn8AeLneyjt5RJpHiVI4H82JZMBJo3ZcbsfePSvMz+0dofw+t7h/hP8OtO8GamYmVPEmrXTavq0XB5heQCOFv9pEz719Of8MuL+3qp+NreJT4IOvD7N/Yi2X23yPsv+j587em7d5e7G0YzjnrXxD8Zfh4PhZ8T/FngsX51IaLfS2H20xeV520D59mTt69MmmkiXdao/cP4f6hJcfDXwvfXkzyyvotpcTzOdzOxtkZ2PqSck+pNfLfiv9vL4YfGHw3rHgHw+NeOueKLWbQ9Pa700RQfaLlDDEZH3kqm51ycHA7dq8i0H/gqM2ieD9N0L/hW6zCz02LT/P8A7Z279kIi37fJ4zjOM18l/ALj45/Dr/sYtO/9KY6OUty6I+wv2a/2C/ih8JPjn4O8Wa9JoDaVpF201yLTUmllKmGRPlXyxnlh3r2z/gpL/wAmsaj/ANhjTv8A0Y1fUsp/eP8AU15V+0l8Ex+0H8Lrnwc2sHQhNeW939sFv5+PKYtt2bl65654qb33KtZWR+aP7EHx98Lfs9fEDxFrXixdQayv9JFlD/Z1sJ38zz0fkFlwMKea3/26P2mfB37RL+Cz4RXU1GkC8Fz/AGjaCD/W+Vs24Zs/cbPpxXrZ/wCCUMY/5qc//gkH/wAepD/wSjjH/NTXz/2BB/8AHqq6vcztK1jsf+CWpz8F/F2eT/wkX/trDXPftefsXfEP42/Gy/8AFnhuTRF0qaxtLdRe35hl3xRlWyuw8Z6c1lv8Rj/wTWP/AAgKWH/Cwhr/APxPvt7S/wBn+R/yw8rZiTd/qt27I+9jHGa+r/2dPjSf2gPhZa+MTpA0L7Rd3Nr9jFx5+3yn27t+1evXGOKm73LSTXKz8dfiR4E1b4XeONZ8Ja21udV0mf7PcG0k8yLdtVvlbAyMMO1czX6afGn/AIJ4p8Xfin4l8Z/8J42lHWboXP2L+yhL5XyKmN/mjP3c5wOtcS3/AASsjGcfEt+nfRR/8eq7oz5GfANFPmj8meWPOdjsmfXBI/pTKogD0rGuP9afqf5mtk9Kxrj/AFh+p/maqImbJOa9q+AX7XHj79nDR9Y0zwe2ki11S5S7uP7SsftDb0TYu07hgYrxWv0I/wCCZXwW8BfFLwD47uvGHhDSPEtzZ6vbw28up2wlaJGtyxVT2BPNQ9Bo8zP/AAVG+N3GD4XPv/Yp/wDjlNP/AAVE+N+evhgfTRv/ALZX6KSfslfA6M4b4XeEkPo1koP86j/4ZP8Agb/0THwj/wCAaf41N0XZn53H/gqH8bj/ANCwP+4Mf/jlV9R/4KafGnVLC6s5v+EZ8m5heCQJo5B2upVsHzODgmv0XP7J/wADf+iY+Ef/AADT/GmH9lD4Hf8ARMfCP/gGn+NF0PlZ+KngXxXf/DzxdoXiTSRF/aWi3cV7a/aE8yPzIyCu5cjcMjkZ5r6c/wCHn3xsHU+GP/BN/wDbK/Q7/hlD4IMQB8MfCRJ6AWa/414l+2p+zt8L/Av7MvjXW/D3gDQNF1i0S1MF9ZWYSWLddRK21s8ZViPoTRdMOVpHjfwT+NPiL9vjxo3wv+Kv2I+Fks5daH9g2/2G4+0QFVj/AHmX+XEr5GOeOeK6j48eGbH/AIJ1aNpPiT4QiUan4nuX0vUP+Ehf7fH5MSecmxcJtbf1OTxXwL4H8d+Jvh3rh1bwnrV/oOrGF4PtemyFJfLbG5cgdDgZ+gr7Z/YW1TUv2m/F3i3SvjBPcfETTNJ06G80+18S5uI7ad5tjyRg4wxQbSfSmxLX1POD/wAFOvjVjk+Gc/8AYH/+2V4d8bvjl4n/AGgvFlt4j8V/YTqVvZpYodPtvIj8tWdhlcnnLtzn0r6O/wCClnwr8H/C/wAQ/D+Hwh4Z0zw3Fe2V69ymmwCITMssQUt6kAkD616R/wAE7Pgd8PfiT8ENX1TxX4M0bxDqMevz26XWoWwkkWMQQMEB9AWY49zRotR2bdj5o+Ev7cHxM+C/gWw8H+HDog0ezklki+26d50uZJC7ZbeM8sccV9h+Af2O/h3+0n4I0T4qeMhrB8V+MLVdX1P+zb/7PbefITu8uPYdi/KOMn618b/tv+B9I8C/tKeJNG8M6JBo2jQW9k0NnYQFIULWyMxAHqxJPvXFaP8AtJ/Ffwh4fttG0f4g+IdK0zT4PJtbK3uykcCAHCquOAPSjfYV7aM/Rs/8Ezvgv/c8S/8Ag4/+11o+F/8Agnn8IvB/ibSde05fEAv9Lu4r2387Vd6eZG4ddw2cjIGR3r3DwZrUl38MtBv7i9E19LodtcSTySKXeU2qsWPqS2Sfevyl+DX7T/xb1/4weB7DUfiN4ivLG912ygubaW8JjljedA6EY6EEjHoanVmj5V0P05/aS+Imq/Cn4G+MvF+iLbtq2lWYntxdx+ZFvMqJllyM8OeM+lfnWf8Agpd8ZskZ8NH/ALhH/wBsr7r/AG3z/wAYq/Esf9Q9P/SmKvzr/YT8GeHvHv7RFlpHifSbLW9JfTL6VrPUEDxF1QFGIPcHpTWwpXukjpz/AMFLfjNjk+Gv/BR/9sr6q/YZ/aW8ZftDJ40bxcdNP9kmzFt/Z1p5H+t83fu+Y5+4uPxryX/gon8HvAHw5+GHha98I+FNG0C9uNbME0+mwKjvH9nkbaSD0yAfqKk/4JT8R/E7/e03+VxRpYSupWbPpn43fsn+Avj94isNb8WDVTfWVp9iiNhfeQnl72fkbTk5Y811/wAJPhRoHwU8EweFfDX2oaTBPLcIL2fzpN8jbmy2BxnpxXxz/wAFDvjJ8QPh38UvDOn+EvFWs6DYTaJ9olg02Uojy/aJF3Ngcnaqj8K+Trr9qX4vygRTfEzxMpzkL/aDI36YNKzsNySZ+1KfPKiZ+8wHHua/MTxp/wAFF/ivp3jHX7Kwi8P21jbahc29vFNphd0jSVkUMxcZOAMnA5rwn/hpf4tH/mpnirHtqsv+NecO7Suzuxd2JZmY5JJ5JJ7mml3JlO+wSuZZXdsbmYscepOTTadx5f8AtZ/Sm1ZmIxwpPoKyLlSspz7n9TWtKcROfY1l3J3yZP8Ank1USWa1fp3/AMEkWz8NviOf+o5a/wDpKa/MSv04/wCCSJx8NviN/wBhu1/9JTWctjSO54N/wVGmkT9p+ILI6j/hHbDhWI/imrwrwp+z38V/HWgWmueHfA3iPWtHuwxgvrKBnil2sVba2ecMpH1Br3L/AIKjnP7T8P8A2Lth/wChTV9xf8E/8f8ADIvw/wCP+Wd3/wClk1F9B2u7H5g/8MnfHH/omfi3/wABG/8AiqjuP2V/jZa28s83w28VxQxI0kkjWrAKqgkk/N0ABNfuKcelY3jDH/CI69x/zDbr/wBEvS5iuQ/En9l25kf9o/4XHzpGVvEdj/GSCPNHvX6j/t/f8mj+Pv8ArnZ/+lkNflj+yt/ycT8KP+xh0/8A9GLX6mft+n/jEjx9/wBc7T/0shpvdBH4WfDv/BMRFk/aalDKGH/CPX3DDP8AFDX6d+OPiP4Q+FthbXvivxBpfhm0upTBBNqEqwrK4G4qvqQOa/In9iz41eHPgJ8aH8UeKTejS20m6sv9At/Pk8yQxlflyOPkPOa+nfjv4osv+CiOj6R4b+EZlOpeGLl9Uv8A/hIU+wR+TKnkpsbL7m3dRgcUmtQi7I83/wCClfxU8H/FHxB8P5vCHibTfEkVlZXsdy+mziUQs0sRUN6EgEj6V6R/wTt+OPw++GvwR1fS/FfjPRvD2oy6/PcJa6hciORozBAocD0JVhn2NeMH/gmX8Z+//CM/+Dc//G6P+HZvxnHfwz/4Nz/8bo0tYXvXvY/QWb9qz4KuMt8TPCrsR1N6pP8AKvyX/ac17TPFH7QvxD1fRb231HSL3WZprW7tWDRTRkLhlI6g1h/Fj4Wa78F/Hd94R8Rm1/tezSKSX7FP50WJEDrhsDPDDPFeu+Av2Bvip8SPBWi+KtHGgHStXtVvLb7TqflyeW2cbl2HB46ZppJCbctD51+0SgY82THpvP8AjXb/AAF/5Lj8PP8AsYtP/wDSlK9xP/BNH4yj/oWv/Buf/jdafhf9hf4nfCDxNpHjrX/7C/sHwxeRa1qH2PUvNm+z27iaXy02Dc21GwuRk4GaLoSiz7r/AGuPDWreM/2dPH2iaFp1xqurXtksdvZWqb5ZWE8bYUdzgE/hX5XD9lP4zI5Zfhp4nU+osyP61+kfw6/bs+F/xX8c6R4U0I66dV1aYxW32vTfKi3bWf5m3nHCntX0BwRnFTexs0pan4tv+yt8Z5B8/wANfFDAf3rQn+Zr7R/4Jx/Cvxj8MI/iAPFvhnU/Dv202P2b+0YPL87YJ9231xuXP1FfaJx6V5V8cf2kvBn7Pi6P/wAJY+ohtWMv2ZdPszOcR7d5bkY++v1ovfQSilqdB46+L/gP4dX1tZ+LfFejaBeXERmhg1KdUd4923cAecZBGfUGrXhnWvCXxD02DxD4fn0jxBZ7nih1K0ijlAZTh1V9uQQeor4a+NvgXVP2+fEdj40+FfkHRdFtP7Gu/wC3pfsM32je03yph9y7JV+bPXIxxX1H+yV8Kde+CvwUsPCviT7J/asF7d3D/YpvNj2SSbl+bAycdeKlpFptvyPgP9p/4AeOLz9ofxtN4d+HuvTaRf6pJNYyWGmSPBMGRWdkKArgsWPbr+FfOEsTwSvFKjRyxsUdHBDKwOCCD0IPGK/e+OTy5EJJ2hgTj2Nfl5r/APwT4+Lus+Kteu4rTQ4bSa/uJoZJtXX94jSMykDaTyGH3sHg5qovozOUOqPlGinSoY5XRsblYqceoOKbWhiNdd0bD1BrLn++Px/ma1ScK30NZU/3x+P8zVImWxrV+m3/AASTOPht8Rv+w3a/+kpr8ya/TX/gkqf+LbfEUf8AUbtf/SWs3saR3PBf+CovP7T0P/Yu2H/oU1fcP7AB/wCMRfAH/XO8/wDSyavh7/gqGCf2nYiBn/inbD/0KauP+FP7d/xQ+DfgDSvB3h9NBOj6aJBAb3TTLL88jSNubzBn5nPbpS6FXSk7n7Jk1j+MP+RR17/sG3X/AKJevyw/4ee/Gn/nn4X/APBQf/jtV9R/4KXfGTU9PurOaPwz5NzC8D7NJIO11KnB8zg4JpWL50eN/sr/APJxHwp/7GDT/wD0YtfqV+32f+MSfHw/6Z2n/pZDX5b/ALLqeX+0b8LVAOF8RWIGfaVa/UX9vo/8Yk+Pf+udp/6Vw1T3RMfhZ+Np617p+yd+04P2YfEfiLVT4cPiP+17KKz8oXn2bytku/dnY2c9McU/9jD4LeHfj18ZZPDHig3o0tdJub3/AEC48mTzI2jC/NtPHznIxXp37dH7KPgb9nbwj4T1Lwk2rG51TUZrW4/tG9E67FhDjaNi4Oe9D7EJPdH2h+yh+1OP2n9M8TXY8NHw5/YtxbwbTe/afO81HbOdi7cbPfrXu5Nfil8B/wBqTxt+zrZa1a+El0potWlimuf7RszOd0asq7SGXAwxzXqR/wCCmfxlIx5Xhj/wUt/8dqbGimranO/8FCjj9rHxWf8Ap10//wBJY69I+EX/AAUgX4WfC7wv4PPw/bUjolgll9sGreV523PzbPKO3r0ya9S+Fn7O3hL9s7wLZfFz4iHUV8W6y8tvdDRboWlrtt3MEe2Iq2DsRc/McnJ4r4R+P/gzTvhp8ZPHPhjRvOOl6NqM1ra/aZPMk2KARubAyeeuBVaPQl3WqPsKf/gq7cGQ+T8MofL7eZrbbv0hxXPeO/8Agppd+N/BPiDw63w7t7NdW0+4sDcjWHcxCWNk3bfJGcbs4yM4r0O3/wCCc3w11v4babrltqniaz1KfRY79o4bqGZZJWthJtCvHwCx4GfbPevzfQlkUkYJAJHpUpJg3Jbntv7E42/tUfDcemoP/wCk8tfsaD8o+lfjl+xVgftT/Dj1/tF//SeWv0k/a2+L2u/BH4KXninw4lnJqsd9aWqfboTLEFkchjtBGTgcc0S3Khoj2ctmvgH/AIKpnMnwz/3dR/nb15h/w8m+MGD+78Nf+Cpv/jteVfHL9pHxh+0KdFPitdNH9kiYW39nWhg/1uzduyzZ+4uPxppMJSTVj0H9l79sofs3+DNW0E+Ej4g+36h9v+0DUPs+z90ke3b5bZ+5nOe9eyD/AIKnISB/wrVuf+o0P/jNfA2D6GvuL9k39jf4ffGj4LWPinxGdZGqzX13bt9ivhDHtjkCrhdh5x15ptImLk9Efa3wa+Iv/C3fhh4b8YCw/sr+2bb7R9j83zfK/eMmN2Bn7ueg618r+Of+Ck8fhDxnr+gL8Pnu10u/nsftB1YIZfKkZN23yjjO3OMmvrf4ceBNM+GPg3RPCui+f/ZWlReRb/apPMl27y3zNgZOWPavxr+NYP8AwuXx7x/zH7//ANKZKlK5pNuKRx00nnTySYxvdmx6ZOaZRRWhziMcKx9jWVP98fj/ADNa361k3RXzMgYUjiqiSzWr9Mv+CTLqvw3+Iu5lX/id2vUgf8utfmbUkdxLCCI5ZIweoRyufyqC07O5+7Pjn4E/DT4l62NY8V+DdD8QaqIVt/tl/CJJPLXO1M56Dcfzrnj+yT8D/wDomPhb/wABR/8AFV+JP225/wCfmf8A7+t/jR9tuf8An5n/AO/rf41Ni+fyP20P7JXwQ7fDHwt/4Cj/AOKpp/ZL+CP/AETHwt/4Cj/4qvxN+23P/PzP/wB/W/xo+23P/PzP/wB/W/xosHOux+3ui/sz/CHw1rNjq2lfD3w5p+p2My3Frd29uFkhlU5V1O7gg81xf7fEin9kzx6Ayn5LTow/5+4a/Hb7bc/8/M//AH9b/Gke6nkUq88rqeqtIxH5E0WDn0tY+rf+CZLhP2l5SSAP+Eevupx/FDXun/BVqRX+HXw92srH+2rnoQf+XYV+bccrxNujdo26ZRiD+lOkuJZgBJLJIByA7lsfnTtrclSsrH3B/wAE4PhD4G+J2gePpvGHhfSvEUtleWaWz6lFvMKtHKWC8jAJAz9K+xj+yj8Fcf8AJM/C/wD4CD/4qvxYjnlhz5cskeeuxyufyp/265/5+Z/+/rf40NFKSStY/eHwr4T0DwD4fh0Tw7ptnomkQF3isrMBIkLMWYgZ7kkn61+OX7XGH/ab+KHQqddnHsRha8r+3XJ/5eZ/+/rf41ExZyXYsxJ5Zucn60JWFKV1Y9Qtv2o/i7Z6dFYQfEbxDDZRQrbxwJd4RIwu0IBjoFAFeXAYFFFMi7Z7X+xaQv7U3w5JIA/tB+T/ANe8tfrX4v8AB/h74g6E2j+JNLstc0p3SVrO9UPGXU5VsZ6jPFfhUrtGwZWKsOhU4IqX7bc/8/M//f1v8aTVzSMuVWsfsmf2WPgyP+abeGf/AAFH/wAVUU/7L/wVt4meX4d+FoYxyXkgVQPxLV+OP225/wCfmf8A7+t/jTZLiWZdskski9druWH5GlZlc67H7C2n7OHwM1EH7J4G8H3e04P2dY5MH0+VzXofhHwh4f8AAOiR6P4b0uy0TSo5HlSzswEjVmOWIGepPWvwzi/cNmL90fWP5T+lTfbbn/n5n/7+t/jRyh7Rdj94BKoIO9Qf94V5nqn7Nnwl1jUbzUL74f8Ah66vrqV5555bYF5JGJZmJzySSSfrX41/bbn/AJ+Z/wDv63+NH225/wCfmf8A7+t/jRyh7RdhLtQl3OqgBRI4AHYbjioqKKsxA9DWVeDE2AMcc1q1mX6nz/XIFNbiZp0UUUhhRRRQAUUUUAFFFFABRRRQAUUUUAFLk4xk49KSgdeeKACinBQTjcAPU1NKkSREK6u/HIzQBXooooAKKKKAA47UUUUAFFFFABRRRQAVkTZ3DPv/ADNa9ZF1w6+65qoiZr0UUVIwooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACnbDx6ntTakm6p/uCgCMjBweCKKcZGKBSflFNoAKKKKAClCkgkDgdTTggMgXtmiUg7cAKOeB9aQCwQm4njiUgM7BQT0GTir9z8Pr+aXKzW20DA+Zh/Sq2lf8hO0/66r/OvSe9XEln/2Q==';

function renderStudentPolls() {
  const joinedContainer = document.getElementById('joined-polls-list');
  const availContainer = document.getElementById('available-polls-list');
  if (!joinedContainer && !availContainer) return;
  const user = getLoggedInUser(); if (!user) return;
  const allPolls = _polls.filter(p => pollTimeLeft(p) > 0 && !p.expired);

  // Separate joined from available
  const joinedPolls = allPolls.filter(p => p.participantStatus !== 'not_joined');
  const availablePolls = allPolls.filter(p => p.participantStatus === 'not_joined');

  const renderPollCard = (p) => {
    const tl = pollTimeLeft(p);
    const dStatus = getDeadlineStatus(p);
    const doc = p.document;
    const cl = _classrooms.find(c => c.id === p.classroomId);
    
    let actionHtml = '';
    if (p.participantStatus === 'verified') actionHtml = '<span class="badge badge-success">✓ Verified & Queued</span>';
    else if (p.participantStatus === 'paid') actionHtml = '<span class="badge badge-warning">⏳ Submitted (Awaiting Verification)</span>';
    else if (dStatus.disabled) actionHtml = '<span class="badge badge-danger">⛔ Deadline Closed</span>';
    else if (p.participantStatus === 'joined') actionHtml = `<button class="btn btn-primary btn-sm btn-action" data-action="pay" data-id="${p.id}"><svg class="icon-18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg> Pay ₹${p.price}</button>`;
    else actionHtml = `<button class="btn btn-outline-primary btn-sm btn-action" onclick="studentJoinPoll('${p.id}')">Join Poll</button>`;

    return `<div class="request-card animate-fade-in">
      <div class="flex items-center justify-between mb-2" style="flex-wrap:wrap;gap:8px;">
        <div><h3 style="margin-bottom:2px;">${p.title}</h3>
          <p class="text-xs text-muted">${cl?.name || ''} · ${p.responses.length} responded · ${timeAgo(p.createdAt)}</p></div>
        <span class="badge ${dStatus.cls}">${dStatus.label}</span>
      </div>
      ${p.desc ? `<p class="text-sm text-muted mb-3">${p.desc}</p>` : ''}
      ${doc ? `<div class="doc-info-card"><div class="doc-info-icon"><svg class="icon-28" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
        <div class="doc-info-details"><div class="font-semibold text-sm">${doc.name}</div><div class="text-xs text-muted">${doc.pages} pages · ${doc.size}</div></div></div>` : ''}
      <div class="poll-footer">
        <span class="text-lg font-bold" style="color:var(--primary);">₹${p.price} <span class="text-sm text-muted font-normal">per student</span></span>
        <div>
          ${actionHtml}
        </div>
      </div>
    </div>`;
  };

  if (joinedContainer) {
    joinedContainer.innerHTML = joinedPolls.length
      ? joinedPolls.map(renderPollCard).join('')
      : '<p class="text-muted text-center">No joined polls.</p>';
  }
  if (availContainer) {
    availContainer.innerHTML = availablePolls.length
      ? availablePolls.map(renderPollCard).join('')
      : '<p class="text-muted text-center">No available polls right now.</p>';
  }
}

async function studentJoinPoll(pollId) {
  try {
    const res = await fetch(API + '/polls/' + pollId + '/join', {
      method: 'POST', headers: authHeaders()
    });
    if (res.ok) {
      showToast('success', 'Joined', 'You have successfully joined the poll.');
      refreshAll();
    } else {
      const data = await res.json();
      showToast('error', 'Error', data.error || 'Failed to join poll');
    }
  } catch (e) {
    showToast('error', 'Error', 'Network error');
  }
}

function renderStudentQueue() {
  const container = document.getElementById('student-queue-list');
  if (!container) return;
  const orders = _orders.filter(o => o.status === 'pending' || o.status === 'printing');
  if (!orders.length) { container.innerHTML = '<p class="text-muted text-center">No items in queue.</p>'; return; }
  container.innerHTML = orders.map((o, i) => {
    const sMap = { pending: 'badge-warning', printing: 'badge-info' };
    const sLbl = { pending: '⏳ Pending', printing: '🖨️ Printing' };
    return `<div class="queue-item"><div class="queue-item-number">#${i + 1}</div>
      <div class="queue-item-info"><div class="font-semibold text-sm">${o.poll}</div><div class="text-xs text-muted">${o.file} · ${o.pages} pages</div></div>
      <div style="text-align:right;"><span class="badge ${sMap[o.status]}">${sLbl[o.status]}</span><div class="text-xs text-muted mt-2">~${(i + 1) * 4} min</div></div>
    </div>`;
  }).join('');
}

function updateQueueCard() {
  const card = document.getElementById('queue-status-card');
  if (!card) return;
  const orders = _orders.filter(o => o.status === 'pending' || o.status === 'printing');
  if (!orders.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  const pos = 1;
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('queue-position', '#' + pos); el('people-ahead', pos - 1); el('wait-time', (pos * 4) + ' min');
  const prog = document.getElementById('queue-progress');
  if (prog) prog.style.width = Math.max(10, 100 - pos * 15) + '%';
}

function renderStudentTracking() {
  const container = document.getElementById('student-tracking-list');
  if (!container) return;
  if (!_orders.length) { container.innerHTML = '<p class="text-muted text-center">No orders to track.</p>'; return; }
  container.innerHTML = _orders.map(o => {
    const steps = [
      { lbl: 'Joined Request', desc: `Responded to "${o.poll}"`, icon: '📝', s: 'completed' },
      { lbl: 'Payment Successful', desc: `₹${o.price} paid`, icon: '💳', s: 'completed' },
      { lbl: 'Added to Print Queue', desc: 'Order sent to print shop', icon: '📋', s: o.status === 'pending' ? 'active' : 'completed' },
      { lbl: 'Printing in Progress', desc: 'Document being printed', icon: '🖨️', s: o.status === 'printing' ? 'active' : (o.status === 'ready' || o.status === 'collected' ? 'completed' : 'pending') },
      { lbl: 'Ready for Pickup', desc: 'Collect from print shop', icon: '📦', s: o.status === 'ready' ? 'active' : (o.status === 'collected' ? 'completed' : 'pending') },
    ];
    const sBadge = { pending: 'badge-warning', printing: 'badge-info', ready: 'badge-success', collected: 'badge-gray' };
    return `<div class="card"><div class="card-header"><h3>${o.poll}</h3><span class="badge ${sBadge[o.status] || 'badge-gray'}">${o.status}</span></div>
      <div class="card-body"><div class="tracking-timeline">${steps.map(st => `
        <div class="timeline-step ${st.s}"><div class="timeline-dot">${st.icon}</div><div class="timeline-info"><h4>${st.lbl}</h4><p>${st.desc}</p></div></div>`).join('')}</div></div></div>`;
  }).join('');
}

function renderStudentActivity() {
  const container = document.getElementById('student-recent-activity');
  if (!container) return;
  const orders = _orders.slice(0, 4);
  if (!orders.length) { container.innerHTML = '<p class="text-muted text-center">No activity yet.</p>'; return; }
  const sIcon = { pending: '⏳', printing: '🖨️', ready: '✓', collected: '✓' };
  const sBadge = { pending: 'badge-warning', printing: 'badge-info', ready: 'badge-success', collected: 'badge-gray' };
  container.innerHTML = orders.map(o => `
    <div class="flex items-center justify-between" style="padding:10px 0;border-bottom:1px solid var(--border-color);">
      <div><div class="text-sm font-semibold">${o.poll}</div><div class="text-xs text-muted">${o.classroom} · ₹${o.price}</div></div>
      <span class="badge ${sBadge[o.status]}">${sIcon[o.status]} ${o.status}</span>
    </div>`).join('');
}

// ==================== Payment Gateway (Fake Popup) ====================
let _payPollId = null;

function openPaymentModal(pollId) {
  const p = _polls.find(pp => pp.id === pollId);
  if (!p) return;
  _payPollId = pollId;

  // Build URL params for the fake-payment page
  const params = new URLSearchParams({
    pollId: p.id,
    amount: p.price,
    title: encodeURIComponent(p.title)
  });

  // Open the fake-payment gateway as a centred popup
  const w = 780, h = 620;
  const left = Math.round(window.screenX + (window.outerWidth  - w) / 2);
  const top  = Math.round(window.screenY + (window.outerHeight - h) / 2);
  window.open(
    '/fake-payment/index.html?' + params.toString(),
    'FakePayGateway',
    `width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );
}

function closePaymentModal() {
  _payPollId = null;
  refreshAll();
}

// Listen for the payment-success postMessage from the popup
window.addEventListener('message', async (event) => {
  if (!event.data || event.data.type !== 'PAYMENT_SUCCESS') return;
  const pollId = event.data.pollId;
  if (!pollId) return;
  _payPollId = pollId;

  // Payment data handled by backend API only — no localStorage
  await processPayment('fake-gateway');
});

async function processPayment(method) {
  const user = getLoggedInUser();
  if (!user) return;
  try {
    const res = await fetch(API + '/payments/confirm', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ pollId: _payPollId, method: method || 'fake-gateway' })
    });
    const data = await res.json();
    if (res.ok) {
      showToast('success', '🎉 Payment Submitted!', 'Awaiting shopkeeper verification.');
      playSuccessSound();
      refreshAll();
    } else {
      showToast('error', 'Payment Error', data.error);
    }
  } catch (e) {
    showToast('error', 'Network Error', 'Could not confirm payment. Please try again.');
  }
}

// Stub kept for compatibility (no-op now that we use popup)
function stopQrScanner() {}
function openQrScanner() {}
function cancelQrScanner() {}

// ==================== SOCKET.IO ====================
if (socket) {
  socket.on('student-joined', (data) => { showToast('info', 'Student Joined', `${data.student} joined ${data.classroom}`); refreshAll(); });
  socket.on('payment-success', (data) => { showToast('success', 'Payment', `${data.student} paid ₹${data.amount}`); refreshAll(); });
  socket.on('payment-submitted', (data) => {
    if (getLoggedInUser()?.role === 'shop' || getLoggedInUser()?.role === 'coordinator') {
      showToast('info', 'Payment Submitted', `${data.student} submitted ₹${data.amount} for ${data.pollTitle}`);
    }
    refreshAll();
  });
  socket.on('payment-verified', (data) => {
    const u = getLoggedInUser();
    if (u?.email === data.studentEmail) showToast('success', 'Payment Verified!', `Your payment for ${data.pollTitle} was verified and added to the queue.`);
    else showToast('success', 'Payment Verified', `${data.student}'s payment was verified.`);
    refreshAll();
  });
  socket.on('payment-rejected', (data) => {
    const u = getLoggedInUser();
    if (u?.email === data.studentEmail) showToast('error', 'Payment Rejected', `Your payment for ${data.pollTitle} was rejected. ${data.reason}`);
    refreshAll();
  });
  socket.on('order-updated', () => refreshAll());
  socket.on('poll-created', (data) => { showToast('info', 'New Poll', `"${data.poll.title}" is live`); refreshAll(); });

  // Deadline alerts
  socket.on('deadline:10min', (data) => {
    showToast('warning', '⏰ 10 Minutes Left', data.message);
    NotifEngine.add('warning', '10 Min Warning', data.message);
    refreshAll();
  });
  socket.on('deadline:5min', (data) => {
    showToast('warning', '⚠️ 5 Minutes Left', data.message);
    NotifEngine.add('warning', '5 Min Warning', data.message);
    refreshAll();
  });
  socket.on('deadline:1min', (data) => {
    showToast('error', '🔴 Last Chance!', data.message);
    NotifEngine.add('warning', 'Last Chance', data.message);
    refreshAll();
  });
  socket.on('deadline:expired', (data) => {
    showToast('error', '⛔ Deadline Closed', `"${data.title}" has expired.`);
    NotifEngine.add('warning', 'Deadline Expired', `"${data.title}" is now closed.`);
    refreshAll();
  });

  // Order lifecycle events
  socket.on('status_updated', (data) => {
    showToast('info', 'Order Updated', `Order moved to "${data.newStatus}"`);
    refreshAll();
  });
  socket.on('order_collected', (data) => {
    showToast('success', '📦 Order Collected', data.message || 'An order was collected.');
    refreshAll();
  });
}

// ==================== NOTIFICATION ENGINE ====================
const NotifEngine = {
  items: [],
  add(type, title, message) {
    this.items.unshift({ type, title, message, time: Date.now(), read: false });
    if (this.items.length > 30) this.items.length = 30;
    this.renderBell(); this.renderPanel();
    const typeMap = { poll: 'info', warning: 'warning', payment: 'success', info: 'info' };
    showToast(typeMap[type] || 'info', title, message);
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
    if (!this.items.length) { body.innerHTML = '<div class="notif-panel-empty">🔔 No notifications yet</div>'; return; }
    const iconMap = { poll: '📝', warning: '⚠️', payment: '💳', info: 'ℹ️' };
    const clsMap = { poll: 'notif-icon-poll', warning: 'notif-icon-warning', payment: 'notif-icon-payment', info: 'notif-icon-info' };
    body.innerHTML = this.items.slice(0, 20).map(n => `
      <div class="notif-item ${n.read ? '' : 'unread'}">
        <div class="notif-icon ${clsMap[n.type] || 'notif-icon-info'}">${iconMap[n.type] || 'ℹ️'}</div>
        <div class="notif-body"><div class="notif-title">${n.title}</div><div class="notif-desc">${n.message}</div><div class="notif-time">${timeAgo(n.time)}</div></div>
      </div>`).join('');
  },
  togglePanel() {
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      this.items.forEach(n => n.read = true);
      this.renderBell(); this.renderPanel();
    }
  },
  clearAll() { this.items = []; this.renderBell(); this.renderPanel(); },
  init() { this.renderBell(); this.renderPanel(); }
};

// Close panel on outside click
document.addEventListener('click', (e) => {
  const panel = document.getElementById('notif-panel');
  const wrap = e.target.closest('.notif-bell-wrap');
  if (panel && panel.classList.contains('open') && !wrap) panel.classList.remove('open');
}, true);

// ==================== GLOBAL EVENT DELEGATION ====================
document.addEventListener('click', (e) => {
  const navItem = e.target.closest('.nav-item[data-section]');
  if (navItem) { showSection(navItem); return; }

  const actionNav = e.target.closest('[data-action]');
  if (actionNav && !actionNav.closest('.btn-action')) {
    const act = actionNav.getAttribute('data-action');
    if (act === 'open-create-classroom') document.getElementById('create-classroom-modal')?.classList.add('active');
    if (act === 'open-create-poll') document.getElementById('create-poll-modal')?.classList.add('active');
    if (act === 'open-join-classroom') document.getElementById('join-classroom-modal')?.classList.add('active');
    if (act !== 'nav-my-classrooms' && act !== 'nav-active-polls') return;
  }

  if (e.target.closest('#btn-toggle-sidebar')) { toggleSidebar(); return; }
  if (e.target.closest('.sidebar-overlay')) { toggleSidebar(); return; }
  if (e.target.closest('#btn-toggle-theme') || e.target.closest('#theme-toggle-landing')) { toggleTheme(); return; }

  const actionBtn = e.target.closest('.btn-action');
  if (actionBtn) {
    const act = actionBtn.getAttribute('data-action');
    const id = actionBtn.getAttribute('data-id');
    if (act === 'pay') openPaymentModal(id);
    return;
  }

  const genericNav = e.target.closest('[data-action="nav-my-classrooms"]');
  if (genericNav) {
    const target = document.querySelector('.nav-item[data-section="student-active-polls-section"]') || document.querySelector('.nav-item[data-section="cr-classrooms-section"]');
    if (target) showSection(target); return;
  }
  const genericNavPolls = e.target.closest('[data-action="nav-active-polls"]');
  if (genericNavPolls) {
    const target = document.querySelector('.nav-item[data-section="student-active-polls-section"]');
    if (target) showSection(target); return;
  }

  if (e.target.closest('.modal-close, .btn-close-modal') || (e.target.classList.contains('modal-overlay') && !e.target.closest('.modal'))) {
    const p = e.target.closest('.modal-overlay') || e.target;
    if (p && p.classList && p.classList.contains('modal-overlay')) { p.classList.remove('active'); stopQrScanner(); }
    return;
  }

  if (e.target.closest('#btn-submit-classroom')) createClassroom();
  if (e.target.closest('#btn-submit-join-classroom')) joinClassroom();
  if (e.target.closest('#btn-submit-poll')) createPrintPoll();
  if (e.target.closest('#btn-payment-done')) closePaymentModal();
  if (e.target.closest('#btn-remove-cr-file')) removeCRFile();
  if (e.target.closest('#btn-remove-qr')) removeQRFile();
  if (e.target.closest('#cr-upload-zone')) document.getElementById('cr-file-input')?.click();
  if (e.target.closest('#btn-scan-qr')) openQrScanner();
  if (e.target.closest('#btn-cancel-scanner')) cancelQrScanner();

  const statusTab = e.target.closest('#status-tabs .tab');
  if (statusTab) { filterStatusQueue(statusTab.getAttribute('data-filter'), statusTab); return; }
});

// ==================== AUTH GUARD ====================
function requireAuth(expectedRole) {
  const token = getToken();
  const user = getLoggedInUser();

  console.log('[Auth Guard] Token exists:', !!token);
  console.log('[Auth Guard] User:', user);
  console.log('[Auth Guard] Expected role:', expectedRole);

  if (!token || !user) {
    console.log('[Auth Guard] No token or user → redirecting to login');
    localStorage.removeItem('ps-token');
    localStorage.removeItem('loggedInUser');
    window.location.href = 'login.html';
    return false;
  }

  if (user.role !== expectedRole) {
    console.log(`[Auth Guard] Role mismatch: user is "${user.role}", expected "${expectedRole}" → redirecting`);
    // Redirect to correct dashboard based on actual role, or login if unknown
    const roleRedirects = { coordinator: 'cr.html', shop: 'shopkeeper.html', student: 'student.html' };
    const dest = roleRedirects[user.role] || 'login.html';
    window.location.href = dest;
    return false;
  }

  console.log('[Auth Guard] ✅ Authorized as', expectedRole);
  return true;
}

function handleLogout(e) {
  if (e) e.preventDefault();
  console.log('[Auth] Logging out — clearing session');
  localStorage.removeItem('ps-token');
  localStorage.removeItem('loggedInUser');
  window.location.href = 'login.html';
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  // Detect which dashboard page we're on and enforce role
  const isStudentPage = !!document.getElementById('student-overview');
  const isCRPage = !!document.getElementById('cr-overview');

  if (isStudentPage) {
    if (!requireAuth('student')) return;
  } else if (isCRPage) {
    if (!requireAuth('coordinator')) return;
  }

  // Wire up logout buttons
  document.getElementById('student-logout-btn')?.addEventListener('click', handleLogout);
  document.getElementById('cr-logout-btn')?.addEventListener('click', handleLogout);

  refreshAll();
  setupCRFileUpload();
  NotifEngine.init();
  setInterval(() => { renderStudentPolls(); renderStatusQueue(); }, 5000);
  setTimeout(() => {
    if (isCRPage) {
      const user = getLoggedInUser();
      const n = user ? user.name.split(' ')[0] : 'Coordinator';
      showToast('info', `Welcome, ${n}`, 'Manage classrooms and polls.');
    }
    if (isStudentPage) {
      const user = getLoggedInUser();
      const n = user ? user.name.split(' ')[0] : 'Student';
      showToast('info', `Welcome, ${n}`, 'Check polls and pay online.');
    }
  }, 800);
});