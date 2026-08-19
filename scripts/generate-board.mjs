// Content Topic Engine — daily generator (v3)
// GUARANTEE 1: always advance "DATA AS OF" + re-stamp "Write these this week" +
//   write a snapshot, so the page is never stale and every run leaves a commit.
// GUARANTEE 2: the fresh board is best-effort and self-validating. The model pulls
//   your sources via Anthropic's server-side web search (no scraping in this runner).
//   If the API, the JSON, or the page JS is anything but perfect, it silently keeps
//   the carried-forward board. Publishing NEVER breaks.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const IDX   = "index.html";
const MODEL = process.env.ENGINE_MODEL || "claude-sonnet-5";
const now   = new Date();
const today = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", day: "2-digit", month: "short", year: "numeric" }).format(now);
const iso   = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

let html = readFileSync(IDX, "utf8");

// (1) date flip — always
const markerRe = /(<b>DATA AS OF<\/b><span>)[^<]*(<\/span>)/;
if (!markerRe.test(html)) { console.error("ERROR: 'DATA AS OF' marker not found — aborting."); process.exit(1); }
html = html.replace(markerRe, `$1${today}$2`);

// (1b) re-stamp the "Write these this week" heading with today's date — always
html = html.replace(/<h2>Write these this week[\s\S]*?<\/h2>/,
  `<h2>Write these this week <span style="font-size:13px;font-weight:500;color:#8a8a9a"> · generated ${today} from your sources</span></h2>`);

let mode = "carry-forward";
let note = "Board carried forward; date advanced.";

// (2) fresh board via web-search — guarded, all-or-nothing
if (process.env.ANTHROPIC_API_KEY) {
  try {
    const board = await generateBoard();
    let h2 = html;
    h2 = replaceArrayLiteral(h2, "const THEMES = ",  JSON.stringify(board.themes));
    h2 = replaceArrayLiteral(h2, "const TOP3 = ",    JSON.stringify(board.top3));
    h2 = replaceArrayLiteral(h2, "const PROMPTS = ", JSON.stringify(board.prompts));
    validatePageJs(h2);
    html = h2;
    mode = "web-search-refresh";
    note = `Fresh board — ${board.themes.length} themes, top3 ${board.top3.join("/")} — ${MODEL} + web search.`;
    console.log("Refresh applied:", note);
  } catch (e) {
    note = `Carried forward (refresh skipped: ${e.message}); date advanced.`;
    console.warn("Refresh skipped, publishing carry-forward. Reason:", e.message);
  }
} else {
  console.log("No ANTHROPIC_API_KEY — carry-forward with today's date.");
}

writeFileSync(IDX, html);
mkdirSync("snapshots", { recursive: true });
writeFileSync(`snapshots/snapshot-${iso}.json`,
  JSON.stringify({ date: iso, generated: `${today} (GitHub Actions)`, mode, note }, null, 2) + "\n");
console.log("Done:", today, "|", mode);

