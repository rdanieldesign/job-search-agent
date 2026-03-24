// src/sheets.js
// Reads and writes your job search pipeline from Google Sheets.
//
// Expected sheet columns (Row 1 = headers):
// A: Company | B: Role | C: Status | D: Applied Date | E: Last Contact
// F: Next Action | G: Notes | H: Match Score | I: Ethics Flag

import { sheets } from './google.js';
import 'dotenv/config';

const SHEET_ID = process.env.PIPELINE_SHEET_ID;
const TAB = process.env.PIPELINE_SHEET_TAB || 'Pipeline';
const SEEN_TAB = 'Seen'; // Tab for persisting seen job IDs

// Status values — keep these consistent
export const STATUS = {
  WATCHING: 'Watching',
  APPLIED: 'Applied',
  SCREENING: 'Screening',
  INTERVIEWING: 'Interviewing',
  OFFER: 'Offer',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  ON_HOLD: 'On Hold',
};

/**
 * Fetch all rows from the pipeline sheet
 * @returns {Array} array of opportunity objects
 */
export async function fetchPipeline() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A:I`,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return []; // No data beyond header

    const [headers, ...dataRows] = rows;

    return dataRows
      .filter((row) => row[0]) // skip empty rows
      .map((row) => ({
        company: row[0] || '',
        role: row[1] || '',
        status: row[2] || '',
        appliedDate: row[3] || '',
        lastContact: row[4] || '',
        nextAction: row[5] || '',
        notes: row[6] || '',
        matchScore: row[7] || '',
        ethicsFlag: row[8] || '',
      }));
  } catch (err) {
    console.error('[Sheets] Error fetching pipeline:', err.message);
    return [];
  }
}

/**
 * Add a new opportunity to the pipeline sheet
 */
export async function addOpportunity(opp) {
  try {
    const row = [
      opp.company || '',
      opp.role || '',
      opp.status || STATUS.WATCHING,
      opp.appliedDate || '',
      opp.lastContact || new Date().toLocaleDateString(),
      opp.nextAction || '',
      opp.notes || '',
      opp.matchScore || '',
      opp.ethicsFlag || '',
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `${TAB}!A:I`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });

    console.log(`[Sheets] Added opportunity: ${opp.company} — ${opp.role}`);
  } catch (err) {
    console.error('[Sheets] Error adding opportunity:', err.message);
  }
}

/**
 * Read previously seen job IDs from the "Seen" tab
 * @returns {Set} set of job IDs that have been evaluated before
 */
export async function readSeenJobIds() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SEEN_TAB}!A:A`,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return new Set(); // Header only or empty

    // Skip header (row 0), collect all job IDs from column A
    const ids = rows.slice(1).map((row) => row[0]).filter(Boolean);
    return new Set(ids);
  } catch (err) {
    // Tab might not exist yet — return empty set and log gracefully
    if (err.message.includes('Unable to parse range')) {
      console.log('[Sheets] "Seen" tab does not exist yet — will be created on first write');
      return new Set();
    }
    console.error('[Sheets] Error reading seen job IDs:', err.message);
    return new Set();
  }
}

/**
 * Write seen job IDs to the "Seen" tab (overwrites existing data)
 * @param {Set} seenJobIds - set of job IDs to persist
 */
export async function writeSeenJobIds(seenJobIds) {
  try {
    if (seenJobIds.size === 0) return; // No point writing empty set

    const values = [['Job ID'], ...Array.from(seenJobIds).map((id) => [id])];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SEEN_TAB}!A:A`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    console.log(`[Sheets] Persisted ${seenJobIds.size} seen job IDs`);
  } catch (err) {
    console.error('[Sheets] Error writing seen job IDs:', err.message);
  }
}

/**
 * Get a human-readable summary of the pipeline for Claude to analyze
 */
export function summarizePipeline(pipeline) {
  if (pipeline.length === 0) return 'No active opportunities in pipeline yet.';

  const today = new Date();

  return pipeline.map((opp) => {
    // Flag stale entries (last contact > 7 days ago and status not terminal)
    const terminalStatuses = [STATUS.REJECTED, STATUS.WITHDRAWN];
    let staleFlag = '';
    if (opp.lastContact && !terminalStatuses.includes(opp.status)) {
      const lastContactDate = new Date(opp.lastContact);
      const daysSince = Math.floor((today - lastContactDate) / (1000 * 60 * 60 * 24));
      if (daysSince > 7) staleFlag = ` ⚠ STALE: ${daysSince} days since last contact`;
    }

    return `• ${opp.company} — ${opp.role}
  Status: ${opp.status}${staleFlag}
  Last Contact: ${opp.lastContact || 'never'}
  Next Action: ${opp.nextAction || 'none set'}
  Notes: ${opp.notes || 'none'}`;
  }).join('\n\n');
}
