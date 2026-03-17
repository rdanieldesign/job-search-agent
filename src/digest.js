// src/digest.js
// Generates the daily job search briefing email.
// Pulls Gmail, Calendar, and pipeline data → sends to Claude → delivers to inbox.

import Anthropic from '@anthropic-ai/sdk';
import { fetchRecentJobEmails, sendEmail } from './gmail.js';
import { fetchUpcomingEvents } from './calendar.js';
import { fetchPipeline, summarizePipeline } from './sheets.js';
import { PROFILE_CONTEXT } from '../prompts/profile.js';
import 'dotenv/config';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runDailyDigest() {
  console.log('[Digest] Starting daily job search digest...');

  // Gather all context in parallel
  const [emails, events, pipeline] = await Promise.all([
    fetchRecentJobEmails(24),
    fetchUpcomingEvents(7),
    fetchPipeline(),
  ]);

  console.log(`[Digest] Fetched: ${emails.length} emails, ${events.length} events, ${pipeline.length} pipeline entries`);

  // Build the prompt for Claude
  const userPrompt = buildDigestPrompt(emails, events, pipeline);

  // Ask Claude to generate the digest
  console.log('[Digest] Asking Claude to generate briefing...');
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 1500,
    system: PROFILE_CONTEXT + `

You are generating Richard's daily job search briefing email. 
Output valid HTML only — no markdown, no preamble, no explanation.
The email should be clean, scannable, and action-oriented.
Use the design system below.

HTML Design Rules:
- Body: font-family: -apple-system, sans-serif; max-width: 680px; margin: 0 auto; padding: 24px; color: #1a1a18;
- Section headers: font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; color: #7a7568; margin: 24px 0 8px;
- Priority items: bold company name, brief context, clear next action in italics
- Use color sparingly: #2d5016 (green) for positive, #c49a2a (amber) for caution, #c0522a (red) for urgent
- Keep each item to 2-3 lines max
- End with a "Focus for today" section: exactly 3 bullet points, most important actions
`,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  const htmlContent = response.content[0]?.text || '<p>Error generating digest.</p>';

  // Wrap in full email template
  const fullHtml = wrapEmailTemplate(htmlContent);

  const subject = `☀️ Job Search Brief — ${new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })}`;

  if (process.env.DRY_RUN === 'true') {
    console.log('[DRY RUN] Digest subject:', subject);
    console.log('[DRY RUN] Digest preview (first 500 chars):');
    console.log(htmlContent.slice(0, 500));
    return;
  }

  await sendEmail(process.env.YOUR_EMAIL, subject, fullHtml);
  console.log('[Digest] Daily digest sent successfully');
}

function buildDigestPrompt(emails, events, pipeline) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const emailSummary = emails.length === 0
    ? 'No job-related emails in the last 24 hours.'
    : emails.map((e) =>
        `• From: ${e.from}\n  Subject: ${e.subject}\n  Preview: ${e.snippet}`
      ).join('\n\n');

  const eventSummary = events.length === 0
    ? 'No job-related calendar events in the next 7 days.'
    : events.map((e) => {
        const start = new Date(e.start).toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit',
        });
        return `• ${e.title} — ${start}${e.isJobRelated ? ' [JOB RELATED]' : ''}`;
      }).join('\n');

  const pipelineSummary = summarizePipeline(pipeline);

  return `Generate today's job search briefing email for ${today}.

## Recent Emails (last 24 hours)
${emailSummary}

## Upcoming Calendar Events (next 7 days)
${eventSummary}

## Active Opportunity Pipeline
${pipelineSummary}

Generate a clean, prioritized HTML briefing with:
1. A "Today's Priority Actions" section (3 items max, most urgent first)
2. An "Upcoming Interviews & Calls" section (if any)
3. An "Email Follow-ups Needed" section (based on emails + stale pipeline)
4. A "Pipeline Health" snapshot (brief status of each active opportunity)
5. A "Focus for Today" closing section with exactly 3 action bullets

Be specific. Reference actual company names, people, and dates from the data above.
If nothing is urgent, say so clearly and suggest a proactive outreach to make.`;
}

function wrapEmailTemplate(innerHtml) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f6f1; margin: 0; padding: 0; }
  .wrapper { max-width: 680px; margin: 0 auto; background: #ffffff; }
  .header { background: #2d5016; color: #f8f6f1; padding: 20px 28px; }
  .header h1 { font-size: 18px; font-weight: 700; margin: 0; }
  .header p { font-size: 12px; color: rgba(248,246,241,0.6); margin: 4px 0 0; font-family: monospace; }
  .content { padding: 24px 28px; font-size: 14px; line-height: 1.6; color: #1a1a18; }
  .footer { background: #f8f6f1; padding: 14px 28px; font-size: 11px; color: #7a7568; border-top: 1px solid #ddd9d0; font-family: monospace; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>☀️ Job Search Brief</h1>
    <p>${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · Generated by job-search-agent</p>
  </div>
  <div class="content">
    ${innerHtml}
  </div>
  <div class="footer">
    job-search-agent · Running on Render.com · Powered by Claude Haiku
  </div>
</div>
</body>
</html>`;
}
