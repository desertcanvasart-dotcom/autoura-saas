#!/usr/bin/env python3
"""
Migration drift sweep — does the database contain what the migrations declare?

    DB_URL='postgresql://...' python3 scripts/sql-checks/check-migration-drift.py

schema_migrations cannot answer this: 124 of its 125 rows carry one identical
timestamp (2026-07-16 16:46:10), a bulk backfill of rows asserting migrations
had run. Migration 220 is recorded there and demonstrably never executed.

So this compares the FILES against the live catalogues, object by object.

Ordering matters: an object created in migration 050 and dropped in 240 must
not be reported missing. Files are replayed in numeric order, CREATE adds to
the expected set and DROP removes from it, so only the net expectation is
checked.

READ THE RESULT LIKE THIS
-------------------------
TABLE / COLUMN / VIEW / FUNCTION are matched by name and a name is the thing
that exists — treat a hit as real and investigate it.

INDEX and POLICY are matched by name too, but their names drift while their
PURPOSE survives: on 2026-08-23 this reported 24 missing policies and 15
missing indexes, and every one was a rename or a supersede. Migration 242
replaced `<t>_tenant_isolation` with granular `<t>_tenant_read/insert/update/
delete`; 153's `idx_commissions_tenant_id` is live as `idx_commissions_tenant`.
For those two categories, ALWAYS check what the table actually carries before
concluding anything:

  select tablename, policyname from pg_policies where tablename = '<t>';
  select indexname, indexdef  from pg_indexes  where tablename = '<t>';

DYNAMIC DDL IS INVISIBLE HERE. Migration 241 drops check_usage_limit through
EXECUTE format() because the function is overloaded, so this reports it as
missing forever. 007/245/252 create triggers the same way. Static parsing
cannot see any of it — check-14-diff.sh handles the trigger loops explicitly;
nothing handles the general case.
"""
import os, re, subprocess, sys, glob, collections

DB = os.environ.get("DB_URL")
if not DB:
    sys.exit("set DB_URL")

def q(sql):
    out = subprocess.run(["psql", DB, "-qtA", "-F", "\t", "-c", sql],
                         capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit("psql failed: " + out.stderr[:400])
    return [l for l in out.stdout.split("\n") if l.strip()]

# ---------- live inventories ----------
live = {
    "table":    {r.lower() for r in q("select tablename from pg_tables where schemaname='public'")},
    "view":     {r.lower() for r in q("select viewname from pg_views where schemaname='public' union select matviewname from pg_matviews where schemaname='public'")},
    "index":    {r.lower() for r in q("select indexname from pg_indexes where schemaname='public'")},
    "function": {r.lower() for r in q("select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")},
    "column":   {r.lower() for r in q("select table_name||'.'||column_name from information_schema.columns where table_schema='public'")},
    # NOT scoped to public: 004 and 038 create policies on storage.objects, and
    # scoping this query to public reported all 8 of them as missing.
    "policy":   {r.lower() for r in q("select tablename||'.'||policyname from pg_policies")}
               | {r.lower() for r in q("select schemaname||'.'||policyname from pg_policies")},
    "trigger":  {r.lower() for r in q("select c.relname||'.'||t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid where not t.tgisinternal and c.relnamespace='public'::regnamespace")},
}

# ---------- parse migrations in order ----------
def key(p):
    m = re.match(r"(\d+)", os.path.basename(p))
    return (int(m.group(1)) if m else 9999, os.path.basename(p))

expected = collections.defaultdict(dict)   # kind -> {name: migration}

PATTERNS = [
    ("table",    r"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?\"?([a-z0-9_]+)\"?", "add"),
    ("table",    r"DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?\"?([a-z0-9_]+)\"?", "del"),
    ("view",     r"CREATE\s+(?:OR\s+REPLACE\s+)?(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?\"?([a-z0-9_]+)\"?", "add"),
    ("view",     r"DROP\s+(?:MATERIALIZED\s+)?VIEW\s+(?:IF\s+EXISTS\s+)?(?:public\.)?\"?([a-z0-9_]+)\"?", "del"),
    ("index",    r"CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?\"?([a-z0-9_]+)\"?", "add"),
    ("index",    r"DROP\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+EXISTS\s+)?(?:public\.)?\"?([a-z0-9_]+)\"?", "del"),
    ("function", r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?\"?([a-z0-9_]+)\"?", "add"),
    ("function", r"DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?\"?([a-z0-9_]+)\"?", "del"),
]

for path in sorted(glob.glob("supabase/migrations/*.sql"), key=key):
    src = open(path, encoding="utf-8", errors="replace").read()
    # strip line comments so commented-out DDL is not counted
    src = re.sub(r"--[^\n]*", "", src)
    base = os.path.basename(path)

    for kind, pat, op in PATTERNS:
        for m in re.finditer(pat, src, re.I):
            n = m.group(1).lower()
            if op == "add": expected[kind][n] = base
            else: expected[kind].pop(n, None)

    # columns: ALTER TABLE <t> ... ADD/DROP COLUMN <c>  (one statement may carry many)
    for m in re.finditer(r"ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?\"?([a-z0-9_]+)\"?(.*?);", src, re.I | re.S):
        tbl, body = m.group(1).lower(), m.group(2)
        for c in re.finditer(r"ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?\"?([a-z0-9_]+)\"?", body, re.I):
            expected["column"][f"{tbl}.{c.group(1).lower()}"] = base
        for c in re.finditer(r"DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?\"?([a-z0-9_]+)\"?", body, re.I):
            expected["column"].pop(f"{tbl}.{c.group(1).lower()}", None)

    # policies
    for m in re.finditer(r"CREATE\s+POLICY\s+\"?([a-z0-9_ ]+?)\"?\s+ON\s+(?:public\.)?\"?([a-z0-9_]+)\"?", src, re.I):
        expected["policy"][f"{m.group(2).lower()}.{m.group(1).strip().lower()}"] = base
    for m in re.finditer(r"DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?\"?([a-z0-9_ ]+?)\"?\s+ON\s+(?:public\.)?\"?([a-z0-9_]+)\"?", src, re.I):
        expected["policy"].pop(f"{m.group(2).lower()}.{m.group(1).strip().lower()}", None)

# ---------- report ----------
print("Categories are NOT equally trustworthy — see the header note on renames.\n")
print(f"{'kind':10} {'declared':>9} {'live':>7} {'MISSING':>8}")
print("-" * 38)
missing = collections.defaultdict(list)
for kind in ["table", "column", "index", "function", "view", "policy"]:
    exp = expected[kind]
    gone = sorted(n for n in exp if n not in live[kind])
    # a column on a table that itself is missing is one finding, not two
    if kind == "column":
        gone = [c for c in gone if c.split(".")[0] in live["table"]]
    missing[kind] = [(n, exp[n]) for n in gone]
    print(f"{kind:10} {len(exp):>9} {len(live[kind]):>7} {len(gone):>8}")

print()
for kind in ["table", "view", "function", "column", "index", "policy"]:
    if not missing[kind]:
        continue
    print(f"=== MISSING {kind.upper()}S ({len(missing[kind])}) ===")
    for n, mig in missing[kind][:40]:
        print(f"  {n}   <- {mig}")
    if len(missing[kind]) > 40:
        print(f"  … {len(missing[kind]) - 40} more")
    print()
