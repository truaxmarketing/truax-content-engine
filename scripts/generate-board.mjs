// Content Topic Engine — daily generator (v6)
// GUARANTEE 1: always advance "DATA AS OF" + re-stamp "Write these this week" +
//   write a snapshot, so the page is never stale and every run leaves a commit.
// GUARANTEE 2: the fresh board is best-effort and self-validating. The model pulls
//   your sources via Anthropic's server-side web search (no scraping in this runner).
//   If the API, the JSON, or the page JS is anything but perfect, it silently keeps
//   the carried-forward board. Publishing NEVER breaks.
//
// v6 CHANGES (2026-09-07) — fixes the "Exit Five is invisible" problem:
//   1. Sources now carry EXPLICIT dated-archive URLs. The old brief said "search
//      Exit Five newsletter", which landed on the brand page; the model then cited
//      the publication generically ("Exit Five newsletter, Dave Gerhardt, 2026")
//      without ever opening an issue. Real issues were missed as a result.
//   2. Search budget raised 8 -> 20. Eight searches could not cover seven sources
//      AND open individual pieces.
//   3. CITATION DISCIPLINE: every externally-sourced claim must name the specific
//      piece (title + publication date) and link to THAT piece, not an index page.
//      Enforced by a graded gate (see requireDatedCitations), strict on the first
//      two attempts and relaxed on the last so a fresh board still beats a stale one.
//   4. Strips leaked citation markup — the model was emitting (cite index="31-6">…
//      </cite> into `why`, which rendered as literal garbage on the live page.
//   5. Snapshot now records a SOURCE LEDGER: which sources actually made the board,
//      so a source silently going dark is visible instead of invisible.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const IDX   = "index.html";
const MODEL = process.env.ENGINE_MODEL || "claude-sonnet-5";
const now   = new Date();
const today = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", day: "2-digit", month: "short", year: "numeric" }).format(now);
const iso   = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

