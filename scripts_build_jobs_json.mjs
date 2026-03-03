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

const CANON_LEVELS = [
  'Open to all levels',
  'Undergraduate',
  'Post-Diploma',
  'Polytechnic student',
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
  if (x.includes('polytechnic')) return 'Polytechnic student';
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
  // keep in numeric-ish order
  const order = ['3 months','6 months','12 months'];
  const out = [];
  for (const o of order) if (tags.has(o)) out.push(o);
  for (const t of tags) if (!order.includes(t)) out.push(t);
  return out;
}

function locationTags(locStr) {
  // currently locations look like single values, but just in case
  const raw = splitMulti(locStr).length ? splitMulti(locStr) : [(locStr || '').toString().trim()].filter(Boolean);
  return [...new Set(raw)];
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
    clean['LocationTags'] = locationTags(clean['Work Location']);

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
