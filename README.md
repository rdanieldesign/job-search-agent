# job-search-agent

A personal AI-powered job search assistant. Runs daily, monitors your calendar and Gmail,
tracks your opportunity pipeline in Google Sheets, scores new job listings, and drafts emails.
Built with Node.js + Claude API (Haiku) + Google APIs. Deployable to Render.com (paid tier required for background workers).

---

## What It Does

| Job                   | Schedule      | What happens                                                                                          |
| --------------------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| **Daily Digest**      | 7:00 AM daily | Scans Gmail + Calendar + pipeline → Claude generates a prioritized briefing → delivered to your inbox |
| **Job Monitor**       | Every 4 hours | Scrapes LinkedIn with configured queries → Claude scores each listing → alerts you for matches >70%   |
| **Interview Drafter** | 6:30 AM daily | Scans for same-day interviews → pre-drafts thank-you emails in your voice → saves to Gmail Drafts     |
| **Outreach Drafter**  | On-demand CLI | Drafts cold outreach, referral asks, or LinkedIn messages for specific contacts                       |

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
- `YOUR_EMAIL` — your.email@example.com
- `PIPELINE_SHEET_ID` — from your Google Sheet URL

### 4. Set up Google OAuth

```bash
# Creates OAuth2 credentials and prints tokens for .env
node src/auth.js
```

Follow the URL it prints, authorize, paste the code back. Copy the tokens to `.env`.

### 5. Set up Google Sheets Pipeline Tracker

Create a Google Sheet with **two tabs**:

**Tab 1: "Pipeline"** — column headers in row 1:

```
Company | Role | Status | Applied Date | Last Contact | Next Action | Notes | Match Score | Ethics Flag
```

**Tab 2: "Seen"** — just leave blank (the monitor will use this to track seen jobs across restarts and avoid re-scoring them; it writes three columns: `Job ID | Title | Company`)

Copy the Sheet ID from the URL into `PIPELINE_SHEET_ID` in `.env`.

### 6. Set up LinkedIn Job Search

The Job Monitor fetches listings directly from LinkedIn's public job board — no account, login, or browser required.

**Step 1: Configure your search queries**

Edit `.env` and set `LINKEDIN_QUERIES` as a JSON array:

```
LINKEDIN_QUERIES=[{"query":"Senior Engineering Manager","location":"United States"},{"query":"Engineering Manager","location":"United States"}]
```

You can use any job title and location. Keep this in `.env` only — never commit to git.

**Step 2: Optional — fine-tune search behavior**

In `.env`, adjust these if needed:

```
LINKEDIN_LIMIT=25                              # Max jobs per query (default: 25)
LINKEDIN_REQUEST_DELAY_MS=500                  # Pause between HTTP requests in ms (default: 500)
LINKEDIN_TIME_FILTER=DAY                       # Only fetch: DAY | WEEK | MONTH | ANY (default: DAY)
LINKEDIN_EXPERIENCE_LEVEL=MID_SENIOR,DIRECTOR  # Filter by level (default: MID_SENIOR,DIRECTOR)
LINKEDIN_REMOTE=REMOTE,HYBRID                  # Filter by location type (default: REMOTE,HYBRID)
```

**⚠️ Rate limiting:** Don't set `MONITOR_SCHEDULE` to run more than every 4 hours. If you see `429 too many requests` errors, increase `LINKEDIN_REQUEST_DELAY_MS` to 1000–2000ms.

### 7. Test it

```bash
# Dry run — prints output to console, sends no emails
npm test

# Run each job manually to verify
npm run digest
npm run monitor
npm run draft
```

### 8. Deploy to Render.com

**Note:** Render's free tier only covers web services and static sites. This agent runs as a persistent background worker (for `node-cron` scheduling) which requires a paid plan — Starter tier at $7/month.

Alternatively, run the agent locally with `npm start` and keep the terminal open, or use any always-on machine you have access to.

**To deploy on Render:**

1. Push repo to GitHub (make sure `.env` is in `.gitignore` ✓)
2. Go to [render.com](https://render.com) → New → Background Worker
3. Connect your GitHub repo
4. Build command: `npm install`
5. Start command: `npm start`
6. Add all `.env` values as Environment Variables in the Render dashboard:
   - `ANTHROPIC_API_KEY`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_ACCESS_TOKEN`, `GOOGLE_REFRESH_TOKEN`
   - `YOUR_EMAIL`, `YOUR_NAME`
   - `PIPELINE_SHEET_ID`, `PIPELINE_SHEET_TAB`
   - `LINKEDIN_QUERIES`
   - `LINKEDIN_LIMIT`, `LINKEDIN_REQUEST_DELAY_MS`, etc.
   - `DIGEST_SCHEDULE`, `MONITOR_SCHEDULE`
7. Deploy

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
import { draftOutreach } from "./src/drafter.js";

await draftOutreach({
  name: "[CONTACT_NAME]",
  title: "[CONTACT_TITLE]",
  company: "[COMPANY_NAME]",
  context:
    "LinkedIn connection, reaching out about engineering leadership opportunities",
  type: "linkedin",
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

| Job          | Tokens/run          | Daily runs          | Monthly cost     |
| ------------ | ------------------- | ------------------- | ---------------- |
| Daily digest | ~2,500 in / 500 out | 1                   | ~$0.08           |
| Job monitor  | ~800 in / 300 out   | 6 (×avg 5 listings) | ~$0.15           |
| Drafter      | ~600 in / 400 out   | 1                   | ~$0.02           |
| **Total**    |                     |                     | **~$0.25/month** |

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
│   ├── linkedin.js     ← LinkedIn public job board client
│   ├── digest.js       ← Daily briefing email generator
│   ├── monitor.js      ← Job scraping + scoring orchestrator
│   └── drafter.js      ← Email/outreach drafter
├── prompts/
│   └── profile.js      ← Your job search profile (update this)
├── .env.example        ← Copy to .env and fill in
├── .gitignore
├── package.json
└── README.md
```