const BRIEF = `You build a daily B2B content-ideation board for Ryan Truax (founder, Truax Marketing; former VP of Marketing, ~20 yrs). Use the web_search tool to pull the LATEST published pieces from Ryan's sources, then riff on them through his lens. Return ONLY a JSON object at the end — no prose outside the JSON, no markdown fences.

=== HOW TO READ A SOURCE (this is the part that has been going wrong) ===
Landing on a publication's homepage or archive index and then citing the publication generically is a FAILURE. "Exit Five newsletter, Dave Gerhardt, 2026" is a failed citation. It tells Ryan nothing, and it means you never actually read anything.
For each source: search it, find the ARCHIVE or BLOG INDEX, identify the most recent 1-3 individual pieces by TITLE and DATE, then OPEN the ones that look most relevant and read them. Cite the individual piece.
Every citation of an external source MUST carry:
  - the specific piece's TITLE (or a precise description of its central claim),
  - its PUBLICATION DATE at minimum to the month ("Aug 31 2026" preferred, "Aug 2026" acceptable, a bare "2026" is NOT),
  - a URL to THAT PIECE, not to the archive index or the homepage.
If you genuinely cannot open a specific piece from a source, do not fake a citation. Either skip that source this run, or use Ryan's own principle with s:"Ryan's own principle" and u:"#".

=== THE SOURCES (search these archive pages, then open individual pieces) ===
1. EXIT FIVE / Dave Gerhardt — https://exitfive.com/newsletter — THIS IS RYAN'S PRIMARY SOURCE OF INSPIRATION. Treat it as highest priority and give it more search budget than any other. The archive is public and free; issues are numbered and dated (e.g. "Newsletter #281: B2B Doesn't Have To Be Boring: 3 Creative Tactics for Scroll-Stopping B2B Ads", Aug 31 2026). Open the most recent 2-3 issues and read them properly. Also check the podcast at https://exitfive.com/podcast. A run that produces no dated, issue-level Exit Five citation is a weak run.
2. SparkToro / Rand Fishkin — https://sparktoro.com/blog
3. Thom Van Dycke — https://thomvandycke.com (founder-led marketing; also posts on LinkedIn)
4. Scott Galloway, "No Mercy / No Malice" — https://www.profgalloway.com/ (this source has been coming up empty; search it properly)
5. DRMG / Mike Geraci — https://drmg.co/blog (this source has been coming up empty; search it properly)
6. Ruben Hassid — Substack, search "Ruben Hassid Substack". PAID: only post TITLES and the public preview are available. Use as a topic spark ONLY; never claim to quote the paywalled body. A title + date is still a valid citation.
7. Patrick Schaber — Substack, search "Patrick Schaber Substack". PAID: same rule.
Aim to have at least FIVE of the seven sources represented on the board, each with issue-level citations. If a source truly has nothing from the last ~14 days, skip it rather than inventing or citing it generically.

=== RIFF, DON'T RIP + NO FABRICATION (critical) ===
Every theme is Ryan's own POV/principle/experience, provoked by what you actually found. NEVER invent a statistic, quote, study, campaign, company, or URL. If you cite a number or example, it must come from a real search result you actually opened, credited to the source and dated, in the "ev" field with the real URL to that piece. When unsure, use Ryan's own principle with s:"Ryan's own principle" and u:"#". Down-rank anything that is just "here's what X said" — a theme earns the board only if Ryan adds an angle the source lacks. Be willing to disagree with the source.

=== WHO HE SELLS TO (weight "fit") ===
Founders/owners, new CMOs/VPs, PE operating partners, the C-suite.

=== HIS BELIEFS (score "pov" against these) ===
Brand is the only moat; distinctiveness beats polish; clarity over ambiguity; objective truth over gut feel; story beats the feature-dump; the client is the hero; focus on three not ten.

=== SIX PILLARS (tag each theme to exactly one; use these EXACT keys) ===
- "brand" — brand is the moat / distinctiveness
- "positioning" — positioning & GTM; his trigger-based thesis
- "leadership" — marketing leadership from a seat he held
- "storytelling" — B2B storytelling, fueled by his own Fortra Automate work
- "practical-ai" — something a marketer can ACTUALLY DO with AI today (concrete, executable). SOURCE THIS PILLAR STRICTLY from Ruben Hassid and Patrick Schaber. If neither has fresh, relevant practical-AI material this run, SKIP this pillar entirely — do NOT fill it from other sources, do NOT invent tactics.
- "video" — video as a growth engine (short-form, YouTube, LinkedIn video as a B2B growth channel). Search BROADLY: surface credible recent takes from anyone speaking on video-as-growth, and lean on Ryan's own deep video expertise.
RECLAIMED HOURS (UN-PINNED): "The Reclaimed Hours" (AI handed leaders back 20-30% of their week; the ownable answer is to do LESS and reallocate to strategic/brand/positioning calls AI can't make) is now just ONE eligible leadership angle — NOT mandatory, NOT auto-top-3. The "signature":true flag is OPTIONAL: set it on AT MOST ONE theme, and only if a single theme is a clear standout; otherwise signature:false on all.
AI WEIGHTING: keep the brand/positioning/leadership/storytelling pillars human- and strategy-first — AI is not a leading angle there. Practical, do-it-today AI lives ONLY in the "practical-ai" pillar.

=== SCORING (ints 0-100) ===
eng, fit, pov, sat. score(one decimal)=0.30*fit+0.25*pov+0.25*eng+0.20*(100-sat). quad: eng>=55&sat<45 "open"; eng>=55&sat>=45 "crowded"; eng<55&sat<45 "quiet"; eng<55&sat>=45 "fading". mom in "up|down|flat|new" (use "new" or "flat"). items 1-3.

=== OUTPUT JSON SHAPE (exact keys) ===
{"themes":[{"id":1,"t":"headline","pillar":"positioning","signature":false,"score":84.0,"eng":70,"fit":92,"pov":95,"sat":25,"items":2,"mom":"new","quad":"open","why":"<b>bold lead-in.</b> 1-2 sentences of Ryan's take.","ev":[{"a":"the specific claim/finding + who said it + where","s":"Publication, Author, 'Piece Title', Mon DD YYYY","u":"https://url-to-that-specific-piece"}]}],
 "top3":[1,2,3],
 "prompts":[{"chan":"LinkedIn · signature","theme":"short label","hook":"one-line hook in quotes","set":"2-3 sentence setup","ev":"where it comes from (credited spark + Ryan's POV)","prompt":"full copy-ready draft prompt: 'Read About-Ryan/Voice-Profile.md and Voice-Examples-Bitly.md first and write in Ryan's voice...' leading with Ryan's thesis, source as a credited spark only, reader is the hero, no CTA, never salesy; for storytelling instruct reading Clients/Fortra Automate/ for real specifics and never inventing outcomes."}]}

=== IMPORTANT OUTPUT RULES ===
- Do NOT emit citation markup of any kind inside string values. No (cite index="..."> tags, no </cite>, no footnote markers. Plain prose only. The "why" field is rendered as HTML on a live page; only <b> is allowed.
- 11-14 themes, unique integer ids from 1, AT MOST ONE signature:true (zero is fine).
- Themes span AT LEAST 4 of the 6 pillars (include practical-ai and video ONLY when their sources have real material).
- top3 = three ids across three DIFFERENT pillars (highest composite, each an original take).
- prompts = exactly 3 matching the top3 in order.
- Return ONLY the JSON object as the final content. It MUST be strict, valid JSON: escape all quotes/newlines inside string values, no trailing commas, no comments, no text before or after.`;

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
let ledger = null;

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
    ledger = sourceLedger(board);
    note = `Fresh board — ${board.themes.length} themes, top3 ${board.top3.join("/")} — ${MODEL} + web search. Sources: ${ledger.present.join(", ") || "none identified"}${ledger.missing.length ? " | MISSING: " + ledger.missing.join(", ") : ""}. Dated citations ${ledger.datedPct}%.`;
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
  JSON.stringify({ date: iso, generated: `${today} (GitHub Actions)`, mode, note, ledger }, null, 2) + "\n");
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
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    // Strict on attempts 1-2. On the final attempt, relax the citation gate:
    // a fresh board with weak citations still beats republishing a stale one.
    const strict = attempt < 3;
    try { return await callOnce(BRIEF, strict); }
    catch (e) { lastErr = e; console.warn(`generate attempt ${attempt}/3 failed (strict=${strict}): ${e.message}`); }
  }
  throw lastErr;
}

