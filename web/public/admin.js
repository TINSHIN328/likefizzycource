async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const msg = data.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

function formatDate(value) {
  if (!value) return "—";
  const timestamp = typeof value === 'string' ? parseInt(value) : value;
  if (isNaN(timestamp)) return "—";
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function setStatus(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  if (el) {
    el.textContent = message;
    el.className = `status-text ${isError ? 'status-text--error' : 'status-text--success'}`;
  }
}

// Tab switching
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.getAttribute('data-tab');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    document.getElementById(`tab-${tab}`).style.display = 'block';
    
    // Load data for specific tabs
    if (tab === 'users') loadUsers();
    else if (tab === 'licenses') loadLicenses();
    else if (tab === 'blacklist') loadBlacklist();
    else if (tab === 'splitmode') loadSplitMode();
    else if (tab === 'accounts') loadAccountsByUser();
  });
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
});

// Refresh
document.getElementById('refresh-btn').addEventListener('click', () => {
  const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
  if (activeTab === 'users') loadUsers();
  else if (activeTab === 'licenses') loadLicenses();
  else if (activeTab === 'blacklist') loadBlacklist();
  else if (activeTab === 'splitmode') loadSplitMode();
  else if (activeTab === 'accounts') loadAccountsByUser();
});

// ===== USERS TAB =====

async function loadUsers() {
  const container = document.getElementById('users-list');
  const countEl = document.getElementById('user-count');
  
  try {
    container.innerHTML = '<div class="loading">Loading...</div>';
    const data = await api('/api/admin/users');
    
    if (data.users.length === 0) {
      container.innerHTML = '<p class="subtle">No users found.</p>';
      countEl.textContent = '0 users';
      return;
    }

    countEl.textContent = `${data.users.length} users`;
    
    container.innerHTML = data.users.map(user => {
      const expiryTimestamp = typeof user.expiry === 'string' ? parseInt(user.expiry) : user.expiry;
      const isActive = expiryTimestamp && expiryTimestamp > Date.now();
      const displayName = user.username ? `${user.username}` : `User ID: ${user.userId}`;
      return `
      <div class="user-card">
        <div class="user-card__header">
          <strong>${displayName}</strong>
          <span class="badge ${isActive ? 'badge--online' : 'badge--offline'}">
            ${isActive ? 'Active' : 'Expired'}
          </span>
        </div>
        ${user.username ? `<div class="subtle" style="font-size: 11px; margin-top: 4px;">ID: ${user.userId}</div>` : ''}
        <div class="user-card__info">
          <div><strong>License:</strong> <code style="font-size: 12px;">${user.license || 'None'}</code></div>
          <div><strong>Expires:</strong> ${formatDate(user.expiry)}</div>
          <div><strong>Slots:</strong> ${user.slots}</div>
          <div><strong>Bots:</strong> ${user.bots.length}</div>
        </div>
        <div class="card-actions">
          <button class="btn btn--primary btn--small" onclick="viewUserBots('${user.userId}')">View Bots</button>
          <button class="btn btn--danger btn--small" onclick="removeUserAccess('${user.userId}')">Remove Access</button>
        </div>
      </div>
    `}).join('');
  } catch (err) {
    container.innerHTML = `<p class="status-text status-text--error">${err.message}</p>`;
  }
}

async function viewUserBots(userId) {
  try {
    const data = await api(`/api/admin/users/${userId}/bots`);
    
    if (data.bots.length === 0) {
      alert(`User ${userId} has no bots.`);
      return;
    }

    const botList = data.bots.map(bot => 
      `Bot #${bot.botnumber}: ${bot.name} (${bot.online ? 'Online' : 'Offline'})`
    ).join('\n');
    
    alert(`Bots for user ${userId}:\n\n${botList}\n\nSlots: ${data.slots.used}/${data.slots.max}`);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function removeUserAccess(userId) {
  if (!confirm(`Remove access for user ${userId}?\n\nThis will delete all their bots and remove their license!`)) {
    return;
  }

  try {
    await api(`/api/admin/users/${userId}`, { method: 'DELETE' });
    alert(`Successfully removed access for user ${userId}`);
    loadUsers();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// ===== LICENSES TAB =====

async function loadLicenses() {
  const container = document.getElementById('licenses-list');
  
  try {
    container.innerHTML = '<div class="loading">Loading...</div>';
    const data = await api('/api/admin/licenses');
    
    if (data.licenses.length === 0) {
      container.innerHTML = '<p class="subtle">No unused licenses found.</p>';
      return;
    }

    container.innerHTML = `
      <div style="display: grid; gap: 8px;">
        ${data.licenses.map(lic => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px;">
            <div style="flex: 1;">
              <code style="font-size: 14px;">${lic.license}</code>
              <span class="subtle" style="margin-left: 12px;">${lic.duration} days</span>
            </div>
            <button class="btn btn--danger btn--small" onclick="deleteLicense('${lic.license}')">Delete</button>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p class="status-text status-text--error">${err.message}</p>`;
  }
}

// Create licenses
document.getElementById('create-license-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const amount = parseInt(document.getElementById('license-amount').value);
  const duration = parseFloat(document.getElementById('license-duration').value);
  
  try {
    setStatus('create-license-status', 'Generating licenses...', false);
    const data = await api('/api/admin/licenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, duration })
    });
    
    const keysList = data.licenses.join('\n');
    setStatus('create-license-status', `✅ Generated ${data.amount} license key(s) for ${data.duration} days`, false);
    
    // Show keys in an alert or copy to clipboard
    if (confirm(`Generated ${data.amount} license key(s). Click OK to copy to clipboard.`)) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(keysList);
          alert('Keys copied to clipboard!');
        } else {
          prompt('Copy these keys:', keysList);
        }
      } catch (e) {
        prompt('Copy these keys:', keysList);
      }
    }
    
    loadLicenses();
  } catch (err) {
    setStatus('create-license-status', err.message, true);
  }
});

