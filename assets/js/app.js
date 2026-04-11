'use strict';

/* =============================================================
   Awrudu 2026 Budget Statement – Main App
   ============================================================= */

const REPO_OWNER  = 'iamarasinghe96';
const REPO_NAME   = 'awrudu2026';
const REPO_BRANCH = 'claude/budget-statement-webtool-q8Ma9';
const RECEIPT_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'webp'];

// Raw GitHub URL base for receipt files
const RAW_BASE = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}/receipts/`;

/* ---- Utilities --------------------------------------------- */

function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtAmt(n) {
  return '$' + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* ---- Data loading ------------------------------------------ */

async function loadData() {
  const resp = await fetch('./data/transactions.json');
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return resp.json();
}

/* ---- Table renderers --------------------------------------- */

function renderDebitTable(rows) {
  const tbody = document.getElementById('debit-tbody');
  if (!tbody) return;
  tbody.innerHTML = rows.map(tx => `
    <tr>
      <td>${escHtml(tx.date)}</td>
      <td>${escHtml(tx.name)}</td>
      <td class="notes">${escHtml(tx.notes || '')}</td>
      <td class="amount-col">${fmtAmt(tx.amount)}</td>
    </tr>`).join('');
}

function renderCreditTable(rows) {
  const tbody = document.getElementById('credit-tbody');
  if (!tbody) return;
  tbody.innerHTML = rows.map(tx => {
    const receiptCell = tx.receiptFile
      ? `<button class="btn-receipt"
           data-receipt-id="${escHtml(tx.receiptFile)}"
           data-receipt-desc="${escHtml(tx.description)}"
           aria-label="View receipt for ${escHtml(tx.description)}">
           View Receipt
         </button>`
      : `<span class="badge-pending">Pending</span>`;
    return `
      <tr>
        <td>${escHtml(tx.date)}</td>
        <td>${escHtml(tx.description)}</td>
        <td class="amount-col">${fmtAmt(tx.amount)}</td>
        <td class="receipt-col">${receiptCell}</td>
      </tr>`;
  }).join('');

  // Event delegation — one listener for all receipt buttons
  tbody.addEventListener('click', e => {
    const btn = e.target.closest('.btn-receipt');
    if (btn) openReceiptModal(btn.dataset.receiptId, btn.dataset.receiptDesc);
  });
}

function updateSummary(summary) {
  const pairs = [
    ['totalDebit',   summary.totalDebit],
    ['totalCredit',  summary.totalCredit],
    ['surplus',      summary.surplus],
    ['debit-total',  summary.totalDebit],
    ['credit-total', summary.totalCredit],
    ['surplus-row',  summary.surplus],
  ];
  pairs.forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = fmtAmt(val);
  });
}

/* ---- Receipt resolution ------------------------------------ */

/**
 * Resolve a single receipt variant (base or numbered).
 * Tries each extension via HEAD and returns {url, ext} on first hit.
 */
async function resolveVariant(stem) {
  for (const ext of RECEIPT_EXTENSIONS) {
    const url = `${RAW_BASE}${encodeURIComponent(stem)}.${ext}`;
    try {
      const r = await fetch(url, { method: 'HEAD' });
      if (r.ok) return { url, ext };
    } catch (_) { /* network error – try next */ }
  }
  return null;
}

/**
 * Collect all receipt files for a receiptId:
 *   - base form:    C004.jpg  (legacy single-file uploads)
 *   - numbered:     C004-1.jpg, C004-2.jpg … C004-10.jpg
 * Returns an array of {url, ext, label} objects (may be empty).
 */
async function resolveAllReceiptUrls(receiptId) {
  const found = [];

  // 1. Base form (no suffix) — backwards-compatible with earlier uploads
  const base = await resolveVariant(receiptId);
  if (base) found.push({ ...base, label: null });

  // 2. Numbered variants — stop after 2 consecutive misses
  let misses = 0;
  for (let n = 1; n <= 10 && misses < 2; n++) {
    const hit = await resolveVariant(`${receiptId}-${n}`);
    if (hit) {
      found.push({ ...hit, label: n });
      misses = 0;
    } else {
      misses++;
    }
  }

  return found;
}

/* ---- Receipt rendering ------------------------------------- */

function renderReceiptItem(body, result, description) {
  if (result.ext === 'pdf') {
    const isMobile = /Mobi|Android/i.test(navigator.userAgent);
    const src = isMobile
      ? `https://docs.google.com/viewer?url=${encodeURIComponent(result.url)}&embedded=true`
      : result.url;
    body.innerHTML = `<iframe
      src="${escHtml(src)}"
      class="receipt-frame"
      title="Receipt for ${escHtml(description)}"
      loading="lazy">
    </iframe>`;
  } else {
    body.innerHTML = `<img
      src="${escHtml(result.url)}"
      alt="Receipt for ${escHtml(description)}"
      class="receipt-image"
      loading="lazy" />`;
  }
}