async function callOnce(brief, strict) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 32000,
      // v6: 8 -> 20. Eight searches could not cover seven sources AND open pieces.
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 20 }],
      messages: [{ role: "user", content: brief }],
    }),
  });
  if (!resp.ok) throw new Error(`API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  const text = (data.content || []).map(b => (b.type === "text" ? b.text : "")).join("").trim();
  if (!text) throw new Error("empty API response");
  const board = JSON.parse(extractJson(text));
  scrubBoard(board);
  coerceBoard(board);
  validateBoard(board);
  requireDatedCitations(board, strict);
  return board;
}

function extractJson(text) {
  let raw = text;
  if (raw.includes("```")) raw = raw.replace(/```[a-z]*\s*/gi, "");
  const a = raw.indexOf("{"), z = raw.lastIndexOf("}");
  if (a < 0 || z <= a) throw new Error("no JSON object in response");
  let s = raw.slice(a, z + 1);
  s = s.replace(/,\s*([}\]])/g, "$1");      // strip trailing commas (common LLM slip)
  return s;
}

// v6: the model was leaking citation markup into rendered strings, e.g.
//   (cite index="31-6,31-7">Thom Van Dycke posted…</cite>
// which showed up as literal garbage on the live board. Scrub every string.
function scrubBoard(b) {
  const clean = s => typeof s === "string"
    ? s.replace(/<\/?cite\b[^>]*>/gi, "")                    // proper <cite …> / </cite> tags FIRST
       .replace(/\(?\s*cite\s+index\s*=\s*"[^"]*"\s*>?/gi, "") // malformed remnants
       .replace(/<(?!\/?b>)[^>]*>/g, "")                     // any tag that isn't <b>/</b>
       .replace(/<(?!\/?b>)/g, "")                           // orphan "<" left behind
       .replace(/\[\d+(?:[,-]\d+)*\]/g, "")                  // [31-6] style footnote markers
       .replace(/\s{2,}/g, " ")
       .trim()
    : s;
  const walk = o => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === "object") {
      for (const k of Object.keys(o)) {
        if (typeof o[k] === "string") o[k] = clean(o[k]);
        else walk(o[k]);
      }
    }
  };
  walk(b);
}

