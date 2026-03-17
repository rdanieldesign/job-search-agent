// src/monitor.js
// Monitors RSS job feeds, scores new listings against Richard's profile using Claude,
// and sends an alert email for high-match roles.

import Parser from 'rss-parser';
import Anthropic from '@anthropic-ai/sdk';
import { sendEmail } from './gmail.js';
import { addOpportunity } from './sheets.js';
import { PROFILE_CONTEXT } from '../prompts/profile.js';
import 'dotenv/config';

const parser = new Parser();
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Track already-seen job IDs to avoid duplicates (in-memory; resets on restart)
// For persistence across restarts, this could be stored in a Sheets tab
const seenJobIds = new Set();

const RSS_FEEDS = [
  { name: 'LinkedIn', url: process.env.LINKEDIN_RSS_URL },
  { name: 'Indeed', url: process.env.INDEED_RSS_URL },
  { name: 'Wellfound', url: process.env.WELLFOUND_RSS_URL },
].filter((f) => f.url); // only use feeds that are configured

/**
 * Check all RSS feeds for new matching jobs
 */
export async function monitorJobs() {
  console.log(`[Monitor] Checking ${RSS_FEEDS.length} job feeds...`);
  const newMatches = [];

  for (const feed of RSS_FEEDS) {
    try {
      const parsed = await parser.parseURL(feed.url);
      const items = parsed.items || [];
      console.log(`[Monitor] ${feed.name}: ${items.length} listings found`);

      for (const item of items) {
        const jobId = item.guid || item.link;
        if (seenJobIds.has(jobId)) continue;
        seenJobIds.add(jobId);

        const assessment = await assessJob(item, feed.name);
        if (assessment && assessment.matchScore >= 70) {
          newMatches.push({ ...item, ...assessment, source: feed.name });
        }
      }
    } catch (err) {
      console.error(`[Monitor] Error parsing ${feed.name} feed:`, err.message);
    }
  }

  if (newMatches.length > 0) {
    console.log(`[Monitor] ${newMatches.length} high-match role(s) found — sending alert`);
    await sendJobAlert(newMatches);
  } else {
    console.log('[Monitor] No high-match new roles found this run');
  }

  return newMatches;
}

/**
 * Use Claude to assess whether a job matches Richard's profile
 */
async function assessJob(item, source) {
  const jobText = `
Job Title: ${item.title || 'Unknown'}
Company: ${extractCompany(item)}
Source: ${source}
Link: ${item.link || ''}
Description: ${stripHtml(item.contentSnippet || item.content || item.summary || '')}
  `.trim();

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      system: PROFILE_CONTEXT,
      messages: [
        {
          role: 'user',
          content: `Assess this job listing. Respond in JSON only, no markdown.

${jobText}

Return exactly this JSON structure:
{
  "matchScore": <0-100 integer>,
  "title": "<cleaned job title>",
  "company": "<company name>",
  "ethicsFlag": "<none|caution|hard-skip>",
  "ethicsReason": "<one sentence if caution or hard-skip, else empty string>",
  "compEstimate": "<salary range if visible or 'unknown'>",
  "recommendation": "<one sentence — should Richard apply?>",
  "passesEthics": <true|false>
}

Score 0 if ethics flag is hard-skip. Score based on: title match, company mission fit, 
comp alignment, ethics pass, and outdoor/PBC bonus points.`,
        },
      ],
    });

    const text = response.content[0]?.text || '{}';
    return JSON.parse(text.replace(/```json|```/g, '').trim());
  } catch (err) {
    console.error(`[Monitor] Error assessing job "${item.title}":`, err.message);
    return null;
  }
}

/**
 * Send an alert email with high-match job listings
 */
async function sendJobAlert(matches) {
  const isDryRun = process.env.DRY_RUN === 'true';

  const html = `
<!DOCTYPE html>
<html>
<head>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #1a1a18; }
  h1 { font-size: 22px; font-weight: 700; border-bottom: 2px solid #2d5016; padding-bottom: 8px; color: #2d5016; }
  .job-card { border: 1px solid #ddd9d0; border-radius: 8px; padding: 16px; margin: 12px 0; background: #fff; }
  .job-title { font-size: 16px; font-weight: 600; margin-bottom: 4px; }
  .job-meta { font-size: 12px; color: #7a7568; font-family: monospace; margin-bottom: 10px; }
  .score { display: inline-block; padding: 2px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; }
  .score-high { background: #EAF3DE; color: #3B6D11; }
  .score-med { background: #FAEEDA; color: #854F0B; }
  .ethics-caution { background: #FAEEDA; color: #854F0B; padding: 6px 10px; border-radius: 4px; font-size: 12px; margin: 6px 0; }
  .ethics-skip { background: #FAECE7; color: #993C1D; padding: 6px 10px; border-radius: 4px; font-size: 12px; margin: 6px 0; }
  .rec { font-size: 13px; color: #4a6741; margin-top: 8px; font-style: italic; }
  a { color: #2a5c8b; }
</style>
</head>
<body>
<h1>🎯 New Job Matches — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h1>
<p style="color: #7a7568; font-size: 13px;">${matches.length} new role${matches.length > 1 ? 's' : ''} above 70% match threshold</p>

${matches.map((job) => `
<div class="job-card">
  <div class="job-title">${job.title || job.cleanTitle}</div>
  <div class="job-meta">
    ${job.company} &nbsp;·&nbsp; via ${job.source} &nbsp;·&nbsp; Comp: ${job.compEstimate || 'not listed'}
  </div>
  <span class="score ${job.matchScore >= 85 ? 'score-high' : 'score-med'}">
    Match: ${job.matchScore}/100
  </span>
  ${job.ethicsFlag === 'caution' ? `<div class="ethics-caution">⚠ Ethics caution: ${job.ethicsReason}</div>` : ''}
  ${job.ethicsFlag === 'hard-skip' ? `<div class="ethics-skip">🚫 Ethics skip: ${job.ethicsReason}</div>` : ''}
  <div class="rec">${job.recommendation}</div>
  ${job.link ? `<div style="margin-top: 8px;"><a href="${job.link}">View posting →</a></div>` : ''}
</div>
`).join('')}

<p style="font-size: 11px; color: #aaa; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">
  Sent by job-search-agent · <a href="mailto:${process.env.YOUR_EMAIL}">Manage</a>
</p>
</body>
</html>`;

  if (isDryRun) {
    console.log('[DRY RUN] Would send job alert email:');
    matches.forEach((j) => console.log(`  ${j.matchScore}/100 — ${j.title} @ ${j.company}`));
    return;
  }

  await sendEmail(
    process.env.YOUR_EMAIL,
    `🎯 ${matches.length} New Job Match${matches.length > 1 ? 'es' : ''} — ${new Date().toLocaleDateString()}`,
    html
  );
}

function extractCompany(item) {
  // LinkedIn and Indeed often include company in the title as "Role @ Company"
  const title = item.title || '';
  if (title.includes(' at ')) return title.split(' at ').pop().trim();
  if (title.includes(' @ ')) return title.split(' @ ').pop().trim();
  return item.author || 'Unknown';
}

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 800);
}
