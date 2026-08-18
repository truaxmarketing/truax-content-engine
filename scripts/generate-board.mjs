import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const IDX = "index.html";
const now = new Date();
const today = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago",
  day: "2-digit", month: "short", year: "numeric" }).format(now);
const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago",
  year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

let html = readFileSync(IDX, "utf8");

const markerRe = /(<b>DATA AS OF<\/b><span>)[^<]*(<\/span>)/;
if (!markerRe.test(html)) {
  console.error("ERROR: 'DATA AS OF' marker not found in index.html — aborting.");
  process.exit(1);
}
html = html.replace(markerRe, `$1${today}$2`);

if (process.env.ANTHROPIC_API_KEY) {
  try { /* v2 fresh-themes hook — no-op until wired + tested */ }
  catch (e) { console.warn("AI enrichment skipped (publish continues):", e.message); }
}

writeFileSync(IDX, html);

mkdirSync("snapshots", { recursive: true });
writeFileSync(`snapshots/snapshot-${iso}.json`, JSON.stringify({
  date: iso,
  generated: `${today} (GitHub Actions)`,
  note: "Published by GitHub Actions. Date advanced; board carried forward. Fresh AI themes = staged v2."
}, null, 2) + "\n");

console.log("Board dated", today, "- ready to commit.");
