# job-search-agent

A personal AI-powered job search assistant. Runs daily, monitors your calendar and Gmail,
tracks your opportunity pipeline in Google Sheets, scores new job listings, and drafts emails.
Built with Node.js + Claude API (Haiku) + Google APIs. Deployable to Render.com for free.

---

## What It Does

| Job | Schedule | What happens |
|-----|----------|-------------|
| **Daily Digest** | 7:00 AM daily | Scans Gmail + Calendar + pipeline → Claude generates a prioritized briefing → delivered to your inbox |
| **Job Monitor** | Every 4 hours | Polls RSS feeds from LinkedIn/Indeed/Wellfound → Claude scores each listing → alerts you for matches >70% |
| **Interview Drafter** | 6:30 AM daily | Scans for same-day interviews → pre-drafts thank-you emails in your voice → saves to Gmail Drafts |
| **Outreach Drafter** | On-demand CLI | Drafts cold outreach, referral asks, or LinkedIn messages for specific contacts |

---

## Setup

### 1. Prerequisites
- Node.js 20+
- An Anthropic API key → [platform.claude.com](https://platform.claude.com)
- A Google Cloud project with Gmail, Calendar, and Sheets APIs enabled

### 2. Install
```bash
git clone <your-repo>
cd job-search-agent
npm install
cp .env.example .env
```

### 3. Configure `.env`
Fill in:
- `ANTHROPIC_API_KEY` — from platform.claude.com
- `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — from Google Cloud Console
- `YOUR_EMAIL` — rdanieldesign@gmail.com
- `PIPELINE_SHEET_ID` — from your Google Sheet URL

### 4. Set up Google OAuth
```bash
# Creates OAuth2 credentials and prints tokens for .env
node src/auth.js
```
Follow the URL it prints, authorize, paste the code back. Copy the tokens to `.env`.

### 5. Set up Google Sheets Pipeline Tracker
Create a Google Sheet with these column headers in row 1:
```
Company | Role | Status | Applied Date | Last Contact | Next Action | Notes | Match Score | Ethics Flag
```
Copy the Sheet ID from the URL into `PIPELINE_SHEET_ID` in `.env`.

### 6. Set up RSS job feeds
In LinkedIn:
1. Search: "Senior Engineering Manager" + location/remote filter
2. Click the bell icon to create a job alert
3. Find the RSS link in alert settings → paste into `LINKEDIN_RSS_URL`

For Indeed:
```
https://www.indeed.com/rss?q=senior+engineering+manager&l=remote&sort=date
```

### 7. Test it
```bash
# Dry run — prints output to console, sends no emails
npm test

# Run each job manually to verify
npm run digest
npm run monitor
npm run draft
```

### 8. Deploy to Render.com (free)

1. Push repo to GitHub (make sure `.env` is in `.gitignore` ✓)
2. Go to [render.com](https://render.com) → New → Background Worker
3. Connect your GitHub repo
4. Build command: `npm install`
5. Start command: `npm start`
6. Add all `.env` values as Environment Variables in Render dashboard
7. Deploy

Render's free tier keeps background workers alive indefinitely. No credit card needed.

---

## On-Demand Email Drafting

Draft outreach to a specific contact from the CLI:

```bash
# Edit the outreach params in src/index.js (the 'outreach' case)
# Then run:
node src/index.js --job=outreach
```

Or call `draftOutreach()` directly in a quick script:

```js
import { draftOutreach } from './src/drafter.js';

await draftOutreach({
  name: 'Jeremy Butler',
  title: 'iOS Engineer',
  company: 'AllTrails',
  context: 'LinkedIn connection, reaching out about engineering leadership opportunities',
  type: 'linkedin', // 'email' | 'linkedin' | 'referral-ask'
});
```

---

## Updating Your Profile

Your job search criteria lives in `prompts/profile.js`. Update it whenever:
- Comp expectations change
- New target companies are added
- Ethics criteria evolve
- Active pipeline targets change

This file is injected as the system prompt into every Claude API call.

---

## Cost Estimate

Using Claude Haiku (cheapest model, fully capable for this use case):

| Job | Tokens/run | Daily runs | Monthly cost |
|-----|-----------|-----------|-------------|
| Daily digest | ~2,500 in / 500 out | 1 | ~$0.08 |
| Job monitor | ~800 in / 300 out | 6 (×avg 5 listings) | ~$0.15 |
| Drafter | ~600 in / 400 out | 1 | ~$0.02 |
| **Total** | | | **~$0.25/month** |

---

## File Structure

```
job-search-agent/
├── src/
│   ├── index.js        ← Main entry point + scheduler
│   ├── auth.js         ← Google OAuth setup (run once)
│   ├── google.js       ← Shared Google API client
│   ├── gmail.js        ← Email fetching + sending + drafts
│   ├── calendar.js     ← Calendar event fetching
│   ├── sheets.js       ← Pipeline tracker read/write
│   ├── digest.js       ← Daily briefing email generator
│   ├── monitor.js      ← RSS job feed monitor + scorer
│   └── drafter.js      ← Email/outreach drafter
├── prompts/
│   └── profile.js      ← Your job search profile (update this)
├── .env.example        ← Copy to .env and fill in
├── .gitignore
├── package.json
└── README.md
```
