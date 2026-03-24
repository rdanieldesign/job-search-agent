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
 * Read previously seen jobs from the "Seen" tab
 * @returns {Map} map of jobId → { title, company }
 */
export async function readSeenJobIds() {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: `${SEEN_TAB}!A:C`,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return new Map(); // Header only or empty

    // Skip header (row 0); columns: A=jobId, B=title, C=company
    const map = new Map();
    for (const row of rows.slice(1)) {
      const id = row[0];
      if (id) map.set(id, { title: row[1] || '', company: row[2] || '' });
    }
    return map;
  } catch (err) {
    // Tab might not exist yet — return empty map and log gracefully
    if (err.message.includes('Unable to parse range')) {
      console.log('[Sheets] "Seen" tab does not exist yet — will be created on first write');
      return new Map();
    }
    console.error('[Sheets] Error reading seen jobs:', err.message);
    return new Map();
  }
}

/**
 * Write seen jobs to the "Seen" tab (overwrites existing data)
 * @param {Map} seenJobIds - map of jobId → { title, company }
 */
export async function writeSeenJobIds(seenJobIds) {
  try {
    if (seenJobIds.size === 0) return; // No point writing empty map

    const values = [
      ['Job ID', 'Title', 'Company'],
      ...Array.from(seenJobIds.entries()).map(([id, { title, company }]) => [id, title, company]),
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `${SEEN_TAB}!A:C`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    console.log(`[Sheets] Persisted ${seenJobIds.size} seen jobs`);
  } catch (err) {
    console.error('[Sheets] Error writing seen jobs:', err.message);
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
