// src/linkedin.js
// Wraps linkedin-jobs-scraper with environment variable configuration.
// Abstracts all LinkedIn-specific logic and returns jobs in a normalized format.

import {
  LinkedinScraper,
  relevanceFilter,
  timeFilter,
  experienceLevelFilter,
  onSiteOrRemoteFilter,
  events,
} from "linkedin-jobs-scraper";
import "dotenv/config";

/**
 * Parse LINKEDIN_QUERIES env var (JSON array) into scraper query format
 */
function parseQueries() {
  try {
    const queriesJson = process.env.LINKEDIN_QUERIES;
    if (!queriesJson) return [];
    return JSON.parse(queriesJson);
  } catch (err) {
    console.error(
      "[LinkedIn] Error parsing LINKEDIN_QUERIES JSON:",
      err.message,
    );
    return [];
  }
}

/**
 * Map experience level strings from env to scraper constants
 */
function parseExperienceLevels() {
  const env = process.env.LINKEDIN_EXPERIENCE_LEVEL || "MID_SENIOR,DIRECTOR";
  const levels = env.split(",").map((s) => s.trim());
  const mapping = {
    INTERNSHIP: experienceLevelFilter.INTERNSHIP,
    ENTRY_LEVEL: experienceLevelFilter.ENTRY_LEVEL,
    ASSOCIATE: experienceLevelFilter.ASSOCIATE,
    MID_SENIOR: experienceLevelFilter.MID_SENIOR,
    DIRECTOR: experienceLevelFilter.DIRECTOR,
  };
  return levels.map((l) => mapping[l]).filter(Boolean);
}

/**
 * Map remote/hybrid strings from env to scraper constants
 */
function parseRemoteFilters() {
  const env = process.env.LINKEDIN_REMOTE || "REMOTE,HYBRID";
  const filters = env.split(",").map((s) => s.trim());
  const mapping = {
    ON_SITE: onSiteOrRemoteFilter.ON_SITE,
    REMOTE: onSiteOrRemoteFilter.REMOTE,
    HYBRID: onSiteOrRemoteFilter.HYBRID,
  };
  return filters.map((f) => mapping[f]).filter(Boolean);
}

/**
 * Parse time filter from env
 */
function parseTimeFilter() {
  const env = process.env.LINKEDIN_TIME_FILTER || "DAY";
  const mapping = {
    DAY: timeFilter.DAY,
    WEEK: timeFilter.WEEK,
    MONTH: timeFilter.MONTH,
    ANY: timeFilter.ANY,
  };
  return mapping[env] || timeFilter.DAY;
}

/**
 * Scrape LinkedIn for jobs matching configured queries
 * Returns normalized job objects compatible with monitor.js
 */
export async function scrapeLinkedInJobs() {
  const queries = parseQueries();

  if (queries.length === 0) {
    console.log(
      "[LinkedIn] ⚠️ No LinkedIn queries configured. Set LINKEDIN_QUERIES env var to enable scraping.",
    );
    return [];
  }

  const jobs = [];
  let scraper;

  try {
    // Initialize scraper with environment configuration
    const slowMo = parseInt(process.env.LINKEDIN_SLOW_MO || "200", 10);
    const args = ["--lang=en-US"];

    // For containerized environments (Render, etc.), disable sandbox
    if (process.env.NODE_ENV === "production") {
      args.push("--no-sandbox", "--disable-setuid-sandbox");
    }

    scraper = new LinkedinScraper({
      headless: "new",
      slowMo,
      args,
    });

    // Collect jobs from each event
    scraper.on(events.scraper.data, (data) => {
      jobs.push({
        jobId: data.jobId,
        title: data.title,
        company: data.company || "Unknown",
        place: data.place,
        description: data.description || "",
        descriptionHTML: data.descriptionHTML || "",
        link: data.link,
        applyLink: data.applyLink || "",
        date: data.date,
        dateText: data.dateText,
        insights: data.insights,
      });
      console.log(`[LinkedIn] Scraped: ${data.title} @ ${data.company}`);
    });

    // Log per-page metrics
    scraper.on(events.scraper.metrics, (metrics) => {
      console.log(
        `[LinkedIn] Page metrics: processed=${metrics.processed}, failed=${metrics.failed}, missed=${metrics.missed}`,
      );
    });

    // Log scraper errors without crashing
    scraper.on(events.scraper.error, (err) => {
      console.error("[LinkedIn] Scraper error:", err.message);
    });

    // Build filter configuration from env vars
    const experienceLevels = parseExperienceLevels();
    const remoteFilters = parseRemoteFilters();
    const timeFilterValue = parseTimeFilter();
    const limit = parseInt(process.env.LINKEDIN_LIMIT || "25", 10);

    // Run all queries serially (not concurrent) to avoid rate limiting
    for (const q of queries) {
      console.log(`[LinkedIn] Running query: "${q.query}" in ${q.location}...`);

      try {
        await scraper.run([
          {
            query: q.query,
            location: q.location,
            options: {
              limit,
              filters: {
                relevance: relevanceFilter.RELEVANT,
                time: timeFilterValue,
                experience: experienceLevels,
                onSiteOrRemote: remoteFilters,
              },
            },
          },
        ]);
      } catch (err) {
        console.error(
          `[LinkedIn] Error running query "${q.query}":`,
          err.message,
        );
        // Continue to next query instead of crashing
      }
    }

    console.log(`[LinkedIn] Scraping complete. Found ${jobs.length} jobs.`);
  } catch (err) {
    console.error("[LinkedIn] Fatal scraper error:", err.message);
  } finally {
    // Always close the browser to avoid memory leaks
    if (scraper) {
      try {
        await scraper.close();
        console.log("[LinkedIn] Browser closed.");
      } catch (err) {
        console.error("[LinkedIn] Error closing browser:", err.message);
      }
    }
  }

  return jobs;
}