function renderReceiptGallery(body, results, description, dlBtn) {
  let current = 0;

  function show(idx) {
    current = idx;
    const r = results[idx];
    const counter = body.querySelector('.gallery-counter');
    const prev    = body.querySelector('.gallery-prev');
    const next    = body.querySelector('.gallery-next');
    const slot    = body.querySelector('.gallery-slot');
    if (counter) counter.textContent = `${idx + 1} / ${results.length}`;
    if (prev)    prev.disabled  = idx === 0;
    if (next)    next.disabled  = idx === results.length - 1;

    // Update download button for current item
    dlBtn.href = r.url;
    const label = r.label != null ? `-${r.label}` : '';
    dlBtn.setAttribute('download', `receipt-${escHtml(description)}${label}.${r.ext}`);
    dlBtn.classList.remove('hidden');

    if (r.ext === 'pdf') {
      const isMobile = /Mobi|Android/i.test(navigator.userAgent);
      const src = isMobile
        ? `https://docs.google.com/viewer?url=${encodeURIComponent(r.url)}&embedded=true`
        : r.url;
      slot.innerHTML = `<iframe src="${escHtml(src)}" class="receipt-frame"
        title="Receipt ${idx + 1} for ${escHtml(description)}" loading="lazy"></iframe>`;
    } else {
      slot.innerHTML = `<img src="${escHtml(r.url)}" alt="Receipt ${idx + 1} for ${escHtml(description)}"
        class="receipt-image" loading="lazy" />`;
    }
  }

  body.innerHTML = `
    <div class="receipt-gallery">
      <div class="gallery-nav">
        <button class="gallery-prev btn-gallery-nav" aria-label="Previous receipt">&larr;</button>
        <span class="gallery-counter">1 / ${results.length}</span>
        <button class="gallery-next btn-gallery-nav" aria-label="Next receipt">&rarr;</button>
      </div>
      <div class="gallery-slot"></div>
    </div>`;

  body.querySelector('.gallery-prev').addEventListener('click', () => { if (current > 0) show(current - 1); });
  body.querySelector('.gallery-next').addEventListener('click', () => { if (current < results.length - 1) show(current + 1); });

  show(0);
}

/* ---- Receipt modal ----------------------------------------- */

async function openReceiptModal(receiptId, description) {
  const modal   = document.getElementById('receipt-modal');
  const body    = document.getElementById('modal-body');
  const title   = document.getElementById('modal-title');
  const dlBtn   = document.getElementById('modal-download');

  // Show loading state
  title.textContent = description;
  body.innerHTML    = '<div class="loading-spinner" role="status" aria-label="Loading receipt"></div>';
  dlBtn.classList.add('hidden');
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  const results = await resolveAllReceiptUrls(receiptId);

  if (results.length === 0) {
    body.innerHTML = `
      <div class="receipt-not-found">
        <p>Receipt has not been uploaded yet.</p>
        <span class="hint">ID: ${escHtml(receiptId)}</span>
      </div>`;
    return;
  }

  if (results.length === 1) {
    // Single file — simple display
    dlBtn.href = results[0].url;
    dlBtn.setAttribute('download', `receipt-${receiptId}.${results[0].ext}`);
    dlBtn.classList.remove('hidden');
    renderReceiptItem(body, results[0], description);
  } else {
    // Multiple files — gallery
    renderReceiptGallery(body, results, description, dlBtn);
  }
}