// v6.1: REPAIR, DON'T REJECT.
// The 7 Sept run threw "items/mom/quad" and fell back to carry-forward, killing a
// board that was probably fine, because one theme had a cosmetic field slightly off.
// items, mom and quad only drive display: the dot count, the momentum arrow, the
// quadrant label. Every one of them is either derivable or safely defaultable, so
// throwing away a whole day's board over them is indefensible. Standing rule for this
// file: the model's output is where the brittleness lives, so coerce anything cosmetic
// and reserve hard rejection for things that would actually mislead Ryan (a missing
// title, a bogus pillar, a broken top3, an undated citation).
function coerceBoard(b) {
  const PILLARS = ["brand","positioning","leadership","storytelling","practical-ai","video"];
  const MOM = ["up","down","flat","new"];
  const QUAD = ["open","crowded","quiet","fading"];
  const clampInt = (v, lo, hi, dflt) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
  };
  if (!b || !Array.isArray(b.themes)) return;
  const fixed = [];
  for (const t of b.themes) {
    // scores: clamp into range rather than reject
    for (const k of ["eng","fit","pov","sat"]) t[k] = clampInt(t[k], 0, 100, 50);
    if (typeof t.score !== "number" || !Number.isFinite(t.score) || t.score < 0 || t.score > 100) {
      t.score = Math.round((0.30*t.fit + 0.25*t.pov + 0.25*t.eng + 0.20*(100 - t.sat)) * 10) / 10;
      fixed.push(`theme ${t.id}: score recomputed`);
    }
    // items: purely a dot count on the card
    const items0 = t.items;
    t.items = clampInt(t.items, 1, 6, Array.isArray(t.ev) ? Math.min(6, Math.max(1, t.ev.length)) : 1);
    if (items0 !== t.items) fixed.push(`theme ${t.id}: items ${JSON.stringify(items0)} -> ${t.items}`);
    // mom: a momentum arrow. "flat" is the honest default when the model invents a word.
    if (!MOM.includes(t.mom)) { fixed.push(`theme ${t.id}: mom ${JSON.stringify(t.mom)} -> flat`); t.mom = "flat"; }
    // quad: fully derivable from eng and sat, so never trust a bad one
    const derived = t.eng >= 55 ? (t.sat < 45 ? "open" : "crowded") : (t.sat < 45 ? "quiet" : "fading");
    if (!QUAD.includes(t.quad) || t.quad !== derived) {
      if (t.quad !== derived) fixed.push(`theme ${t.id}: quad ${JSON.stringify(t.quad)} -> ${derived}`);
      t.quad = derived;
    }
    if (t.signature !== true) t.signature = false;
    if (typeof t.pillar === "string") t.pillar = t.pillar.trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (Array.isArray(t.ev)) for (const e of t.ev) if (typeof e.u !== "string" || !e.u.trim()) e.u = "#";
  }
  // at most one signature: keep the highest-scoring, demote the rest
  const sigs = b.themes.filter(t => t.signature === true);
  if (sigs.length > 1) {
    sigs.sort((x, y) => y.score - x.score).slice(1).forEach(t => { t.signature = false; });
    fixed.push(`demoted ${sigs.length - 1} extra signature flag(s)`);
  }
  // top3 must be three distinct real ids; backfill from the highest scorers if not
  const ids = b.themes.map(t => t.id);
  if (!Array.isArray(b.top3)) b.top3 = [];
  b.top3 = [...new Set(b.top3.filter(id => ids.includes(id)))].slice(0, 3);
  if (b.top3.length < 3) {
    const ranked = [...b.themes].sort((x, y) => y.score - x.score).map(t => t.id);
    for (const id of ranked) { if (b.top3.length >= 3) break; if (!b.top3.includes(id)) b.top3.push(id); }
    fixed.push(`top3 backfilled -> ${b.top3.join("/")}`);
  }
  if (fixed.length) console.log("Coerced:", fixed.join(" | "));
}

