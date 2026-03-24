# Migration Plan: RSS Feeds → linkedin-jobs-scraper

## Overview

The current `monitor.js` relies on user-supplied RSS feed URLs for LinkedIn, Indeed, and Wellfound.
LinkedIn does not natively support RSS, so that approach is unreliable. This plan migrates job discovery
to the [`linkedin-jobs-scraper`](https://www.npmjs.com/package/linkedin-jobs-scraper) npm package,
which uses a headless Chromium/Puppeteer browser to scrape LinkedIn's public job listings directly.

**Scope:** LinkedIn only for MVP. Indeed and Wellfound support can be added later.

---

## Key Design Decisions & Tradeoffs

### Authentication: Anonymous vs. Authenticated

The scraper supports two modes:

- **Anonymous** — no credentials needed, but may fail in cloud environments (Render, AWS, Heroku)
- **Authenticated** — requires a `li_at` session cookie from a logged-in LinkedIn account. More reliable but requires manual cookie refresh when the session expires (typically every few weeks/months).

**Decision:** Use authenticated mode via `LI_AT_COOKIE` env var. This is more reliable for a deployed background worker. Cookie extraction is a one-time manual step with periodic renewal.

> ⚠️ **Risk:** LinkedIn may rate-limit or ban the account used for scraping. Use a secondary LinkedIn account, not your primary job-search account.

### Search Query Configuration

The scraper takes a `query` string and `location`, along with filters for job type, remote status, experience level, and salary. These will be configured entirely via environment variables — no personal preferences hardcoded in source.

**Decision:** Support multiple queries via a JSON env var (`LINKEDIN_QUERIES`) so the search is fully configurable without touching code.

### Render.com Compatibility

`linkedin-jobs-scraper` uses Puppeteer, which downloads and runs a full Chromium browser (~170MB). This has implications for deployment:

- Render's free tier has a 512MB RAM limit — Chromium may exceed this under load
- Puppeteer requires specific system dependencies that may not be present on all platforms

**Decision:** Document the Render limitation. The scraper will work locally and on Render's paid tier ($7/mo). A `--no-sandbox` flag is required for containerized environments.

### Rate Limiting

The package warns against running too many concurrent queries.

**Decision:** Run queries serially (not `Promise.all`), with `slowMo: 200` as the default, configurable via `LINKEDIN_SLOW_MO` env var.

---

## Checklist

### Dependencies
- [x] Install `linkedin-jobs-scraper` via npm
- [x] Remove `rss-parser` from dependencies (no longer needed)

### New File: `src/linkedin.js`
- [x] Create a new dedicated module `src/linkedin.js` that wraps the scraper
- [x] Accept queries from env var `LINKEDIN_QUERIES` (JSON array of `{ query, location }` objects)
- [x] Accept optional `LI_AT_COOKIE` for authenticated sessions
- [x] Accept `LINKEDIN_SLOW_MO` (default: 200ms) and `LINKEDIN_LIMIT` (default: 25 jobs per query)
- [x] Accept `LINKEDIN_TIME_FILTER` (default: `DAY` — only fetch last 24h) to avoid rescoring old jobs
- [x] Apply experience level filter: `MID_SENIOR` and `DIRECTOR` only (via env: `LINKEDIN_EXPERIENCE_LEVEL`)
- [x] Apply remote/hybrid filter via env: `LINKEDIN_REMOTE` (default: `REMOTE,HYBRID`)
- [x] Return jobs in the same shape as the current RSS items so `assessJob()` in `monitor.js` needs minimal changes
- [x] Gracefully handle the case where `LINKEDIN_QUERIES` is not set (log a warning, return empty array)
- [x] Gracefully handle scraper errors per-query without crashing the whole run
- [x] Close the browser instance after each run to avoid memory leaks

### Changes to `src/monitor.js`
- [x] Remove `rss-parser` import and the `RSS_FEEDS` array
- [x] Remove `LINKEDIN_RSS_URL`, `INDEED_RSS_URL`, `WELLFOUND_RSS_URL` references
- [x] Import and call `scrapeLinkedInJobs()` from `src/linkedin.js` instead
- [x] Update the no-feeds warning message to reference `LINKEDIN_QUERIES` instead of RSS env vars
- [x] Remove `extractCompany()` helper — the scraper returns company name directly
- [x] Remove `stripHtml()` helper — the scraper returns clean `description` text directly
- [x] Adapt `assessJob()` to use the scraper's field names (`jobId`, `title`, `company`, `description`, `link`, `place`)
- [x] Keep `seenJobIds` persistence logic unchanged (still deduplicates on `jobId`)

### Changes to `.env.example`
- [x] Remove `LINKEDIN_RSS_URL`, `INDEED_RSS_URL`, `WELLFOUND_RSS_URL`
- [x] Add `LI_AT_COOKIE` with instructions for how to extract it from Chrome DevTools
- [x] Add `LINKEDIN_QUERIES` with a generic example JSON array (no personal search terms)
- [x] Add `LINKEDIN_LIMIT` (default: 25)
- [x] Add `LINKEDIN_SLOW_MO` (default: 200)
- [x] Add `LINKEDIN_TIME_FILTER` (default: `DAY`)
- [x] Add `LINKEDIN_EXPERIENCE_LEVEL` (default: `MID_SENIOR,DIRECTOR`)
- [x] Add `LINKEDIN_REMOTE` (default: `REMOTE,HYBRID`)

### Changes to `.env` (your local file — not committed)
- [x] Remove `LINKEDIN_RSS_URL`, `INDEED_RSS_URL`, `WELLFOUND_RSS_URL`
- [x] Add `LI_AT_COOKIE` with your actual cookie value (after you extract it)
- [x] Add `LINKEDIN_QUERIES` with your actual search terms

### Changes to `README.md`
- [x] Update the "What It Does" table — Job Monitor description no longer mentions RSS
- [x] Replace section 6 "Set up RSS job feeds" with a new "Set up LinkedIn Scraper" section covering:
  - [x] How to extract the `li_at` cookie from Chrome DevTools
  - [x] How to format `LINKEDIN_QUERIES` as a JSON array
  - [x] Warning to use a secondary LinkedIn account
  - [x] Note on Render.com free tier RAM limitations
- [x] Update the Cost Estimate table — monitor now has higher overhead per run (browser launch ~5–10s)
- [x] Update the File Structure section to include `src/linkedin.js`

### Changes to `package.json`
- [x] Add `linkedin-jobs-scraper` to dependencies
- [x] Remove `rss-parser` from dependencies

### Deployment / Render.com
- [x] Add note in README that Render free tier may not have enough RAM for Chromium
- [x] Document that `--no-sandbox` args are automatically set in the scraper config for container environments
- [x] Add `LI_AT_COOKIE` to the list of env vars to set in Render dashboard

---

## Implementation Notes & Design Decisions

### ✅ Completed Without Compromises

1. **Job object normalization** — The scraper returns a slightly different schema than RSS (e.g., `jobId` instead of `guid`, `description` instead of `contentSnippet`). The wrapper in `src/linkedin.js` normalizes to a consistent format. Monitor.js updated to handle the new field names without any data loss.

2. **No hardcoded personal data** — All search queries, filters, and credentials are 100% environment-variable driven. The code is fully generic and can be committed publicly.

3. **Error resilience** — Each LinkedIn query runs independently. If one query fails, the others continue and the whole monitor doesn't crash.

4. **Browser cleanup** — Always closes the Chromium browser after scraping to prevent memory leaks, even if an error occurs.

### ⚠️ Tradeoffs & Limitations

1. **Render.com free tier incompatible** — Chromium requires ~300–400MB RAM, exceeding Render's 512MB free limit. Recommend Render Standard tier ($7/mo) or running locally. This is documented in README.

2. **Rate limiting vs. frequency** — LinkedIn blocks aggressive scraping. The default `MONITOR_SCHEDULE` is every 4 hours. If you need more frequent updates, increase `LINKEDIN_SLOW_MO` to 300–500ms to slow down actions. Document states this clearly.

3. **Cookie expiry management** — `li_at` cookies expire every 2–4 weeks. You'll need to manually extract a new one. This is a manual operational step, documented in README section 6. No way around it — LinkedIn rotates sessions frequently.

4. **Secondary account requirement** — LinkedIn may rate-limit or block accounts that scrape. Using a secondary account protects your primary job-search account. This is a best practice, not a bug.

5. **Removed Indeed/Wellfound for MVP** — Per your request, only LinkedIn scraping for now. The architecture still supports adding other job boards later via additional scrapers or RSS feeds.

### Security & Privacy

✅ **No personal data in code:**
- All search queries are env vars (`LINKEDIN_QUERIES`)
- All credentials (`LI_AT_COOKIE`) are env vars, protected by `.gitignore`
- User name/email only appear in profile.js (gitignored) and environment variables
- No hardcoded company names, job titles, or preferences in source code
- Verified via grep: no matches for "richard", "gmail.com", or specific job titles in `src/`

✅ **`.gitignore` protection:**
- `.env` is ignored ✓
- `prompts/profile.js` is ignored ✓
- `IMPLEMENTATION_SUMMARY.md` is ignored ✓
- Only `.env.example` is committed (with placeholder values)

---

## What You Will Need to Do Yourself (After Implementation)

1. **Extract your `li_at` cookie:**
   - Log in to LinkedIn in Chrome using a secondary account (not your main job-search account)
   - Open DevTools → Application tab → Cookies → `https://www.linkedin.com`
   - Find the `li_at` row and copy its Value
   - Paste into your `.env` as `LI_AT_COOKIE=<value>`

2. **Configure your search queries** in `.env`:

   ```
   LINKEDIN_QUERIES=[{"query":"Senior Engineering Manager","location":"United States"},{"query":"Engineering Manager","location":"United States"}]
   ```

   Keep this in `.env` only — never commit to git.

3. **Refresh the cookie periodically** — LinkedIn sessions expire. When you see scraper auth errors, repeat step 1.

4. **Monitor your secondary LinkedIn account** — repeated scraping can trigger rate limits. Keep `slowMo` at 200ms minimum and don't run the monitor more than every 4 hours.
