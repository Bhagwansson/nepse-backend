const cron = require("node-cron");
const shell = require("shelljs");

console.log("⏰ Scheduler initialized. Waiting for 3:05 PM...");

// --- TASK 1: THE SCRAPER (3:05 PM) ---
// Runs Sunday (0) to Thursday (4)
cron.schedule("5 15 * * 0-4", () => {
  console.log("🚀 [3:05 PM] Market Closed. Starting Scraper...");

  // Run the scraper script
  const result = shell.exec("node scripts/seed_puppeteer.js", { async: true });
});

// --- TASK 2: THE ANALYZER (3:15 PM) ---
// Runs 10 minutes later
cron.schedule("15 15 * * 0-4", () => {
  console.log("🧠 [3:15 PM] Starting Daily Analysis...");

  shell.exec("node scripts/daily_crunch.js", (code, stdout, stderr) => {
    if (code === 0) {
      console.log("🎉 Daily Analysis Complete. Dashboard updated.");
    } else {
      console.error("❌ Analysis failed:", stderr);
    }
  });
});
