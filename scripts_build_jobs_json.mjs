import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const xlsxPath = path.join(__dirname, 'data.xlsx');
const outPath = path.join(__dirname, 'jobs.json');

if (!fs.existsSync(xlsxPath)) {
  console.error(`Error: Could not find ${xlsxPath}`);
  process.exit(1);
}

const wb = XLSX.readFile(xlsxPath, { cellDates: true });

const all = [];
const seen = new Set();
const unknownLocations = new Set();

const CANON_LEVELS = [
  'Open to all levels',
  'Undergraduate',
  'Post-Diploma',
  'Polytechnic',
  'Post-A-level',
];

function splitMulti(s) {
  return (s || '')
    .toString()
    .split(/[;,]/g)
    .map(x => x.trim())
    .filter(Boolean);
}

function normLevelToken(t) {
  const x = (t || '').toString().trim().toLowerCase();
  if (!x) return null;

  if (x.includes('open to all')) return 'Open to all levels';
  if (x.includes('undergrad')) return 'Undergraduate';
  if (x.includes('post-diploma') || x.includes('post diploma')) return 'Post-Diploma';
  if (x.includes('polytechnic')) return 'Polytechnic';
  if (x.includes('post-a-level') || x.includes('post a-level') || x.includes('post a level')) return 'Post-A-level';

  // fallback titlecase-ish
  return t;
}

function levelTags(levelStr) {
  const raw = splitMulti(levelStr);
  const tags = new Set();
  for (const tok of raw) {
    const n = normLevelToken(tok);
    if (n) tags.add(n);
  }

  // ensure canonical order
  const out = [];
  for (const c of CANON_LEVELS) if (tags.has(c)) out.push(c);
  // add anything unexpected last
  for (const t of tags) if (!CANON_LEVELS.includes(t)) out.push(t);
  return out;
}

function durationTags(periodStr) {
  const raw = splitMulti(periodStr);
  const tags = new Set();
  for (const tok of raw) {
    const t = tok.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    // normalise "3 months" etc
    const m = t.match(/^(\d+)\s*months?$/i);
    if (m) tags.add(`${m[1]} months`);
    else tags.add(t);
  }
  // keep in numeric-ish order (include 9 months in case it appears later)
  const order = ['3 months','6 months','9 months','12 months'];
  const out = [];
  for (const o of order) if (tags.has(o)) out.push(o);
  for (const t of tags) if (!order.includes(t)) out.push(t);
  return out;
}

// Location mapping (curated by Jing). Matching is done by `includes` rules (NOT comma splitting).
// Rules can intentionally match multiple times (e.g., "Home Base" + "MapleTree" + "Punggol") to produce multi-location tags.
const LOCATION_RULES = [
  { includes: 'Agency Site', mapping: 'Agency Site' },
  { includes: 'Home Base', mapping: 'Home Base' },
  { includes: 'MapleTree', mapping: 'Mapletree Business City' },

  { includes: 'MOE Buona Vista', mapping: 'MOE (Buona Vista)' },
  { includes: 'MOE HQ (Balestier)', mapping: 'MOE HQ (Balestier)' },
  { includes: 'MOE Headquarters', mapping: 'MOE HQ (Balestier)' },
  { includes: 'S329927', mapping: 'MOE1 (Balestier)' },
  { includes: 'Non-Headquarters MOE1', mapping: 'MOE1 (Balestier)' },
  { includes: 'Non-HQ MOE1', mapping: 'MOE1 (Balestier)' },
  { includes: 'MOE1', mapping: 'MOE1 (Balestier)' },

  { includes: 'S059764', mapping: 'MOM1 (Havelock)' },
  { includes: 'Non-Headquarters MOM 1', mapping: 'MOM1 (Havelock)' },

  { includes: 'S339946', mapping: 'MOM2 (Bendemeer)' },
  { includes: 'Non-Headquarter Service Centre MOM 2', mapping: 'MOM2 (Bendemeer)' },

  { includes: 'MSF at Westgate', mapping: 'MSF (Westgate)' },
  { includes: 'Westgate', mapping: 'MSF (Westgate)' },

  { includes: 'MTI Treasury', mapping: 'MTI Treasury' },
  { includes: '179434', mapping: 'MTI Treasury' },
  { includes: 'Treasury', mapping: 'MTI Treasury' },

  { includes: '170 Ghim Moh Road', mapping: 'NCSS (Ghim Moh Road)' },
  { includes: 'National Council of Social Service', mapping: 'NCSS (Ghim Moh Road)' },
  { includes: 'S279621', mapping: 'NCSS (Ghim Moh Road)' },
  { includes: 'Ulu Pandan Community Building', mapping: 'NCSS (Ghim Moh Road)' },

  { includes: 'Others', mapping: 'Others' },

  { includes: 'S408533', mapping: 'PLQ2' },
  { includes: 'PLC2', mapping: 'PLQ2' },
  { includes: 'Paya Lebar Quarter', mapping: 'PLQ2' },

  { includes: 'Punggol Digital District', mapping: 'Punggol Digital District' },

  { includes: 'S339626', mapping: 'SEAB (Geylang Bahru)' },
  { includes: 'Non-Headquarters SEAB', mapping: 'SEAB (Geylang Bahru)' },
];

