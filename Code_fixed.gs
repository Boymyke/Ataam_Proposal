/**
 * Ataam Proposal Approval → Google Sheets
 *
 * SETUP
 * 1) Paste your Google Sheet ID into SPREADSHEET_ID below.
 * 2) Save this file in Apps Script.
 * 3) Run testSheetConnection() once and authorize it.
 * 4) Deploy as Web app:
 *      Execute as: Me
 *      Who has access: Anyone
 * 5) Copy the /exec URL into GOOGLE_SCRIPT_URL in form_fixed.html.
 *
 * AFTER EVERY CHANGE TO THIS FILE:
 * Deploy → Manage deployments → Edit → New version → Deploy.
 */

const SPREADSHEET_ID = 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE';
const SHEET_NAME = 'Proposal Approvals';
const EXPECTED_PROPOSAL_ID = 'ATAM-OPS-0826';

const HEADERS = [
  'Server Timestamp',
  'Submission ID',
  'Proposal ID',
  'Full Name',
  'Work Email',
  'Company',
  'Job Title',
  'Phone',
  'Typed Signature',
  'Accepted Terms',
  'Total Investment',
  'Commitment Fee',
  'Final Installment',
  'MVP Window',
  'Project Engagement',
  'MVP Target',
  'Client Timestamp',
  'Client Timezone',
  'Source Page',
  'User Agent'
];

function setupSheet() {
  const sheet = getOrCreateSheet_();
  ensureHeaders_(sheet);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, HEADERS.length);
}

/**
 * Run manually once from the Apps Script editor.
 * It proves the script can open, write to and clean up the target Sheet.
 */
function testSheetConnection() {
  const sheet = getOrCreateSheet_();
  ensureHeaders_(sheet);

  const testId = 'TEST-' + new Date().getTime();
  const row = new Array(HEADERS.length).fill('');
  row[0] = new Date();
  row[1] = testId;
  row[2] = EXPECTED_PROPOSAL_ID;
  row[3] = 'Connection test';

  sheet.appendRow(row);
  SpreadsheetApp.flush();

  const lastRow = sheet.getLastRow();
  const writtenId = String(sheet.getRange(lastRow, 2).getValue());

  if (writtenId !== testId) {
    throw new Error('The Sheet opened, but the test row could not be verified.');
  }

  sheet.deleteRow(lastRow);
  SpreadsheetApp.flush();

  console.log('SUCCESS: Google Sheet connection and write access are working.');
  return true;
}

function doGet(e) {
  const action = clean_(e && e.parameter ? e.parameter.action : '');
  const callback = cleanCallback_(e && e.parameter ? e.parameter.callback : '');

  try {
    if (action === 'health') {
      const sheet = getOrCreateSheet_();
      ensureHeaders_(sheet);

      return respond_(callback, {
        ok: true,
        sheetReady: true,
        proposalId: EXPECTED_PROPOSAL_ID
      });
    }

    if (action === 'verify') {
      const submissionId = clean_(e && e.parameter ? e.parameter.submissionId : '');

      if (!submissionId) {
        return respond_(callback, {
          ok: false,
          found: false,
          error: 'Missing submission ID.'
        });
      }

      const sheet = getOrCreateSheet_();
      ensureHeaders_(sheet);

      return respond_(callback, {
        ok: true,
        found: submissionExists_(sheet, submissionId),
        submissionId: submissionId
      });
    }

    return respond_(callback, {
      ok: true,
      service: 'Ataam proposal approval endpoint',
      proposalId: EXPECTED_PROPOSAL_ID
    });

  } catch (error) {
    console.error('doGet error:', error);

    return respond_(callback, {
      ok: false,
      sheetReady: false,
      error: String(error && error.message ? error.message : error)
    });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let submissionId = '';

  try {
    lock.waitLock(10000);

    if (!e || !e.parameter) {
      return json_({ ok: false, error: 'No form data received.' });
    }

    const p = e.parameter;
    submissionId = clean_(p.submissionId);

    console.log('Incoming proposal approval:', submissionId || '(no submission id)');

    if (clean_(p.proposalId) !== EXPECTED_PROPOSAL_ID) {
      return json_({ ok: false, error: 'Unexpected proposal ID.' });
    }

    if (!submissionId || !clean_(p.fullName) || !clean_(p.email) || !clean_(p.signature)) {
      return json_({ ok: false, error: 'Required fields are missing.' });
    }

    if (String(p.acceptedTerms || '').toUpperCase() !== 'YES') {
      return json_({ ok: false, error: 'Terms were not accepted.' });
    }

    const sheet = getOrCreateSheet_();
    ensureHeaders_(sheet);

    if (submissionExists_(sheet, submissionId)) {
      return json_({
        ok: true,
        duplicate: true,
        submissionId: submissionId
      });
    }

    sheet.appendRow([
      new Date(),
      submissionId,
      clean_(p.proposalId),
      clean_(p.fullName),
      clean_(p.email),
      clean_(p.company),
      clean_(p.jobTitle),
      clean_(p.phone),
      clean_(p.signature),
      clean_(p.acceptedTerms),
      clean_(p.totalInvestment),
      clean_(p.commitmentFee),
      clean_(p.finalInstallment),
      clean_(p.mvpWindow),
      clean_(p.projectEngagement),
      clean_(p.mvpTarget),
      clean_(p.clientTimestamp),
      clean_(p.timezone),
      clean_(p.sourcePage),
      clean_(p.userAgent)
    ]);

    SpreadsheetApp.flush();

    if (!submissionExists_(sheet, submissionId)) {
      throw new Error('The row was submitted but could not be verified in the target Sheet.');
    }

    console.log('Approval recorded:', submissionId);

    return json_({
      ok: true,
      submissionId: submissionId,
      recordedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('doPost error:', error);

    return json_({
      ok: false,
      submissionId: submissionId,
      error: String(error && error.message ? error.message : error)
    });

  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function getOrCreateSheet_() {
  if (!SPREADSHEET_ID || SPREADSHEET_ID.indexOf('PASTE_YOUR_') === 0) {
    throw new Error('Add the Google Sheet ID to SPREADSHEET_ID in Code.gs.');
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function ensureHeaders_(sheet) {
  const current = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const headerIsMissing = HEADERS.some((header, i) => current[i] !== header);

  if (headerIsMissing) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#0A0A0A')
      .setFontColor('#FFFFFF');
  }
}

function submissionExists_(sheet, submissionId) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const finder = sheet
    .getRange(2, 2, lastRow - 1, 1)
    .createTextFinder(submissionId)
    .matchEntireCell(true)
    .findNext();

  return Boolean(finder);
}

function clean_(value) {
  if (value === undefined || value === null) return '';

  let text = String(value).trim().slice(0, 5000);

  if (/^[=+\-@]/.test(text)) text = "'" + text;

  return text;
}

function cleanCallback_(value) {
  const callback = String(value || '').trim();

  if (/^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return callback;
  }

  return '';
}

function respond_(callback, data) {
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + JSON.stringify(data) + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return json_(data);
}

function json_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
