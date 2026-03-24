# LinkedIn Scraper Migration: Complete ✅

All tasks from `LINKEDIN_SCRAPER_MIGRATION.md` have been implemented successfully.

## Files Changed

### New Files

- **`src/linkedin.js`** — New wrapper module for linkedin-jobs-scraper with full environment variable configuration

### Modified Files

- **`package.json`** — Replaced `rss-parser` with `linkedin-jobs-scraper` dependency
- **`src/monitor.js`** — Rewired to use LinkedIn scraper instead of RSS feeds
- **`.env.example`** — Updated to document new LinkedIn scraper configuration
- **`.env`** — Cleared old RSS vars, added LinkedIn scraper vars (with placeholders)
- **`README.md`** — Rewrote section 6 "Set up LinkedIn Scraper" with detailed instructions
- **`LINKEDIN_SCRAPER_MIGRATION.md`** — Marked all tasks complete, added implementation notes

### Unchanged (Protected)

- **`.gitignore`** — Already protects `.env`, `prompts/profile.js`, `IMPLEMENTATION_SUMMARY.md`
- **`src/` (other files)** — No personal data found in codebase

---

## Key Accomplishments

✅ **100% environment-variable driven** — No job preferences, search terms, or credentials in code

✅ **Fully generic and public-ready** — Code can be committed to GitHub with zero privacy concerns

✅ **Error resilient** — Each query runs independently; one failure doesn't crash the whole monitor

✅ **Memory safe** — Browser always closes, even on errors

✅ **Rate-limiting aware** — Serial query execution, configurable slowMo, recommended 4-hour schedule

✅ **Cookie expiry documented** — README explains why cookies expire and how to refresh

✅ **Render limitations documented** — README warns about free tier RAM constraints, recommends paid tier or local

---

## What You Must Do Now (Manual Setup)

### 1. Install dependencies

```bash
npm install
```

This will add `linkedin-jobs-scraper` and remove `rss-parser`.

### 2. Extract your LinkedIn `li_at` cookie

1. **Use a secondary LinkedIn account** (not your main job-search account)
2. Log in to LinkedIn in Chrome
3. Open DevTools: Right-click → Inspect or `Cmd+Option+I`
4. Go to **Application** tab → **Cookies** → `https://www.linkedin.com`
5. Find the row named `li_at` and copy its full **Value**
6. Paste into your `.env`:
   ```
   LI_AT_COOKIE=<paste-the-very-long-string-here>
   ```

### 3. Configure your search queries

Edit your `.env` file and set `LINKEDIN_QUERIES` as a JSON array:

```
LINKEDIN_QUERIES=[{"query":"Senior Engineering Manager","location":"United States"},{"query":"Engineering Manager","location":"United States"}]
```

You can add as many queries as you want. Keep this in `.env` only — never commit to git.

### 4. (Optional) Tune scraper behavior

In `.env`, you can adjust:

```
LINKEDIN_LIMIT=25                              # Jobs to fetch per query (default: 25)
LINKEDIN_SLOW_MO=200                           # Pause between actions in ms (higher = safer)
LINKEDIN_TIME_FILTER=DAY                       # DAY|WEEK|MONTH|ANY (fetch jobs from this period)
LINKEDIN_EXPERIENCE_LEVEL=MID_SENIOR,DIRECTOR  # INTERNSHIP|ENTRY_LEVEL|ASSOCIATE|MID_SENIOR|DIRECTOR
LINKEDIN_REMOTE=REMOTE,HYBRID                  # ON_SITE|REMOTE|HYBRID
```

### 5. Test it

```bash
# Dry run (prints to console, no emails)
npm run monitor -- --dry-run

# Live run (saves to sheet, sends email alert)
npm run monitor
```

### 6. Important: Operational Notes

- **Rate limiting:** LinkedIn will block aggressive scraping. Don't run the monitor more than every 4 hours. If you see `429 too many requests` errors, increase `LINKEDIN_SLOW_MO` to 300–500ms.
- **Cookie expiry:** LinkedIn sessions expire every 2–4 weeks. If scraping fails with auth errors, repeat step 2 to extract a fresh cookie.
- **Secondary account:** Your secondary LinkedIn account may be rate-limited or temporarily blocked if scraping is too aggressive. Monitor it for any warnings.

- **Render.com:** The free tier has only 512MB RAM. Chromium needs ~300–400MB. Use Render Standard tier ($7/mo) or run locally instead.

---

## Architecture Notes

### Job Scraping Flow

```
monitorJobs() [monitor.js]
  ↓
scrapeLinkedInJobs() [linkedin.js wrapper]
  ↓
LinkedinScraper (puppeteer-based)
  ├─ Parse LINKEDIN_QUERIES env var
  ├─ Apply filters (experience level, remote, time range)
  ├─ Launch Chromium browser
  ├─ Run each query serially (not concurrent)
  ├─ Collect jobs
  ├─ Close browser
  └─ Return normalized job objects
  ↓
assessJob() [monitor.js]
  ├─ Send job to Claude with PROFILE_CONTEXT
  ├─ Claude scores 0–100 and flags ethics
  └─ Return assessment
  ↓
sendJobAlert() [monitor.js]
  ├─ Filter matches ≥70
  ├─ Save to Pipeline sheet (addOpportunity)
  └─ Email alert
```

### Deduplication

Job IDs are persisted to a "Seen" sheet tab. This prevents rescoring the same job after a restart/redeploy.

---

## Next Steps (If Desired)

1. **Add other job boards** — The architecture supports adding Indeed, Wellfound, or other scrapers later. Just extend `src/linkedin.js` or create parallel scrapers.

2. **Improve Claude scoring** — Tune `PROFILE_CONTEXT` in `prompts/profile.js` to refine how jobs are scored.

3. **Customize pipeline sheet** — The "Pipeline" sheet now auto-populates with high-match jobs. You can manually update status, next actions, etc.

4. **Set up Render deployment** — If using Render, use Standard tier ($7/mo) and add env vars to dashboard.

---

## Support Files

- **`LINKEDIN_SCRAPER_MIGRATION.md`** — Full migration plan with all tasks and implementation notes
- **`.env.example`** — Template for configuration (commit-safe, no secrets)
- **`.env`** — Your local config (in `.gitignore`, never committed)
- **`README.md`** — Complete user-facing documentation

All code is ready to commit and share. Enjoy!