function locationTags(locStr) {
  const raw = (locStr || '').toString().trim();
  if (!raw) return [];

  const rawLower = raw.toLowerCase();
  const tags = new Set();

  for (const r of LOCATION_RULES) {
    const inc = (r.includes ?? '').toString().trim();
    if (!inc) continue;
    if (rawLower.includes(inc.toLowerCase())) {
      for (const t of (r.mapping || '').split(';')) {
        const tt = t.trim();
        if (tt) tags.add(tt);
      }
    }
  }

  // Fallback: if nothing matched, keep raw string as-is so it still appears in the filter.
  if (tags.size === 0) tags.add(raw);

  // If we only matched the raw string itself (e.g., "Agency Site" -> "Agency Site"), treat as known.
  // (Unknowns are cases where no rule matched and we fell back.)

  return [...tags];
}

for (const sheetName of wb.SheetNames) {
  const sn = sheetName.toLowerCase();
  if (sn.includes('instruction') || sn === 'instructions') continue;

  const ws = wb.Sheets[sheetName];
  if (!ws) continue;

  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  for (const r of rows) {
    const clean = {};
    for (const [k, v] of Object.entries(r)) {
      const kk = (k || '').toString().trim();
      // Drop XLSX "__EMPTY" columns (blank headers) to avoid polluting jobs.json.
      if (!kk || kk.startsWith('__EMPTY')) continue;
      clean[kk] = (v instanceof Date) ? v.toISOString().slice(0,10) : (typeof v === 'string' ? v.trim() : v);
    }

    clean['Category'] = sheetName; // sheet name

    const roleRaw = (clean['Role'] || '').toString().trim();
    const categoryRaw = (clean['Category'] || '').toString().trim();
    const pTitleRaw = (clean['Project Title'] || '').toString().trim();
    const pTitle = pTitleRaw.toLowerCase();
    const div = (clean['Division'] || '').toString().trim();
    const desc = (clean['Project Description'] || '').toString().trim();

    if (!pTitleRaw) continue;
    if (pTitle.includes('instruction')) continue;
    if (roleRaw.toLowerCase() === 'instructions' || categoryRaw.toLowerCase() === 'instructions') continue;

    if (!div && !desc && !(clean['Learning Outcomes from Project']||'').toString().trim() && !(clean['Prerequisites']||'').toString().trim()) continue;

    // One-hot-ish tags for clean filtering
    clean['LevelTags'] = levelTags(clean['Internship Level']);
    clean['DurationTags'] = durationTags(clean['Internship Period']);
    // Work Location field is inconsistent across sheets (sometimes "Work Location (FormSG)").
    const wl = (
      (clean['Work Location'] || clean['Work Location (FormSG)'] || '').toString().trim()
    );
    const before = locationTags(wl);
    // Mark unknown only if we fell back AND there isn't an explicit exact-match rule.
    const exactRule = LOCATION_RULES.some(r => ((r.includes ?? '').toString().trim().toLowerCase() === (wl||'').toString().trim().toLowerCase()));
    if (wl && before.length === 1 && before[0] === wl && !exactRule) unknownLocations.add(wl);
    // Rule: if LocationTags ends up empty for any reason, fall back to the raw location string.
    clean['LocationTags'] = (before && before.length) ? before : (wl ? [wl] : []);

    const uniqueKey = `${categoryRaw}|${roleRaw}|${pTitleRaw}|${div}`;
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);
    all.push(clean);
  }
}

// Forward-fill Division within each category
const lastDivByCat = new Map();
for (const r of all) {
  const cat = r.Category;
  const div = (r['Division'] || '').toString().trim();
  if (div) lastDivByCat.set(cat, div);
  else if (lastDivByCat.has(cat)) r['Division'] = lastDivByCat.get(cat);
}

fs.writeFileSync(outPath, JSON.stringify(all, null, 2));
console.log(`Successfully generated jobs.json with ${all.length} roles.`);
if (unknownLocations.size) {
  console.log(`Unknown Work Location values not in mapping (${unknownLocations.size}):`);
  for (const x of [...unknownLocations].sort()) console.log(' - ' + x);
}
