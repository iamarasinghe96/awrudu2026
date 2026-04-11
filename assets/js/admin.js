'use strict';

/* =============================================================
   Awrudu 2026 – Admin Panel
   Uploads receipts to the GitHub repository via Contents API.
   The PAT is stored only in sessionStorage — cleared on tab close.
   ============================================================= */

const CONFIG = {
  owner:  'iamarasinghe96',
  repo:   'awrudu2026',
  branch: 'claude/budget-statement-webtool-q8Ma9',
  PAT_KEY: 'awrudu2026_gh_pat',
};

const API_BASE = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}`;

/* ---- Auth -------------------------------------------------- */

const Auth = {
  store(token)  { sessionStorage.setItem(CONFIG.PAT_KEY, token); },
  get()         { return sessionStorage.getItem(CONFIG.PAT_KEY) || ''; },
  clear()       { sessionStorage.removeItem(CONFIG.PAT_KEY); },
  isAuthed()    { return !!this.get(); },
};

function apiHeaders(token) {
  return {
    'Authorization': `token ${token}`,
    'Content-Type':  'application/json',
    'Accept':        'application/vnd.github.v3+json',
  };
}

async function verifyToken(token) {
  const r = await fetch('https://api.github.com/user', {
    headers: apiHeaders(token),
  });
  if (!r.ok) throw new Error('Invalid token or insufficient permissions');
  return r.json();
}

/* ---- GitHub API -------------------------------------------- */

async function getFileSha(path, token) {
  const url = `${API_BASE}/contents/${path}?ref=${encodeURIComponent(CONFIG.branch)}`;
  const r = await fetch(url, { headers: apiHeaders(token) });
  if (r.status === 404) return null;
  if (!r.ok) return null;
  const d = await r.json();
  return d.sha || null;
}

async function uploadFile(path, base64Content, message, token) {
  const sha = await getFileSha(path, token);
  const url  = `${API_BASE}/contents/${path}`;
  const body = { message, content: base64Content, branch: CONFIG.branch };
  if (sha) body.sha = sha; // required for overwrite

  const r = await fetch(url, {
    method: 'PUT',
    headers: apiHeaders(token),
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.message || `Upload failed (HTTP ${r.status})`);
  }
  return r.json();
}

async function listReceipts(token) {
  const url = `${API_BASE}/contents/receipts?ref=${encodeURIComponent(CONFIG.branch)}`;
  const r = await fetch(url, { headers: apiHeaders(token) });
  if (!r.ok) return [];
  const items = await r.json();
  return Array.isArray(items) ? items.filter(f => f.name !== '.gitkeep') : [];
}

/* ---- File utilities ---------------------------------------- */

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const MIME_TO_EXT = {
  'application/pdf': 'pdf',
  'image/jpeg':      'jpg',
  'image/jpg':       'jpg',
  'image/png':       'png',
  'image/webp':      'webp',
};

function getExtension(file) {
  return MIME_TO_EXT[file.type] || file.name.split('.').pop().toLowerCase();
}

function fmtBytes(bytes) {
  if (bytes < 1024)        return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fmtCurrency(n) {
  return '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* ---- UI helpers -------------------------------------------- */

function showStatus(id, msg, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className   = `status-msg ${type}`;
}

function clearStatus(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = '';
  el.className   = 'status-msg';
}

/* ---- Transaction dropdown ---------------------------------- */

async function loadTransactionDropdown() {
  const select = document.getElementById('transaction-select');
  if (!select) return;
  try {
    const resp = await fetch('./data/transactions.json');
    const data = await resp.json();
    select.innerHTML = '<option value="">— Select a transaction —</option>';
    data.credit.forEach(tx => {
      const opt = document.createElement('option');
      opt.value          = tx.receiptFile;
      opt.dataset.desc   = tx.description;
      opt.textContent    = `${tx.date} | ${tx.id} | ${tx.description} (${fmtCurrency(tx.amount)})`;
      select.appendChild(opt);
    });
  } catch (err) {
    select.innerHTML = '<option value="">— Failed to load transactions —</option>';
    console.error('[Admin] Failed to load transactions:', err);
  }
}

function getReceiptFileStem(receiptId) {
  const num = parseInt(document.getElementById('receipt-number')?.value, 10) || 1;
  return `${receiptId}-${num}`;
}

function updateTargetFilename() {
  const select    = document.getElementById('transaction-select');
  const fileInput = document.getElementById('receipt-file');
  const display   = document.getElementById('target-filename');
  if (!display) return;
  const receiptId = select?.value;
  const file      = fileInput?.files?.[0];
  const ext       = file ? getExtension(file) : '<ext>';
  display.textContent = receiptId ? `receipts/${getReceiptFileStem(receiptId)}.${ext}` : '—';
}

function checkUploadReady() {
  const select    = document.getElementById('transaction-select');
  const fileInput = document.getElementById('receipt-file');
  const btn       = document.getElementById('upload-btn');
  if (!btn) return;
  btn.disabled = !(select?.value && fileInput?.files?.length > 0);
}

/* ---- File preview ------------------------------------------ */

function renderFilePreview(file) {
  const container = document.getElementById('file-preview');
  if (!container) return;
  const ext = getExtension(file);
  let html = `<p style="font-size:0.8rem;color:#7A5C3A;margin-bottom:8px;">
    <strong>${file.name}</strong> &nbsp;(${fmtBytes(file.size)})
  </p>`;
  if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    const url = URL.createObjectURL(file);
    html += `<img src="${url}" alt="Preview" style="max-width:200px;max-height:150px;border-radius:6px;border:1px solid #E0D0B8;">`;
  } else if (ext === 'pdf') {
    html += `<div style="font-size:2.5rem;line-height:1;">📄</div>
             <p style="font-size:0.8rem;color:#7A5C3A;margin-top:4px;">PDF document</p>`;
  }
  container.innerHTML = html;
  container.classList.remove('hidden');
}

/* ---- Existing receipts list -------------------------------- */

async function loadExistingReceipts(token) {
  const container = document.getElementById('existing-receipts-list');
  if (!container) return;
  container.innerHTML = '<p class="hint">Loading…</p>';
  try {
    const items = await listReceipts(token);
    if (items.length === 0) {
      container.innerHTML = '<p class="hint">No receipts uploaded yet.</p>';
      return;
    }
    container.innerHTML = `<div class="receipts-list">
      ${items.map(item => `
        <div class="receipt-item">
          <span class="receipt-name">${item.name}</span>
          <a href="${item.download_url}" target="_blank" rel="noopener noreferrer">View</a>
        </div>`).join('')}
    </div>`;
  } catch (err) {
    container.innerHTML = `<p style="color:#B71C1C;font-size:0.85rem;">Failed to load: ${err.message}</p>`;
  }
}

/* ---- Auth flow --------------------------------------------- */

async function handleAuth() {
  const input = document.getElementById('pat-input');
  const token = input?.value?.trim();
  if (!token) {
    showStatus('auth-status', 'Please enter your GitHub Personal Access Token.', 'error');
    return;
  }
  const btn = document.getElementById('auth-btn');
  btn.disabled    = true;
  btn.textContent = 'Authenticating…';
  clearStatus('auth-status');
  try {
    const user = await verifyToken(token);
    Auth.store(token);
    showStatus('auth-status', `✓ Authenticated as @${user.login}`, 'success');
    showUploadSection(token);
  } catch (err) {
    showStatus('auth-status', `Authentication failed: ${err.message}`, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Authenticate';
  }
}

function showUploadSection(token) {
  document.getElementById('auth-section')?.classList.add('hidden');
  document.getElementById('upload-section')?.classList.remove('hidden');
  loadTransactionDropdown();
  loadExistingReceipts(token);
}

function handleSignOut() {
  Auth.clear();
  document.getElementById('upload-section')?.classList.add('hidden');
  document.getElementById('auth-section')?.classList.remove('hidden');
  const input = document.getElementById('pat-input');
  if (input) input.value = '';
  clearStatus('auth-status');
  clearStatus('upload-status');
}

/* ---- Upload flow ------------------------------------------- */

async function handleUpload() {
  const select    = document.getElementById('transaction-select');
  const fileInput = document.getElementById('receipt-file');
  const btn       = document.getElementById('upload-btn');
  const receiptId = select?.value;
  const file      = fileInput?.files?.[0];
  const token     = Auth.get();
  if (!receiptId || !file || !token) return;

  const MAX_WARN  = 10 * 1024 * 1024;  // 10 MB
  const MAX_BLOCK = 25 * 1024 * 1024;  // 25 MB
  if (file.size > MAX_BLOCK) {
    showStatus('upload-status', 'File exceeds 25 MB. Please use a smaller file.', 'error');
    return;
  }
  if (file.size > MAX_WARN) {
    showStatus('upload-status', 'File is larger than 10 MB — uploading…', 'info');
  }

  const ext  = getExtension(file);
  const stem = getReceiptFileStem(receiptId);
  const path = `receipts/${stem}.${ext}`;
  const msg  = `Add receipt ${stem}.${ext} via admin panel`;

  btn.disabled    = true;
  btn.textContent = 'Uploading…';
  clearStatus('upload-status');

  try {
    const base64 = await fileToBase64(file);
    await uploadFile(path, base64, msg, token);
    showStatus('upload-status', `✓ Uploaded successfully as ${path}`, 'success');
    // Reset form
    select.value        = '';
    fileInput.value     = '';
    document.getElementById('file-preview')?.classList.add('hidden');
    document.getElementById('target-filename').textContent = '—';
    checkUploadReady();
    // Refresh list
    await loadExistingReceipts(token);
  } catch (err) {
    showStatus('upload-status', `Upload failed: ${err.message}`, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Upload Receipt';
  }
}

/* ---- Init -------------------------------------------------- */

function init() {
  // Auth
  document.getElementById('auth-btn')?.addEventListener('click', handleAuth);
  document.getElementById('pat-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAuth();
  });

  // Sign out
  document.getElementById('signout-btn')?.addEventListener('click', handleSignOut);

  // Upload
  document.getElementById('upload-btn')?.addEventListener('click', handleUpload);

  // Transaction dropdown
  document.getElementById('transaction-select')?.addEventListener('change', () => {
    updateTargetFilename();
    checkUploadReady();
  });

  // Receipt number
  document.getElementById('receipt-number')?.addEventListener('input', updateTargetFilename);

  // File input
  document.getElementById('receipt-file')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) {
      renderFilePreview(file);
      updateTargetFilename();
    } else {
      document.getElementById('file-preview')?.classList.add('hidden');
    }
    checkUploadReady();
  });

  // Drag & drop on the drop zone
  const dropZone = document.getElementById('file-drop-zone');
  if (dropZone) {
    dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      // Assign to the hidden input via DataTransfer
      try {
        const dt = new DataTransfer();
        dt.items.add(file);
        document.getElementById('receipt-file').files = dt.files;
      } catch (_) { /* Safari fallback: preview-only */ }
      renderFilePreview(file);
      updateTargetFilename();
      checkUploadReady();
    });
  }

  // Restore session if already authenticated
  if (Auth.isAuthed()) showUploadSection(Auth.get());
}

document.addEventListener('DOMContentLoaded', init);
