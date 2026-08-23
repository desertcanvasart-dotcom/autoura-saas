#!/usr/bin/env bash
# Check 14 — diff the live trigger inventory against what the repo declares.
#
#   DB_URL='postgresql://...' bash scripts/sql-checks/check-14-diff.sh
#
# A trigger that is live but declared nowhere is unversioned: it will not
# survive a rebuild, no review ever saw it, and reading its definition often
# explains a long-standing mystery. That class produced the hardest defect of
# the Travel Ops Pro audit.
set -euo pipefail
: "${DB_URL:?set DB_URL to the Supabase pooler connection string}"
here="$(cd "$(dirname "$0")" && pwd)"
live="${LIVE_TSV:-/tmp/live-triggers.tsv}"

if [ -z "${LIVE_TSV:-}" ]; then
  # -qtA -F$'\t': quiet, tuples-only, unaligned, tab-separated. Set here rather
  # than with \pset in the .sql file — psql echoes a confirmation line for each
  # \pset ("Field separator is ...") and those land in the data.
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qtA -F$'\t' \
       -f "$here/check-14-unversioned-triggers.sql" | sed '/^$/d' > "$live"
fi

key() { awk -F'\t' 'NF>=2 {print $1"."$2}' "$1" | sort -u; }

echo "live triggers:    $(wc -l < "$live" | tr -d ' ')"
echo "declared in repo: $(wc -l < "$here/expected-triggers.tsv" | tr -d ' ')"

echo
echo "=== UNVERSIONED — live, declared in no migration ==="
comm -23 <(key "$live") <(key "$here/expected-triggers.tsv") | sed 's/^/  /' || true

echo
echo "=== MISSING — declared in a migration, not live ==="
comm -13 <(key "$live") <(key "$here/expected-triggers.tsv") | sed 's/^/  /' || true

echo
echo "=== DISABLED in production (present but not firing) ==="
awk -F'\t' 'NF>=3 && $3!="enabled" {print "  "$1"."$2" -> "$3}' "$live" || true
