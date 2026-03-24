// src/index.js
// Runs a single job via CLI flag. Scheduling is handled by GitHub Actions.
//
// Usage:
//   node src/index.js --job=digest     → run daily digest
//   node src/index.js --job=monitor    → run job monitor
//   node src/index.js --job=draft      → run interview drafter
//   node src/index.js --job=outreach   → draft a cold outreach email
//   node src/index.js --dry-run        → add to any job to skip sending emails

import "dotenv/config";
import { runDailyDigest } from "./digest.js";
import { monitorJobs } from "./monitor.js";
import { draftInterviewFollowUps, draftOutreach } from "./drafter.js";

const args = process.argv.slice(2);
const jobFlag = args.find((a) => a.startsWith("--job="))?.replace("--job=", "");
const isDryRun = args.includes("--dry-run") || process.env.DRY_RUN === "true";

if (!jobFlag) {
  console.error("[Main] No --job flag provided.");
  console.log("Usage: node src/index.js --job=<digest|monitor|draft|outreach> [--dry-run]");
  process.exit(1);
}

if (isDryRun) {
  process.env.DRY_RUN = "true";
  console.log("[Main] 🧪 DRY RUN MODE — no emails will be sent");
}

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
        // Example: draft an outreach to a specific contact
        // Customize the params below or pass them as additional args
        await draftOutreach({
          name: "[CONTACT NAME]",
          title: "[CONTACT TITLE]",
          company: "[COMPANY]",
          context: "[HOW YOU KNOW THEM / WHY YOU'RE REACHING OUT]",
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
