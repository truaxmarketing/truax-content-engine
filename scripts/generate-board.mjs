// Content Topic Engine — daily generator (v2)
// GUARANTEE 1: always advance the "DATA AS OF" date + write a snapshot, so the
//   site is never stale and every run leaves a visible commit.
// GUARANTEE 2: AI refresh is best-effort and self-validating. If the API call,
//   the JSON, or the resulting page JS is anything but perfect, it silently
//   falls back to the carried-forward board. Publishing NEVER breaks.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const IDX   = "index.html";
const MODEL = process.env.ENGINE_MODEL || "claude-sonnet-5";
const now   = new Date();
const today = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", day: "2-digit", month: "short", year: "numeric" }).format(now);
const iso   = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

let html = readFileSync(IDX, "utf8");

// ---- (1) date flip: always ----
const markerRe = /(<b>DATA AS OF<\/b><span>)[^<]*(<\/span>)/;
if (!markerRe.test(html)) { console.error("ERROR: 'DATA AS OF' marker not found — aborting."); process.exit(1); }
html = html.replace(markerRe, `$1${today}$2`);

let mode = "carry-forward";
let note = "Board carried forward; date advanced.";

// ---- (2) AI refresh: guarded, all-or-nothing ----
if (process.env.ANTHROPIC_API_KEY) {
  try {
    const board = await generateBoard();
    let h2 = html;
    h2 = replaceArrayLiteral(h2, "const THEMES = ",  JSON.stringify(board.themes));
    h2 = replaceArrayLiteral(h2, "const TOP3 = ",    JSON.stringify(board.top3));
    h2 = replaceArrayLiteral(h2, "const PROMPTS = ", JSON.stringify(board.prompts));
    validatePageJs(h2);                       // throws if the page's <script> won't parse
    html = h2;
    mode = "ai-refresh";
    note = `Fresh AI board — ${board.themes.length} themes, top3 ${board.top3.join("/")} — via ${MODEL}.`;
    console.log("AI refresh applied:", note);
  } catch (e) {
    note = `Carried forward (AI refresh skipped: ${e.message}); date advanced.`;
    console.warn("AI refresh skipped, publishing carry-forward instead. Reason:", e.message);
  }
} else {
  console.log("No ANTHROPIC_API_KEY set — publishing carry-forward with today's date.");
}

writeFileSync(IDX, html);
mkdirSync("snapshots", { recursive: true });
writeFileSync(`snapshots/snapshot-${iso}.json`,
  JSON.stringify({ date: iso, generated: `${today} (GitHub Actions)`, mode, note }, null, 2) + "\n");
console.log("Done:", today, "|", mode);

// ============================ helpers ============================

// Replace a `const X = [ ... ]` array literal, scanning brackets with full
// string/escape awareness so nested ] or ]; inside strings can't fool it.
function replaceArrayLiteral(src, prefix, jsonText) {
  const p = src.indexOf(prefix);
  if (p < 0) throw new Error(`block not found: ${prefix.trim()}`);
  let b = p + prefix.length;
  while (b < src.length && src[b] !== "[") b++;
  if (src[b] !== "[") throw new Error(`no array after ${prefix.trim()}`);
  let depth = 0, inStr = false, q = null;
  let i = b;
  for (; i < src.length; i++) {
    const c = src[i];
    if (inStr) { if (c === "\\") { i++; continue; } if (c === q) inStr = false; continue; }
    if (c === '"' || c === "'" || c === "`") { inStr = true; q = c; continue; }
    if (c === "[") depth++;
    else if (c === "]") { depth--; if (depth === 0) break; }
  }
  if (depth !== 0) throw new Error(`unterminated array for ${prefix.trim()}`);
  return src.slice(0, b) + jsonText + src.slice(i + 1);
}