function closeModal() {
  const modal = document.getElementById('receipt-modal');
  const body  = document.getElementById('modal-body');
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  // Delay clear to allow close animation; stops ongoing iframe/img load
  setTimeout(() => { body.innerHTML = ''; }, 250);
}

/* ---- Event wiring ------------------------------------------ */

function wireModal() {
  document.getElementById('modal-close')?.addEventListener('click',     closeModal);
  document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
  document.getElementById('modal-backdrop')?.addEventListener('click',  closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });
}

/* ---- Init -------------------------------------------------- */

async function init() {
  wireModal();
  try {
    const data = await loadData();
    renderDebitTable(data.debit);
    renderCreditTable(data.credit);
    updateSummary(data.summary);
  } catch (err) {
    console.error('[Awrudu] Failed to load transactions:', err);
    const msg = `<tr><td colspan="4" class="loading-cell">
      Failed to load data. Please refresh the page.
    </td></tr>`;
    ['debit-tbody', 'credit-tbody'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = msg;
    });
  }
}

document.addEventListener('DOMContentLoaded', init);

/* =============================================================
   SUGGESTION FORM
   Posts anonymously to a Google Apps Script web app which
   saves the entry to a Google Sheet.
   Replace APPS_SCRIPT_URL with your deployed script URL.
   ============================================================= */

// ⚠️  Replace this with your Google Apps Script deployment URL
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwVJM9Vy-FS8cx33fEQZoay0LaV1uA9j0bcX9jM9FbAsGkHBXwW27XL3TT9SvBNBQ1D/exec';

(function initSuggestionForm() {
  const form    = document.getElementById('suggestion-form');
  const textarea = document.getElementById('suggestion-text');
  const counter  = document.getElementById('char-count');
  const status   = document.getElementById('suggestion-status');
  const submitBtn = document.getElementById('suggestion-submit');
  const MAX = 2000;

  if (!form) return;

  // Live character counter
  textarea?.addEventListener('input', () => {
    const len = textarea.value.length;
    counter.textContent = `${len} / ${MAX}`;
    counter.className = 'char-count' +
      (len >= MAX ? ' at-limit' : len >= MAX * 0.85 ? ' near-limit' : '');
  });

  // Form submission
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const text = textarea?.value?.trim();

    if (!text) {
      setStatus('Please write your suggestion before submitting.', 'error');
      textarea?.focus();
      return;
    }

    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL === 'YOUR_APPS_SCRIPT_URL_HERE') {
      setStatus('Suggestion box is not yet configured. Please check back soon!', 'error');
      return;
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Submitting…';
    clearStatus();

    try {
      // Send as text/plain to avoid CORS preflight.
      // Google Apps Script parses JSON from e.postData.contents.
      const resp = await fetch(APPS_SCRIPT_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body:    JSON.stringify({ suggestion: text }),
      });

      if (!resp.ok) throw new Error(`Server error (${resp.status})`);
      const data = await resp.json();

      if (data.status === 'success') {
        setStatus('✓ Thank you! Your suggestion has been submitted anonymously.', 'success');
        form.reset();
        counter.textContent = `0 / ${MAX}`;
        counter.className   = 'char-count';
      } else {
        throw new Error(data.message || 'Unexpected response from server.');
      }
    } catch (err) {
      setStatus(`Submission failed: ${err.message}. Please try again.`, 'error');
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Submit Suggestion';
    }
  });

  function setStatus(msg, type) {
    if (!status) return;
    status.textContent = msg;
    status.className   = `status-msg ${type}`;
  }

  function clearStatus() {
    if (!status) return;
    status.textContent = '';
    status.className   = 'status-msg';
  }
})();
