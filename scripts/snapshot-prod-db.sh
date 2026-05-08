#!/usr/bin/env bash
# Snapshots the production content-pipeline DB to a local SQL file.
# Usage: ./scripts/snapshot-prod-db.sh [output-file]
# Default output: ./prod-snapshot-YYYYmmdd-HHMMSS.sql (gitignored)

set -euo pipefail

OUT="${1:-prod-snapshot-$(date +%Y%m%d-%H%M%S).sql}"
SSH_HOST="${PROD_SSH_HOST:-backend-vps}"
DB_USER="${PROD_DB_USER:-pipeline}"
DB_NAME="${PROD_DB_NAME:-content_pipeline}"

echo "Snapshotting $DB_NAME from $SSH_HOST → $OUT"
ssh "$SSH_HOST" "sudo -u postgres pg_dump --format=plain --no-owner --no-privileges $DB_NAME" > "$OUT"

bytes=$(wc -c < "$OUT")
echo "Snapshot complete: $OUT ($bytes bytes)"
if [ "$bytes" -lt 1000 ]; then
  echo "ERROR: snapshot suspiciously small (<1KB). Aborting."
  exit 1
fi
