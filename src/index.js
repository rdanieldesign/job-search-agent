// src/index.js
// Main entry point — runs scheduled jobs or one-off commands via CLI flags.
//
// Usage:
//   node src/index.js                  → starts all scheduled jobs (production mode)
//   node src/index.js --job=digest     → run digest once immediately
//   node src/index.js --job=monitor    → run job monitor once immediately
//   node src/index.js --job=draft      → run interview drafter once immediately
//   node src/index.js --dry-run        → any job in dry-run mode (no emails sent)
//
// Scheduled jobs (when running in production):
//   Digest:  daily at 7:00 AM (configurable via DIGEST_SCHEDULE env var)
//   Monitor: every 4 hours (configurable via MONITOR_SCHEDULE env var)
//   Drafter: daily at 6:30 AM (checks for same-day interviews)

import cron from "node-cron";
import "dotenv/config";
import { runDailyDigest } from "./digest.js";
import { monitorJobs } from "./monitor.js";
import { draftInterviewFollowUps, draftOutreach } from "./drafter.js";

const args = process.argv.slice(2);
const jobFlag = args.find((a) => a.startsWith("--job="))?.replace("--job=", "");
const isDryRun = args.includes("--dry-run") || process.env.DRY_RUN === "true";

if (isDryRun) {
  process.env.DRY_RUN = "true";
  console.log("[Main] 🧪 DRY RUN MODE — no emails will be sent");
}

// ============================================================
// ONE-OFF COMMAND MODE
// ============================================================
if (jobFlag) {
  (async () => {
    console.log(`[Main] Running job: ${jobFlag}`);
    try {
      switch (jobFlag) {
        case "digest":
          await runDailyDigest();
          break;
        case "monitor":
          await monitorJobs();
          break;
        case "draft":
          await draftInterviewFollowUps();
          break;
        case "outreach":
          // Example: draft an outreach to Jimmy Carter at Big Tech Company
          // Customize the params below or pass them as additional args
          await draftOutreach({
            name: "Jimmy Carter",
            title: "Vice President, Recruiting",
            company: "Big Tech Company",
            context:
              "Hello, I came across this job posting at your company and would like to buy you a coffee.",
            type: "email",
          });
          break;
        default:
          console.error(`[Main] Unknown job: ${jobFlag}`);
          console.log("Available jobs: digest | monitor | draft | outreach");
          process.exit(1);
      }
    } catch (err) {
      console.error(`[Main] Job "${jobFlag}" failed:`, err);
      process.exit(1);
    }
    process.exit(0);
  })();

  // ============================================================
  // SCHEDULED PRODUCTION MODE
  // ============================================================
} else {
  console.log("[Main] 🚀 Job Search Agent starting in scheduled mode...");
  console.log(
    `[Main] Digest schedule: ${process.env.DIGEST_SCHEDULE || "0 7 * * *"}`,
  );
  console.log(
    `[Main] Monitor schedule: ${process.env.MONITOR_SCHEDULE || "0 */4 * * *"}`,
  );

  // Daily morning digest — 7:00 AM
  cron.schedule(process.env.DIGEST_SCHEDULE || "0 7 * * *", async () => {
    console.log("[Cron] Running daily digest...");
    try {
      await runDailyDigest();
    } catch (err) {
      console.error("[Cron] Digest failed:", err);
    }
  });

  // Job monitor — every 4 hours
  cron.schedule(process.env.MONITOR_SCHEDULE || "0 */4 * * *", async () => {
    console.log("[Cron] Running job monitor...");
    try {
      await monitorJobs();
    } catch (err) {
      console.error("[Cron] Monitor failed:", err);
    }
  });

  // Interview drafter — 6:30 AM daily (30 min before digest so drafts are ready)
  cron.schedule("30 6 * * *", async () => {
    console.log("[Cron] Checking for interview follow-up drafts...");
    try {
      await draftInterviewFollowUps();
    } catch (err) {
      console.error("[Cron] Drafter failed:", err);
    }
  });

  // Run digest immediately on startup so you don't have to wait until 7am to test
  if (process.env.RUN_ON_STARTUP === "true") {
    console.log("[Main] RUN_ON_STARTUP=true — running digest now...");
    runDailyDigest().catch(console.error);
  }

  console.log("[Main] ✅ All schedules active. Agent is running.");
}
