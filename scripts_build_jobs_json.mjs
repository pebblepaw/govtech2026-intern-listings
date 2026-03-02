import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const xlsxPath = path.join(__dirname, 'data.xlsx');
const outPath = path.join(__dirname, 'jobs.json');

// Check if data.xlsx exists
if (!fs.existsSync(xlsxPath)) {
  console.error(`Error: Could not find ${xlsxPath}`);
  process.exit(1);
}

const wb = XLSX.readFile(xlsxPath, { cellDates: true });

const all = [];
for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName];
  if (!ws) continue;

  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  for (const r of rows) {
    const clean = {};
    for (const [k, v] of Object.entries(r)) {
      const kk = (k || '').toString().trim();
      clean[kk] = (v instanceof Date) ? v.toISOString().slice(0,10) : (typeof v === 'string' ? v.trim() : v);
    }
    clean['Role'] = sheetName;
    all.push(clean);
  }
}

// Forward-fill Division within each role (sheet)
const lastDivByRole = new Map();
for (const r of all) {
  const role = r.Role;
  const div = (r['Division'] || '').toString().trim();
  if (div) lastDivByRole.set(role, div);
  else if (lastDivByRole.has(role)) r['Division'] = lastDivByRole.get(role);
}

fs.writeFileSync(outPath, JSON.stringify(all, null, 2));
console.log(`Successfully generated jobs.json with ${all.length} roles from ${wb.SheetNames.length} sheets.`);
