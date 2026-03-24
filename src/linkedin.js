// src/linkedin.js
// Fetches jobs from LinkedIn's public (unauthenticated) job search endpoint.
// No browser, no cookies, no LinkedIn account required.

import * as cheerio from 'cheerio';
import 'dotenv/config';

const BASE_URL = 'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search';

// Map experience level strings from env to LinkedIn f_E param values
const EXPERIENCE_MAP = {
  INTERNSHIP: '1',
  ENTRY_LEVEL: '2',
  ASSOCIATE: '3',
  MID_SENIOR: '4',
  DIRECTOR: '5',
};

// Map remote/onsite strings from env to LinkedIn f_WT param values
const REMOTE_MAP = {
  ON_SITE: '1',
  REMOTE: '2',
  HYBRID: '3',
};

// Map time filter strings from env to LinkedIn f_TPR param values
const TIME_MAP = {
  DAY: 'r86400',
  WEEK: 'r604800',
  MONTH: 'r2592000',
  ANY: '',
};

/**
 * Parse LINKEDIN_QUERIES env var (JSON array) into query objects
 */
function parseQueries() {
  try {
    const raw = process.env.LINKEDIN_QUERIES;
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('[LinkedIn] Error parsing LINKEDIN_QUERIES JSON:', err.message);
    return [];
  }
}

/**
 * Build LinkedIn search URL for a given query and page offset
 */
function buildSearchUrl(query, location, offset) {
  const experienceLevels = (process.env.LINKEDIN_EXPERIENCE_LEVEL || 'MID_SENIOR,DIRECTOR')
    .split(',')
    .map((s) => EXPERIENCE_MAP[s.trim()])
    .filter(Boolean)
    .join(',');

  const remoteTypes = (process.env.LINKEDIN_REMOTE || 'REMOTE,HYBRID')
    .split(',')
    .map((s) => REMOTE_MAP[s.trim()])
    .filter(Boolean)
    .join(',');

  const timeFilter = TIME_MAP[process.env.LINKEDIN_TIME_FILTER?.toUpperCase() || 'DAY'] ?? 'r86400';

  const params = new URLSearchParams({
    keywords: query,
    location,
    start: String(offset),
  });

  if (experienceLevels) params.set('f_E', experienceLevels);
  if (remoteTypes) params.set('f_WT', remoteTypes);
  if (timeFilter) params.set('f_TPR', timeFilter);

  return `${BASE_URL}?${params.toString()}`;
}

/**
 * Parse job cards from LinkedIn search HTML response
 * Returns array of normalized job objects
 */
function parseJobCards(html) {
  const $ = cheerio.load(html);
  const jobs = [];

  $('li').each((_, el) => {
    const card = $(el);

    // Job ID is in data-entity-urn="urn:li:jobPosting:1234567890" on the base-card div
    const urn = card.find('[data-entity-urn]').attr('data-entity-urn') || '';
    const jobIdMatch = urn.match(/jobPosting:(\d+)/);
    const jobId = jobIdMatch?.[1] || '';

    if (!jobId) return; // Skip cards without a parseable job ID

    const title = card.find('.base-search-card__title').text().trim();
    // Company name lives inside an <a> within the subtitle <h4>
    const company = card.find('.base-search-card__subtitle').text().trim();
    const place = card.find('.job-search-card__location').text().trim();
    const dateText = card.find('time').text().trim();
    const dateAttr = card.find('time').attr('datetime') || '';

    // Build a clean job link from the job ID
    const href = card.find('a.base-card__full-link').attr('href') || '';
    const cleanLink = href.split('?')[0];

    jobs.push({
      jobId,
      title,
      company,
      place,
      description: '',   // Not fetched — scoring uses title + company only
      descriptionHTML: '',
      link: cleanLink,
      applyLink: '',
      date: dateAttr,
      dateText,
    });
  });

  return jobs;
}

/**
 * Fetch one page of LinkedIn job search results
 */
async function fetchJobPage(query, location, offset, delayMs) {
  const url = buildSearchUrl(query, location, offset);

  // Polite delay between requests (skip on first page)
  if (offset > 0 && delayMs > 0) {
    await new Promise((r) => setTimeout(r, delayMs));
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (res.status === 429) {
      console.warn('[LinkedIn] Rate limited (429) — backing off this query');
      return [];
    }

    if (!res.ok) {
      console.error(`[LinkedIn] HTTP ${res.status} for query "${query}" offset ${offset}`);
      return [];
    }

    const html = await res.text();
    const jobs = parseJobCards(html);

    if (jobs.length === 0 && html.length > 500) {
      // Got a response but parsed 0 jobs — selectors may need updating
      console.warn(
        `[LinkedIn] ⚠ Parsed 0 jobs from a non-empty response (${html.length} bytes). ` +
        'LinkedIn may have changed their HTML structure.'
      );
    }

    return jobs;
  } catch (err) {
    console.error(`[LinkedIn] Fetch error for query "${query}":`, err.message);
    return [];
  }
}

/**
 * Fetch jobs for a single query, paginating up to the configured limit
 */
async function fetchQuery(queryConfig, limit, delayMs) {
  const { query, location } = queryConfig;
  const pageSize = 25; // LinkedIn returns up to 25 jobs per page
  const jobs = [];

  console.log(`[LinkedIn] Searching: "${query}" in ${location}`);

  for (let offset = 0; offset < limit; offset += pageSize) {
    const batch = await fetchJobPage(query, location, offset, delayMs);
    jobs.push(...batch);
    console.log(`[LinkedIn] Page offset=${offset}: got ${batch.length} jobs (total so far: ${jobs.length})`);

    if (batch.length < pageSize) break; // No more pages
    if (jobs.length >= limit) break;
  }

  return jobs.slice(0, limit);
}

/**
 * Scrape LinkedIn public job board for jobs matching configured queries.
 * Returns normalized job objects compatible with monitor.js
 */
export async function scrapeLinkedInJobs() {
  const queries = parseQueries();

  if (queries.length === 0) {
    console.log(
      '[LinkedIn] ⚠ No LinkedIn queries configured. Set LINKEDIN_QUERIES env var to enable scraping.'
    );
    return [];
  }

  const limit = parseInt(process.env.LINKEDIN_LIMIT || '25', 10);
  const delayMs = parseInt(process.env.LINKEDIN_REQUEST_DELAY_MS || '500', 10);
  const allJobs = [];

  for (const q of queries) {
    try {
      const jobs = await fetchQuery(q, limit, delayMs);
      allJobs.push(...jobs);
    } catch (err) {
      console.error(`[LinkedIn] Error running query "${q.query}":`, err.message);
      // Continue to next query instead of crashing
    }

    // Delay between queries (not just between pages)
    if (queries.indexOf(q) < queries.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  console.log(`[LinkedIn] Scraping complete. Found ${allJobs.length} jobs.`);
  return allJobs;
}
