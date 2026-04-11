/**
 * ============================================================
 *  Albury Wodonga Awrudu 2026 – Suggestion Box
 *  Google Apps Script backend
 * ============================================================
 *
 *  SETUP INSTRUCTIONS
 *  ------------------
 *  1. Open Google Sheets → create a new spreadsheet and name it
 *     "Awrudu 2026 Suggestions" (or any name you like).
 *
 *  2. Click  Extensions → Apps Script  to open the script editor.
 *
 *  3. Delete any existing code and paste this entire file.
 *
 *  4. Run  setupSheet()  once (click ▶ Run → select setupSheet).
 *     This creates a "Suggestions" sheet with headers.
 *
 *  5. Deploy as a Web App:
 *       Deploy → New deployment
 *       Type:              Web app
 *       Execute as:        Me  (your Google account)
 *       Who has access:    Anyone
 *     Click  Deploy  and copy the Web App URL.
 *
 *  6. Open  assets/js/app.js  in the repository and replace:
 *       const APPS_SCRIPT_URL = 'YOUR_APPS_SCRIPT_URL_HERE';
 *     with your URL:
 *       const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/…/exec';
 *
 *  7. Commit and push the updated app.js.
 *
 *  NOTES
 *  -----
 *  - Suggestions are completely anonymous — no IP address, name,
 *    or browser info is stored.
 *  - Each submission is timestamped in AEST/AEDT automatically.
 *  - You can read responses any time by opening the Google Sheet.
 *  - If you re-deploy (new version), remember to update the URL in app.js.
 * ============================================================
 */

/* ---- Main entry points ------------------------------------- */

/**
 * Handles POST requests from the website suggestion form.
 * The frontend sends JSON as text/plain to avoid CORS preflight.
 */
function doPost(e) {
  try {
    // Parse the JSON body sent by the browser
    const data       = JSON.parse(e.postData.contents);
    const suggestion = (data.suggestion || '').trim();

    if (!suggestion) {
      return jsonResponse({ status: 'error', message: 'No suggestion provided.' });
    }

    // Limit to 2000 chars (mirrors the front-end maxlength)
    const truncated = suggestion.slice(0, 2000);

    const sheet     = getOrCreateSheet();
    const timestamp = Utilities.formatDate(
      new Date(),
      'Australia/Sydney',
      'dd/MM/yyyy HH:mm:ss'
    );

    sheet.appendRow([timestamp, truncated]);

    return jsonResponse({ status: 'success', message: 'Thank you for your suggestion!' });

  } catch (err) {
    console.error('doPost error:', err);
    return jsonResponse({ status: 'error', message: err.toString() });
  }
}

/**
 * Handles GET requests — simple health-check endpoint.
 * Useful for verifying the script is deployed correctly.
 */
function doGet(e) {
  return jsonResponse({
    status:  'ok',
    message: 'Awrudu 2026 Suggestion Box is live!',
    time:    new Date().toISOString()
  });
}

/* ---- Sheet helpers ----------------------------------------- */

/**
 * Returns the "Suggestions" sheet, creating it with headers
 * if it does not already exist.
 */
function getOrCreateSheet() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  let sheet  = ss.getSheetByName('Suggestions');

  if (!sheet) {
    sheet = ss.insertSheet('Suggestions');
    addHeaders(sheet);
  }

  return sheet;
}

function addHeaders(sheet) {
  const headers = ['Timestamp (AEST)', 'Suggestion'];
  sheet.appendRow(headers);

  // Style the header row
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#8B1A1A');
  headerRange.setFontColor('#F0CE5E');

  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 700);
  sheet.setFrozenRows(1);
}

/* ---- Utilities --------------------------------------------- */

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---- One-time setup ---------------------------------------- */

/**
 * Run this manually once after pasting the script.
 * Creates the Suggestions sheet with headers if needed.
 */
function setupSheet() {
  const sheet = getOrCreateSheet();
  const ui    = SpreadsheetApp.getUi();
  ui.alert(
    'Setup Complete',
    'The "Suggestions" sheet is ready.\n\n' +
    'Next step: Deploy → New deployment → Web app\n' +
    '  Execute as: Me\n' +
    '  Who has access: Anyone\n\n' +
    'Then copy the Web App URL into assets/js/app.js.',
    ui.ButtonSet.OK
  );
}

/**
 * Adds a custom menu to the spreadsheet for easy access.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Awrudu 2026')
    .addItem('Setup Sheet',        'setupSheet')
    .addItem('View Suggestions',   'openSuggestionsSheet')
    .addToUi();
}

function openSuggestionsSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Suggestions');
  if (sheet) {
    ss.setActiveSheet(sheet);
  } else {
    SpreadsheetApp.getUi().alert('No "Suggestions" sheet found. Run Setup Sheet first.');
  }
}
