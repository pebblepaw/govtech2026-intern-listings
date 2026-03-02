#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/home/clawd/.openclaw/workspace/job-browser-repo"
XLSX_URL="https://file.go.gov.sg/govtechinternshipprojects2026.xlsx"

cd "$REPO_DIR"

# Load PAT (must be present)
source /home/clawd/.openclaw/workspace/secrets/github.env

# Keep secrets out of logs
set +x

TMP_XLSX="$(mktemp -t govtechintern-XXXXXX.xlsx)"
trap 'rm -f "$TMP_XLSX"' EXIT

# 1) Download latest XLSX
curl -fsSL -L "$XLSX_URL" -o "$TMP_XLSX"
cp "$TMP_XLSX" ./data.xlsx

# 2) Rebuild jobs.json (Role = sheet name)
node ./scripts_build_jobs_json.mjs

# 3) Stamp "Last updated" in HTML + README
DATE_STR=$(date +"%-d %b %Y")
# index.html contains: <div class="chip info">Last updated: ...</div>
perl -0777 -i -pe "s/Last updated: [^<]*/Last updated: ${DATE_STR}/g" index.html
perl -0777 -i -pe "s/\*Last updated: .+?\*/\*Last updated: ${DATE_STR}\*/g" README.md

# 4) Commit & push if changed
if git diff --quiet; then
  echo "No changes detected. Already up to date (${DATE_STR})."
  exit 0
fi

git add jobs.json index.html README.md data.xlsx

git config user.name "Pebble"
git config user.email "pebble@openclaw.ai"

git commit -m "Nightly update: refresh listings from go.gov.sg (${DATE_STR})"

# Push using PAT, without storing it in git remote
GIT_ASKPASS=true git push "https://pebblepaw:${GITHUB_PAT}@github.com/pebblepaw/govtech2026-intern-listings.git" main

echo "Updated and pushed successfully (${DATE_STR})."