// Compile every inline <script> (parse only) to guarantee the page still runs.
function validatePageJs(h) {
  const blocks = [...h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (!blocks.length) throw new Error("no <script> blocks after injection");
  new Function(blocks.join("\n;\n"));   // throws on any syntax error
}

async function generateBoard() {
  const brief = `You generate a daily B2B content-ideation board for Ryan Truax (founder, Truax Marketing; former VP of Marketing, ~20 yrs). Return ONLY a JSON object, no prose, no markdown fences.

WHO HE SELLS TO (weight "fit" toward them): founders/owners, new CMOs/VPs, PE operating partners, the C-suite.
HIS BELIEFS (score "pov" against these): brand is the only moat; distinctiveness beats polish; clarity over ambiguity; objective truth over gut feel; story beats the feature-dump; the client is the hero; focus on three things not ten.
FOUR PILLARS (each theme tagged to exactly one; use these exact keys): "brand" (brand is the moat / distinctiveness), "positioning" (positioning & GTM; his trigger-based thesis), "leadership" (marketing leadership from a seat he held), "storytelling" (B2B storytelling, fueled by his own Fortra Automate work).
SIGNATURE ANGLE (leadership, may headline, set signature:true on exactly one theme): "The Reclaimed Hours" — AI handed leaders back 20-30% of their week; the ownable answer is to do LESS and reallocate to the strategic/brand/positioning calls AI can't make.
AI WEIGHTING: apart from Reclaimed Hours, AI must NOT be a leading angle.
RIFF DON'T RIP + NO FABRICATION (critical): every theme is Ryan's own POV/principle/experience. You do NOT have live sources today, so NEVER invent statistics, quotes, studies, company names, campaigns, or URLs. Every "ev" item must be Ryan's own principle/POV/his own Fortra Automate work, phrased generically, with u set to "#". Do not attribute anything to a named outside person or outlet.

SCORING (integers 0-100 unless noted): eng (engagement estimate), fit (buyer-weighted), pov (vs beliefs), sat (saturation estimate). score (one decimal) = 0.30*fit + 0.25*pov + 0.25*eng + 0.20*(100-sat). quad by eng>=55 & sat<45 => "open"; eng>=55 & sat>=45 => "crowded"; eng<55 & sat<45 => "quiet"; eng<55 & sat>=45 => "fading". mom is one of "up","down","flat","new" (use "flat" or "new"). items = 1-3.

OUTPUT JSON SHAPE (exact keys):
{
 "themes":[{"id":1,"t":"headline","pillar":"leadership","signature":true,"score":83.0,"eng":65,"fit":90,"pov":95,"sat":22,"items":3,"mom":"new","quad":"open","why":"<b>one bold lead-in.</b> 1-2 sentences of Ryan's take.","ev":[{"a":"Ryan's principle, phrased generically","s":"Truax Marketing · your POV","u":"#"}]}],
 "top3":[1,2,3],
 "prompts":[{"chan":"LinkedIn · signature","theme":"short label","hook":"a one-line hook in quotes","set":"2-3 sentence setup","ev":"where it comes from (Ryan's own POV; no invented sources)","prompt":"a full copy-ready draft prompt: 'Use the linkedin-post skill. Read About-Ryan/Voice-Profile.md first and write in Ryan's voice...' leading with Ryan's thesis, reader is the hero, no CTA, never salesy; for storytelling instruct reading Clients/Fortra Automate/ for real specifics and never inventing outcomes."}]
}
RULES: produce 11-13 themes, unique integer ids starting at 1, exactly one signature:true (a leadership Reclaimed Hours theme), pillars spread across all four, top3 = three ids that exist and span three different pillars (highest composite, an original take each), prompts = exactly 3 matching the top3 themes in order. Return ONLY the JSON object.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 16000, messages: [{ role: "user", content: brief }] }),
  });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  const text = (data.content || []).map(b => b.text || "").join("").trim();
  if (!text) throw new Error("empty API response");

  let raw = text;
  if (raw.startsWith("```")) raw = raw.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "");
  const a = raw.indexOf("{"), z = raw.lastIndexOf("}");
  if (a < 0 || z <= a) throw new Error("no JSON object in response");
  const board = JSON.parse(raw.slice(a, z + 1));

  validateBoard(board);
  return board;
}

function validateBoard(b) {
  const PILLARS = ["brand", "positioning", "leadership", "storytelling"];
  const QUAD = ["open", "crowded", "quiet", "fading"];
  const MOM = ["up", "down", "flat", "new"];
  const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
  const str = s => typeof s === "string" && s.trim().length > 0;

  if (!b || !Array.isArray(b.themes) || b.themes.length < 8 || b.themes.length > 16)
    throw new Error("themes count out of range");
  const ids = new Set(), pillarsSeen = new Set();
  let sig = 0;
  for (const t of b.themes) {
    if (!isInt(t.id, 1, 999)) throw new Error("bad theme id");
    if (ids.has(t.id)) throw new Error("duplicate theme id " + t.id);
    ids.add(t.id);
    if (!str(t.t)) throw new Error("theme missing title");
    if (!PILLARS.includes(t.pillar)) throw new Error("bad pillar " + t.pillar);
    pillarsSeen.add(t.pillar);
    if (typeof t.score !== "number" || t.score < 0 || t.score > 100) throw new Error("bad score");
    for (const k of ["eng", "fit", "pov", "sat"]) if (!isInt(t[k], 0, 100)) throw new Error("bad " + k);
    if (!isInt(t.items, 1, 6)) throw new Error("bad items");
    if (!MOM.includes(t.mom)) throw new Error("bad mom");
    if (!QUAD.includes(t.quad)) throw new Error("bad quad");
    if (!str(t.why)) throw new Error("theme missing why");
    if (!Array.isArray(t.ev) || t.ev.length < 1) throw new Error("theme missing ev");
    for (const e of t.ev) { if (!str(e.a) || !str(e.s)) throw new Error("bad ev item"); if (typeof e.u !== "string") e.u = "#"; }
    if (t.signature === true) sig++;
  }
  if (sig !== 1) throw new Error("need exactly one signature theme, got " + sig);
  if (pillarsSeen.size < 4) throw new Error("pillars not fully covered");
  if (!Array.isArray(b.top3) || b.top3.length !== 3) throw new Error("top3 must have 3 ids");
  for (const id of b.top3) if (!ids.has(id)) throw new Error("top3 id " + id + " not in themes");
  if (new Set(b.top3).size !== 3) throw new Error("top3 ids not unique");
  if (!Array.isArray(b.prompts) || b.prompts.length !== 3) throw new Error("need exactly 3 prompts");
  for (const p of b.prompts) for (const k of ["chan", "theme", "hook", "set", "ev", "prompt"])
    if (!str(p[k])) throw new Error("prompt missing " + k);
}