// Extend all licenses
document.getElementById('extend-licenses-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const duration = parseFloat(document.getElementById('extend-duration').value);
  
  if (!confirm(`Extend all active licenses by ${duration} days?`)) {
    return;
  }
  
  try {
    setStatus('extend-license-status', 'Extending licenses...', false);
    const data = await api('/api/admin/licenses/extend', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration })
    });
    
    setStatus('extend-license-status', `✅ Extended ${data.updatedCount} license(s) by ${data.duration} days`, false);
  } catch (err) {
    setStatus('extend-license-status', err.message, true);
  }
});

// Check license status
document.getElementById('check-license-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = document.getElementById('check-license-key').value.trim();
  
  try {
    setStatus('check-license-status', 'Checking...', false);
    const data = await api(`/api/admin/licenses/check/${encodeURIComponent(key)}`);
    
    let message = '';
    if (data.status === 'redeemed') {
      message = `🔒 REDEEMED by user ${data.userId}\nExpiry: ${formatDate(data.expiry)}\nTrial: ${data.trial ? 'Yes' : 'No'}`;
    } else if (data.status === 'valid_unused') {
      message = `✅ VALID UNUSED LICENSE\nDuration: ${data.duration} days`;
    } else if (data.status === 'valid_slot_key') {
      message = `🧩 VALID UNUSED SLOT KEY`;
    } else {
      message = `❌ INVALID KEY - Does not exist`;
    }
    
    setStatus('check-license-status', message, false);
  } catch (err) {
    setStatus('check-license-status', err.message, true);
  }
});

// Delete single license
async function deleteLicense(key) {
  if (!confirm(`Delete license ${key}?`)) {
    return;
  }
  
  try {
    await api(`/api/admin/licenses/${encodeURIComponent(key)}`, { method: 'DELETE' });
    loadLicenses();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// Delete all licenses
document.getElementById('delete-all-licenses-btn').addEventListener('click', async () => {
  if (!confirm('Delete ALL unused licenses?\n\nThis action cannot be undone!')) {
    return;
  }
  
  try {
    await api('/api/admin/licenses', { method: 'DELETE' });
    alert('All unused licenses deleted successfully');
    loadLicenses();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
});

// ===== SLOTS TAB =====

// Create slots
document.getElementById('create-slot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const amount = parseInt(document.getElementById('slot-amount').value);
  const userId = document.getElementById('slot-user-id').value.trim();
  
  try {
    setStatus('create-slot-status', 'Creating slot(s)...', false);
    const data = await api('/api/admin/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, userId: userId || undefined })
    });
    
    if (data.redeemed) {
      setStatus('create-slot-status', `✅ Added slot to user ${data.userId}. Total slots: ${data.slots}`, false);
    } else {
      const keysList = data.keys.join('\n');
      setStatus('create-slot-status', `✅ Generated ${data.amount} slot key(s)`, false);
      
      if (confirm(`Generated ${data.amount} slot key(s). Click OK to copy to clipboard.`)) {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(keysList);
            alert('Slot keys copied to clipboard!');
          } else {
            prompt('Copy these keys:', keysList);
          }
        } catch (e) {
          prompt('Copy these keys:', keysList);
        }
      }
    }
    
    document.getElementById('slot-user-id').value = '';
  } catch (err) {
    setStatus('create-slot-status', err.message, true);
  }
});