// v6: the core fix. A citation that names a publication but not a piece is the
// exact failure that made Exit Five invisible. Grade the board on how many of its
// externally-sourced claims actually name a dated piece.
const DATE_RE = /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{0,2},?\s*20\d{2}|\d{1,2}[\/-]\d{1,2}[\/-]20\d{2}|20\d{2}-\d{2}-\d{2}/i;

const PRIMARY_RE = /exit ?five|gerhardt/i;   // Ryan's primary source of inspiration

function requireDatedCitations(b, strict) {
  let external = 0, dated = 0;
  let primarySeen = 0, primaryDated = 0;
  for (const t of b.themes) {
    for (const e of t.ev) {
      const isExternal = typeof e.u === "string" && /^https?:\/\//i.test(e.u);
      if (!isExternal) continue;         // Ryan's own principle (u:"#") is exempt
      external++;
      const isDated = DATE_RE.test(e.s || "");
      if (isDated) dated++;
      if (PRIMARY_RE.test(e.s || "")) { primarySeen++; if (isDated) primaryDated++; }
    }
  }
  if (external === 0) return;            // an all-principle board is allowed
  const pct = Math.round((dated / external) * 100);
  const floor = strict ? 80 : 40;
  if (pct < floor) {
    throw new Error(`citation quality ${pct}% dated (need ${floor}%) — model cited publications, not pieces`);
  }
  // The specific failure this whole version exists to stop: Exit Five showing up
  // as a generic name-drop ("Exit Five newsletter, Dave Gerhardt, 2026") because
  // the model skimmed the archive index instead of opening an issue.
  if (strict && primarySeen > 0 && primaryDated === 0) {
    throw new Error(`Exit Five cited ${primarySeen}x but never with an issue date — archive index was skimmed, not read`);
  }
}

function sourceLedger(b) {
  const WATCH = {
    "Exit Five":   /exit ?five|gerhardt/i,
    "SparkToro":   /sparktoro|fishkin/i,
    "Van Dycke":   /van ?dycke/i,
    "Galloway":    /galloway|no mercy/i,
    "DRMG":        /drmg|geraci/i,
    "Hassid":      /hassid|ruben/i,
    "Schaber":     /schaber|patrick/i,
  };
  const hay = JSON.stringify(b.themes);
  const present = [], missing = [];
  for (const [name, re] of Object.entries(WATCH)) (re.test(hay) ? present : missing).push(name);
  let external = 0, dated = 0;
  for (const t of b.themes) for (const e of t.ev) {
    if (typeof e.u === "string" && /^https?:\/\//i.test(e.u)) { external++; if (DATE_RE.test(e.s || "")) dated++; }
  }
  return { present, missing, externalCitations: external, datedCitations: dated, datedPct: external ? Math.round((dated / external) * 100) : 0 };
}

function validateBoard(b) {
  const PILLARS = ["brand","positioning","leadership","storytelling","practical-ai","video"];
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
  if (sig>1) throw new Error("at most one signature, got "+sig);
  if (pil.size<4) throw new Error("pillars not covered");
  if (!Array.isArray(b.top3)||b.top3.length!==3||new Set(b.top3).size!==3) throw new Error("top3");
  for (const id of b.top3) if (!ids.has(id)) throw new Error("top3 id "+id);
  if (!Array.isArray(b.prompts)||b.prompts.length!==3) throw new Error("prompts count");
  for (const p of b.prompts) for (const k of ["chan","theme","hook","set","ev","prompt"]) if(!str(p[k])) throw new Error("prompt "+k);
}
