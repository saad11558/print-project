const fs = require('fs');

let content = fs.readFileSync('c:/Users/saach/Downloads/pprint-2/pprint-2/js/shop.js', 'utf8');

// Replace renderAll to inject updateDashboard
content = content.replace(
`// ==================== RENDERERS ====================
function renderAll() {
  renderDashboard();
  renderPaymentsData();
  renderOrdersTable();
  renderPaymentTracker();
  renderAnalytics();
  renderHistory();
  renderBadges();
  renderAIVerificationPanel();
}`,
`// ==================== RENDERERS ====================
window.updateDashboard = function() {
  console.log("updateDashboard() called");
  const paymentsData = JSON.parse(localStorage.getItem('paymentsData') || '[]');

  const totalOrders = paymentsData.length;
  const verifiedPayments = paymentsData.filter(p => p.status === 'Verified' || p.status === 'Demo Paid').length;
  const pendingPayments = paymentsData.filter(p => p.status === 'Pending').length;
  const rejectedPayments = paymentsData.filter(p => p.status === 'Rejected').length;
  const totalRevenue = paymentsData.reduce((sum, p) => {
    if (p.status === 'Verified' || p.status === 'Demo Paid') {
      return sum + (Number(p.amount) || 0);
    }
    return sum;
  }, 0);

  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  el('shop-total-orders', totalOrders);
  el('shop-verified-payments', verifiedPayments);
  el('shop-submitted-payments', pendingPayments);
  el('shop-total-revenue', '₹' + totalRevenue);

  renderPaymentTracker();
  renderHistory();
  renderAIVerificationPanel();
  if (typeof renderPaymentsData === 'function') renderPaymentsData();
};

function renderAll() {
  renderDashboard();
  updateDashboard();
  renderOrdersTable();
  renderAnalytics();
  renderBadges();
}`
);

// Replace renderPaymentTracker
const renderTrackerRegex = /function renderPaymentTracker\(\) \{[\s\S]*?\}\n\nfunction renderAnalytics/m;
const renderTrackerCode = `function renderPaymentTracker() {
  const paymentsData = JSON.parse(localStorage.getItem('paymentsData') || '[]');
  const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  const verified = paymentsData.filter(p => p.status === 'Verified' || p.status === 'Demo Paid');
  const pending = paymentsData.filter(p => p.status === 'Pending');
  const totalCollected = verified.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  el('pay-verified', verified.length);
  el('pay-submitted', pending.length);
  el('pay-total', '₹' + totalCollected);

  const tbody = document.getElementById('payments-tbody');
  if (!tbody) return;
  if (!paymentsData.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-muted text-center">No payments yet.</td></tr>';
    return;
  }
  tbody.innerHTML = paymentsData.sort((a,b)=>b.uploadTime-a.uploadTime).map((p, i) => {
    let pMap = { 'Pending': 'badge-warning', 'Demo Paid': 'badge-primary', 'Verified': 'badge-success', 'Rejected': 'badge-danger', 'Suspicious': 'badge-warning' };
    let actionBtn = \`<span class="text-muted text-xs">\${String(p.status).toUpperCase()}</span>\`;
    return \`<tr>
      <td>\${i + 1}</td>
      <td class="font-semibold">\${p.studentName}</td>
      <td>\${p.pollId || '—'}</td>
      <td>—</td>
      <td class="font-semibold" style="color:var(--success);">₹\${p.amount}</td>
      <td><span class="badge \${pMap[p.status] || 'badge-gray'}">\${p.status}</span></td>
      <td><code style="font-size:0.7rem;">\${p.txnId || '—'}</code></td>
      <td class="text-muted text-xs">\${timeAgo(p.uploadTime)}</td>
      <td>\${actionBtn}</td>
    </tr>\`;
  }).join('');
}

function renderAnalytics`;
content = content.replace(renderTrackerRegex, renderTrackerCode);

// Replace renderHistory
const renderHistoryRegex = /function renderHistory\(\) \{[\s\S]*?\}\n\nfunction renderBadges/m;
const renderHistoryCode = `function renderHistory() {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;
  const paymentsData = JSON.parse(localStorage.getItem('paymentsData') || '[]');
  const completed = paymentsData.filter(p => p.status === 'Verified' || p.status === 'Demo Paid')
                                .sort((a, b) => b.uploadTime - a.uploadTime);
  if (!completed.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-muted text-center">No completed transactions yet.</td></tr>';
    return;
  }
  tbody.innerHTML = completed.map((p, i) => {
    return \`<tr>
      <td>\${i + 1}</td>
      <td><code style="font-size:0.7rem;">\${p.txnId || '—'}</code></td>
      <td class="font-semibold">\${p.studentName}</td>
      <td class="font-semibold" style="color:var(--success);">₹\${p.amount}</td>
      <td><span class="badge badge-info">\${(p.paymentType || 'QR').toUpperCase()}</span></td>
      <td><span class="badge badge-success">\${p.status}</span></td>
      <td class="text-muted text-xs">\${new Date(p.uploadTime).toLocaleString()}</td>
    </tr>\`;
  }).join('');
}

function renderBadges`;
content = content.replace(renderHistoryRegex, renderHistoryCode);