// Remove slot
document.getElementById('remove-slot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const userId = document.getElementById('remove-slot-user-id').value.trim();
  
  if (!confirm(`Remove one slot from user ${userId}?`)) {
    return;
  }
  
  try {
    setStatus('remove-slot-status', 'Removing slot...', false);
    const data = await api(`/api/admin/slots/${userId}`, { method: 'DELETE' });
    
    setStatus('remove-slot-status', `✅ Removed slot from user ${data.userId}. New total: ${data.newSlots}`, false);
    document.getElementById('remove-slot-user-id').value = '';
  } catch (err) {
    setStatus('remove-slot-status', err.message, true);
  }
});

// ===== TRANSFER TAB =====

document.getElementById('transfer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fromUserId = document.getElementById('transfer-from').value.trim();
  const toUserId = document.getElementById('transfer-to').value.trim();
  
  if (!confirm(`Transfer license from ${fromUserId} to ${toUserId}?\n\nThis will destroy all bots from source user and generate new license for target user.`)) {
    return;
  }
  
  try {
    setStatus('transfer-status', 'Transferring license...', false);
    const data = await api('/api/admin/transfer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromUserId, toUserId })
    });
    
    const message = `✅ License transferred!\nFrom: ${data.fromUserId}\nTo: ${data.toUserId}\nOld key: ${data.oldLicenseKey}\nNew key: ${data.newLicenseKey}`;
    setStatus('transfer-status', message, false);
    
    document.getElementById('transfer-from').value = '';
    document.getElementById('transfer-to').value = '';
    
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(data.newLicenseKey);
        alert(`Transfer successful!\n\nNew license key for ${data.toUserId}:\n${data.newLicenseKey}\n\n(Copied to clipboard)`);
      } else {
        alert(`Transfer successful!\n\nNew license key for ${data.toUserId}:\n${data.newLicenseKey}`);
      }
    } catch (e) {
      alert(`Transfer successful!\n\nNew license key for ${data.toUserId}:\n${data.newLicenseKey}`);
    }
  } catch (err) {
    setStatus('transfer-status', err.message, true);
  }
});

// ===== BLACKLIST TAB =====

async function loadBlacklist() {
  const container = document.getElementById('blacklist-list');
  const countEl = document.getElementById('blacklist-count');
  
  try {
    container.innerHTML = '<div class="loading">Loading...</div>';
    const data = await api('/api/admin/blacklist');
    
    if (data.blacklist.length === 0) {
      container.innerHTML = '<p class="subtle">No blacklisted users.</p>';
      countEl.textContent = '0 blacklisted';
      return;
    }

    countEl.textContent = `${data.blacklist.length} blacklisted`;
    
    container.innerHTML = `
      <div style="display: grid; gap: 8px;">
        ${data.blacklist.map(item => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,0,0,0.1); border-radius: 8px; border: 1px solid rgba(255,0,0,0.3);">
            <div style="flex: 1;">
              <strong>User ID: ${item.user_id}</strong>
              <div class="subtle">${item.reason || 'No reason provided'}</div>
            </div>
            <button class="btn btn--ghost btn--small" onclick="unblacklistUser('${item.user_id}')">Unblacklist</button>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p class="status-text status-text--error">${err.message}</p>`;
  }
}

// Add to blacklist
document.getElementById('blacklist-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const userId = document.getElementById('blacklist-user-id').value.trim();
  const reason = document.getElementById('blacklist-reason').value.trim();
  
  if (!confirm(`Blacklist user ${userId}?\n\nReason: ${reason}\n\nThis will remove their access if they have it.`)) {
    return;
  }
  
  try {
    setStatus('blacklist-add-status', 'Blacklisting user...', false);
    const data = await api('/api/admin/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, reason })
    });
    
    setStatus('blacklist-add-status', `✅ User ${data.userId} blacklisted. Had access: ${data.hadAccess ? 'Yes' : 'No'}`, false);
    document.getElementById('blacklist-user-id').value = '';
    document.getElementById('blacklist-reason').value = '';
    
    loadBlacklist();
  } catch (err) {
    setStatus('blacklist-add-status', err.message, true);
  }
});

