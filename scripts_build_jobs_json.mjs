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

for (const sheetName of wb.SheetNames) {
  // Skip instruction sheets
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
    // Sheet name is a category/grouping, NOT the actual role column
    clean['Category'] = sheetName;
    
    // Skip empty or instruction-like rows
    const role = (clean['Role'] || '').toString().trim();
    const category = (clean['Category'] || '').toString().trim();
    const pTitleRaw = (clean['Project Title'] || '').toString().trim();
    const pTitle = pTitleRaw.toLowerCase();
    const div = (clean['Division'] || '').toString().trim();
    const desc = (clean['Project Description'] || '').toString().trim();

    if (!pTitleRaw) continue;
    if (pTitle.includes('instruction')) continue;
    if (category.toLowerCase() === 'instructions') continue;

    // drop rows that are basically empty placeholders
    if (!div && !desc && !(clean['Learning Outcomes from Project']||'').toString().trim() && !(clean['Prerequisites']||'').toString().trim()) continue;

    // Dedup key
    const uniqueKey = `${category}|${role}|${pTitleRaw}|${div}`;
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);
    all.push(clean);
  }
}

// Forward-fill Division within each category (sheet)
const lastDivByCat = new Map();
for (const r of all) {
  const cat = r.Category;
  const div = (r['Division'] || '').toString().trim();
  if (div) lastDivByCat.set(cat, div);
  else if (lastDivByCat.has(cat)) r['Division'] = lastDivByCat.get(cat);
}

fs.writeFileSync(outPath, JSON.stringify(all, null, 2));
console.log(`Successfully generated jobs.json with ${all.length} roles.`);
