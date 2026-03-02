import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const xlsxPath = '/home/clawd/.openclaw/media/inbound/file_19---40946a94-3852-41c1-9153-b45ea09e85c8.xlsx';
const outPath = '/home/clawd/.openclaw/workspace/job-browser-repo/jobs.json';

const wb = XLSX.readFile(xlsxPath, { cellDates: true });

const all = [];
for (const sheetName of wb.SheetNames) {
  const ws = wb.Sheets[sheetName];
  if (!ws) continue;

  // Get rows as JSON; defval keeps empty cells.
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

  for (const r of rows) {
    // Normalize keys a bit (trim)
    const clean = {};
    for (const [k, v] of Object.entries(r)) {
      const kk = (k || '').toString().trim();
      clean[kk] = (v instanceof Date) ? v.toISOString().slice(0,10) : (typeof v === 'string' ? v.trim() : v);
    }

    // Force Role = sheet name (as per Jing)
    clean['Role'] = sheetName;

    // Some sheets might have merged/blank Division — attempt forward-fill by tracking last seen division.
    // We'll do a simple pass later; for now just keep what's present.
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
console.log(`Wrote ${all.length} rows -> ${outPath}`);
console.log(`Roles (sheets): ${wb.SheetNames.length}`);