// Unblacklist user
async function unblacklistUser(userId) {
  if (!confirm(`Remove ${userId} from blacklist?`)) {
    return;
  }
  
  try {
    await api(`/api/admin/blacklist/${userId}`, { method: 'DELETE' });
    loadBlacklist();
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// ===== SPLIT MODE TAB =====

async function loadSplitMode() {
  const container = document.getElementById('splitmode-list');
  
  try {
    container.innerHTML = '<div class="loading">Loading...</div>';
    const data = await api('/api/admin/splitmode');
    
    if (data.users.length === 0) {
      container.innerHTML = '<p class="subtle">No users found.</p>';
      return;
    }

    container.innerHTML = `
      <div style="display: grid; gap: 8px;">
        ${data.users.map(user => {
          const displayName = user.username ? user.username : user.userId;
          return `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px;">
            <div style="flex: 1;">
              <strong>${displayName}</strong>
              ${user.username ? `<div class="subtle" style="font-size: 11px;">ID: ${user.userId}</div>` : ''}
              <div class="subtle">${user.botCount} bot(s) | ${user.enabled ? `✅ Enabled (1:${user.ratio})` : '❌ Disabled'}</div>
            </div>
          </div>
        `}).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p class="status-text status-text--error">${err.message}</p>`;
  }
}

// Configure split mode
document.getElementById('splitmode-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const userId = document.getElementById('splitmode-user-id').value.trim();
  const ratio = parseInt(document.getElementById('splitmode-ratio').value);
  const enabled = document.getElementById('splitmode-enabled').checked;
  
  try {
    setStatus('splitmode-status', 'Updating split mode...', false);
    const data = await api(`/api/admin/splitmode/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, ratio })
    });
    
    setStatus('splitmode-status', `✅ Split mode ${data.enabled ? 'enabled' : 'disabled'} for user ${data.userId} (ratio: 1:${data.ratio}, ${data.botCount} bots)`, false);
    document.getElementById('splitmode-user-id').value = '';
    
    loadSplitMode();
  } catch (err) {
    setStatus('splitmode-status', err.message, true);
  }
});

// ===== ACCOUNTS TAB =====

async function loadAccountsByUser() {
  const container = document.getElementById('accounts-list');
  const countEl = document.getElementById('account-count');
  const filterSelect = document.getElementById('user-filter');
  const selectedUserId = filterSelect.value;
  
  try {
    container.innerHTML = '<div class="loading">Loading...</div>';
    
    const url = selectedUserId 
      ? `/api/admin/accounts/by-user?userId=${selectedUserId}`
      : '/api/admin/accounts/by-user';
      
    const data = await api(url);
    
    // Populate user filter dropdown if not already done
    if (filterSelect.options.length === 1) {
      data.users.forEach(userGroup => {
        const option = document.createElement('option');
        option.value = userGroup.userId;
        option.textContent = `User ${userGroup.userId} (${userGroup.accountCount || userGroup.accounts.length} accounts)`;
        filterSelect.appendChild(option);
      });
    }
    
    if (data.users.length === 0) {
      container.innerHTML = '<p class="subtle">No accounts found.</p>';
      countEl.innerHTML = '<strong style="color: #ff6b6b;">0 accounts</strong>';
      return;
    }

    const totalAccounts = data.users.reduce((sum, u) => sum + u.accounts.length, 0);
    countEl.innerHTML = `<strong style="color: #1dd3b0;">${totalAccounts}</strong> accounts<br><small style="opacity: 0.7;">${data.users.length} users</small>`;
    
    container.innerHTML = data.users.map(userGroup => `
      <div class="panel" style="margin-bottom: 24px;">
        <div class="panel__header" style="background: linear-gradient(135deg, rgba(29,221,176,0.2) 0%, rgba(29,221,176,0.05) 100%); border-bottom: 2px solid rgba(29,221,176,0.3);">
          <h3 class="panel__title">👤 User ID: ${userGroup.userId}</h3>
          <span class="badge badge--online" style="font-size: 14px;">${userGroup.accounts.length} Accounts</span>
        </div>
        <div style="padding: 16px;">
          <div class="accounts-grid">
            ${userGroup.accounts.map(acc => `
              <div class="account-card" style="border: 1px solid rgba(255,255,255,0.1);">
                <div class="account-header">
                  <strong style="font-size: 15px;">${acc.username || 'Unknown'}</strong>
                  <span class="badge ${acc.ownsmc === 'Purchased' ? 'badge--online' : 'badge--offline'}">
                    ${acc.ownsmc || 'No MC'}
                  </span>
                </div>
                <div class="account-details">
                  <div style="grid-column: 1 / -1; padding: 8px; background: rgba(29,221,176,0.05); border-radius: 4px; margin-bottom: 8px;">
                    <strong>📧 Email:</strong> <code style="font-size: 11px;">${acc.email || '—'}</code>
                  </div>
                  <div><strong>🎭 Capes:</strong> ${acc.capes || 'None'}</div>
                  <div><strong>🔑 Recovery:</strong> <code style="font-size: 10px;">${acc.recoverycode ? acc.recoverycode.substring(0, 20) + '...' : '—'}</code></div>
                  <div><strong>🛡️ Sec Email:</strong> <code style="font-size: 11px;">${acc.secemail || '—'}</code></div>
                  <div><strong>🔐 Password:</strong> <code style="font-size: 11px;">${acc.password || '—'}</code></div>
                  <div style="grid-column: 1 / -1;"><strong>⏰ Secured:</strong> ${formatDate(acc.time * 1000)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = `<p class="status-text status-text--error">${err.message}</p>`;
  }
}

// Filter accounts by user
document.getElementById('user-filter').addEventListener('change', () => {
  loadAccountsByUser();
});

// Load initial tab
loadUsers();