// ============================ helpers ============================
function replaceArrayLiteral(src, prefix, jsonText) {
  const p = src.indexOf(prefix);
  if (p < 0) throw new Error(`block not found: ${prefix.trim()}`);
  let b = p + prefix.length;
  while (b < src.length && src[b] !== "[") b++;
  if (src[b] !== "[") throw new Error(`no array after ${prefix.trim()}`);
  let depth = 0, inStr = false, q = null, i = b;
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
function validatePageJs(h) {
  const blocks = [...h.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  if (!blocks.length) throw new Error("no <script> blocks after injection");
  new Function(blocks.join("\n;\n"));
}
async function generateBoard() {
  const brief = `You build a daily B2B content-ideation board for Ryan Truax (founder, Truax Marketing; former VP of Marketing, ~20 yrs). Use the web_search tool to pull the LATEST published pieces from Ryan's sources, then riff on them through his lens. Return ONLY a JSON object at the end — no prose outside the JSON, no markdown fences.

SEARCH THESE SOURCES (find each one's most recent 1-3 posts/issues from the last ~10 days):
- Exit Five / Dave Gerhardt (exitfive.com newsletter & podcast)
- Thom Van Dycke (thomvandycke.com blog — founder-led marketing)
- SparkToro / Rand Fishkin (sparktoro.com/blog)
- Scott Galloway "No Mercy / No Malice" (profgalloway.com / profgmedia.com)
- DRMG / Mike Geraci (drmg.co/blog)
- Ruben Hassid (Substack — search "Ruben Hassid Substack"). PAID newsletter: only his post TITLES and the public preview/teaser are available. Use them as a topic spark ONLY; never claim to quote the paywalled body.
- Patrick Schaber (Substack — search "Patrick Schaber Substack"). PAID: same rule — title/preview as a spark only, never quote the paid body.
Do a few targeted searches (e.g. "Exit Five newsletter", "SparkToro blog latest", "No Mercy No Malice latest", "Thom Van Dycke blog", "DRMG Mike Geraci blog", "Ruben Hassid Substack", "Patrick Schaber Substack"). If a source can't be found this run, skip it — do NOT invent it.

RIFF, DON'T RIP + NO FABRICATION (critical): every theme is Ryan's own POV/principle/experience, provoked by what you actually found. NEVER invent a statistic, quote, study, campaign, company, or URL. If you cite a number or example, it must come from a real search result, credited to the source and dated, in the "ev" field with the real URL. When unsure, use Ryan's own principle with u:"#". Down-rank anything that is just "here's what X said" — a theme earns the board only if Ryan adds an angle the source lacks.

WHO HE SELLS TO (weight "fit"): founders/owners, new CMOs/VPs, PE operating partners, the C-suite.
HIS BELIEFS (score "pov" against these): brand is the only moat; distinctiveness beats polish; clarity over ambiguity; objective truth over gut feel; story beats the feature-dump; the client is the hero; focus on three not ten.
FOUR PILLARS (exact keys): "brand", "positioning", "leadership", "storytelling" (storytelling is fueled by his own Fortra Automate work).
SIGNATURE (keep sticky — always include one leadership theme with signature:true): "The Reclaimed Hours" — AI handed leaders back 20-30% of their week; the ownable answer is to do LESS and reallocate to the strategic/brand/positioning calls AI can't make.
AI WEIGHTING: apart from Reclaimed Hours, AI must not be a leading angle.

SCORING (ints 0-100): eng, fit, pov, sat. score(one decimal)=0.30*fit+0.25*pov+0.25*eng+0.20*(100-sat). quad: eng>=55&sat<45 "open"; eng>=55&sat>=45 "crowded"; eng<55&sat<45 "quiet"; eng<55&sat>=45 "fading". mom in "up|down|flat|new" (use "new" or "flat"). items 1-3.

OUTPUT JSON SHAPE (exact keys):
{"themes":[{"id":1,"t":"headline","pillar":"leadership","signature":true,"score":84.0,"eng":70,"fit":92,"pov":95,"sat":25,"items":2,"mom":"new","quad":"open","why":"<b>bold lead-in.</b> 1-2 sentences of Ryan's take.","ev":[{"a":"what was found + who said it + date, OR Ryan's own principle","s":"Source, date — spark only","u":"https://real-url-or-#"}]}],
 "top3":[1,2,3],
 "prompts":[{"chan":"LinkedIn · signature","theme":"short label","hook":"one-line hook in quotes","set":"2-3 sentence setup","ev":"where it comes from (credited spark + Ryan's POV)","prompt":"full copy-ready draft prompt: 'Use the linkedin-post skill. Read About-Ryan/Voice-Profile.md first and write in Ryan's voice...' leading with Ryan's thesis, source as a credited spark only, reader is the hero, no CTA, never salesy; for storytelling instruct reading Clients/Fortra Automate/ for real specifics and never inventing outcomes."}]}
RULES: 11-13 themes, unique integer ids from 1, exactly one signature:true, all four pillars represented, top3 = three ids that exist across three different pillars (highest composite, each an original take), prompts = exactly 3 matching the top3 in order. Return ONLY the JSON object as the final content.`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 20000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 8 }],
      messages: [{ role: "user", content: brief }],
    }),
  });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  const text = (data.content || []).map(b => (b.type === "text" ? b.text : "")).join("").trim();
  if (!text) throw new Error("empty API response");

  let raw = text;
  if (raw.includes("```")) raw = raw.replace(/```[a-z]*\s*/gi, "");
  const a = raw.indexOf("{"), z = raw.lastIndexOf("}");
  if (a < 0 || z <= a) throw new Error("no JSON object in response");
  const board = JSON.parse(raw.slice(a, z + 1));
  validateBoard(board);
  return board;
}
function validateBoard(b) {
  const PILLARS = ["brand","positioning","leadership","storytelling"];
  const QUAD = ["open","crowded","quiet","fading"];
  const MOM = ["up","down","flat","new"];
  const isInt = (n,lo,hi) => Number.isInteger(n) && n>=lo && n<=hi;
  const str = s => typeof s === "string" && s.trim().length>0;
  if (!b || !Array.isArray(b.themes) || b.themes.length<8 || b.themes.length>16) throw new Error("themes count");
  const ids = new Set(), pil = new Set(); let sig = 0;
  for (const t of b.themes) {
    if (!isInt(t.id,1,999) || ids.has(t.id)) throw new Error("theme id");
    ids.add(t.id);
    if (!str(t.t) || !PILLARS.includes(t.pillar)) throw new Error("theme title/pillar");
    pil.add(t.pillar);
    if (typeof t.score!=="number"||t.score<0||t.score>100) throw new Error("score");
    for (const k of ["eng","fit","pov","sat"]) if (!isInt(t[k],0,100)) throw new Error(k);
    if (!isInt(t.items,1,6) || !MOM.includes(t.mom) || !QUAD.includes(t.quad)) throw new Error("items/mom/quad");
    if (!str(t.why) || !Array.isArray(t.ev) || !t.ev.length) throw new Error("why/ev");
    for (const e of t.ev){ if(!str(e.a)||!str(e.s)) throw new Error("ev item"); if(typeof e.u!=="string") e.u="#"; }
    if (t.signature===true) sig++;
  }
  if (sig!==1) throw new Error("need exactly one signature, got "+sig);
  if (pil.size<4) throw new Error("pillars not covered");
  if (!Array.isArray(b.top3)||b.top3.length!==3||new Set(b.top3).size!==3) throw new Error("top3");
  for (const id of b.top3) if (!ids.has(id)) throw new Error("top3 id "+id);
  if (!Array.isArray(b.prompts)||b.prompts.length!==3) throw new Error("prompts count");
  for (const p of b.prompts) for (const k of ["chan","theme","hook","set","ev","prompt"]) if(!str(p[k])) throw new Error("prompt "+k);
}
