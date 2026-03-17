// src/gmail.js
// Fetches recent job-related emails from Gmail for the daily digest.

import { gmail } from './google.js';

// Labels/keywords that identify job-related emails
const JOB_SEARCH_QUERY = [
  'subject:interview',
  'subject:opportunity',
  'subject:recruiter',
  'subject:offer',
  'subject:application',
  'subject:follow up',
  'subject:position',
  'from:greenhouse.io',
  'from:lever.co',
  'from:ashbyhq.com',
  'from:linkedin.com',
  'from:indeed.com',
  'label:job-search', // if you've set up a Gmail label
].join(' OR ');

/**
 * Fetch job-related emails from the last N hours
 * @param {number} hoursBack - how far back to look (default 24)
 * @returns {Array} array of simplified email objects
 */
export async function fetchRecentJobEmails(hoursBack = 24) {
  try {
    const after = Math.floor((Date.now() - hoursBack * 60 * 60 * 1000) / 1000);
    const query = `(${JOB_SEARCH_QUERY}) after:${after}`;

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 20,
    });

    const messages = listRes.data.messages || [];
    if (messages.length === 0) return [];

    // Fetch each message in parallel
    const emailDetails = await Promise.all(
      messages.map((m) => fetchEmailDetail(m.id))
    );

    return emailDetails.filter(Boolean);
  } catch (err) {
    console.error('[Gmail] Error fetching emails:', err.message);
    return [];
  }
}

/**
 * Fetch a single email's subject, sender, date, and snippet
 */
async function fetchEmailDetail(messageId) {
  try {
    const res = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'metadata',
      metadataHeaders: ['Subject', 'From', 'Date'],
    });

    const headers = res.data.payload?.headers || [];
    const get = (name) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    return {
      id: messageId,
      subject: get('Subject'),
      from: get('From'),
      date: get('Date'),
      snippet: res.data.snippet || '',
    };
  } catch (err) {
    console.error(`[Gmail] Error fetching message ${messageId}:`, err.message);
    return null;
  }
}

/**
 * Create a draft email in Gmail
 * @param {string} to - recipient email
 * @param {string} subject - email subject
 * @param {string} body - plain text or HTML body
 */
export async function createDraft(to, subject, body) {
  try {
    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      body,
    ].join('\n');

    const encoded = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await gmail.users.drafts.create({
      userId: 'me',
      requestBody: {
        message: { raw: encoded },
      },
    });

    console.log(`[Gmail] Draft created: ${subject} (ID: ${res.data.id})`);
    return res.data.id;
  } catch (err) {
    console.error('[Gmail] Error creating draft:', err.message);
    return null;
  }
}

/**
 * Send an email directly (used for the daily digest to yourself)
 */
export async function sendEmail(to, subject, htmlBody) {
  try {
    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      '',
      htmlBody,
    ].join('\n');

    const encoded = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });

    console.log(`[Gmail] Email sent: ${subject}`);
  } catch (err) {
    console.error('[Gmail] Error sending email:', err.message);
  }
}