// Replace renderAIVerificationPanel and verifyWithAI
const aiPanelRegex = /\/\/ ==================== AI VERIFICATION PANEL ====================[\s\S]*?window\.verifyWithAI = function\(id\) \{[\s\S]*?\};\n\n\/\/ ==================== ORDER STATUS UPDATE ====================/m;
const aiPanelCode = `// ==================== AI VERIFICATION PANEL ====================
function renderAIVerificationPanel() {
  const tbody = document.getElementById('ai-verify-tbody');
  if (!tbody) return;
  const paymentsData = JSON.parse(localStorage.getItem('paymentsData') || '[]');
  const pendingProofs = paymentsData.filter(p => p.status === 'Pending').sort((a,b) => b.uploadTime - a.uploadTime);
  
  if (!pendingProofs.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-muted text-center">No pending payment proofs.</td></tr>';
    return;
  }
  
  tbody.innerHTML = pendingProofs.map(p => {
    let statusBadge = '<span class="badge badge-warning">⏳ Pending</span>';
    let btnHtml = \`<button class="btn btn-sm btn-primary ai-verify-btn" onclick="verifyWithAI('\${p.id}')">👉 Verify with AI</button>\`;
    return \`<tr>
      <td class="font-semibold">\${p.studentName}</td>
      <td>
        <img src="\${p.image}" alt="Proof Thumbnail" style="width: 60px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid var(--border-color); cursor: pointer;" onclick="var w=window.open('');w.document.write('<img src=\\'\${p.image}\\' style=\\'max-width:100%\\'>');">
      </td>
      <td class="text-muted text-xs">\${timeAgo(p.uploadTime)}</td>
      <td>\${statusBadge}</td>
      <td id="ai-action-\${p.id}">\${btnHtml}</td>
    </tr>\`;
  }).join('');
}

window.verifyWithAI = function(id) {
  const btnCell = document.getElementById(\`ai-action-\${id}\`);
  if (btnCell) btnCell.innerHTML = \`<span class="text-muted text-xs" style="animation: pulse 1s infinite;">AI is analyzing payment...</span>\`;
  
  setTimeout(() => {
    let paymentsData = JSON.parse(localStorage.getItem('paymentsData') || '[]');
    const proofIndex = paymentsData.findIndex(p => p.id === id);
    if (proofIndex === -1) return;
    
    const p = paymentsData[proofIndex];
    let status = 'Verified';
    
    const age = Date.now() - p.uploadTime;
    if (age > 600000) status = 'Suspicious';
    
    const duplicates = paymentsData.filter(op => op.id !== p.id && op.image === p.image && op.image);
    if (duplicates.length > 0) status = 'Suspicious';
    
    if (!p.image || p.image.length < 1000) status = 'Rejected';
    
    paymentsData[proofIndex].status = status;
    localStorage.setItem('paymentsData', JSON.stringify(paymentsData));
    
    updateDashboard();
    
    if (status === 'Verified') playSuccessSound();
    showToast(status === 'Verified' ? 'success' : (status === 'Suspicious' ? 'warning' : 'error'), 'AI Analysis Complete', \`Screenshot marked as \${status}\`);
  }, 2000);
};

// ==================== ORDER STATUS UPDATE ====================`;
content = content.replace(aiPanelRegex, aiPanelCode);

// Event listener replacements
content = content.replace(
`window.addEventListener('storage', (e) => {
  if (e.key === 'paymentsData') {
    renderPaymentsData();
  }
});
window.addEventListener('paymentsDataUpdated', renderPaymentsData);`,
`window.addEventListener('storage', (e) => {
  if (e.key === 'paymentsData') {
    updateDashboard();
  }
});
window.addEventListener('paymentsDataUpdated', updateDashboard);`
);

fs.writeFileSync('c:/Users/saach/Downloads/pprint-2/pprint-2/js/shop.js', content);
console.log('Update Complete.');
