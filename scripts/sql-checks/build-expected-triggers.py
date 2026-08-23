#!/usr/bin/env python3
"""
Emit every (table, trigger) pair the migrations declare, as TSV on stdout.

Called by check-14-diff.sh on every run. It used to be a committed
expected-triggers.tsv, which went stale the moment a migration added a
trigger — migration 275 was declared and the file still reported both its
triggers as UNVERSIONED. A checked-in record that silently drifts from the
thing it describes is the exact failure this whole check exists to find, so
the reference is computed, never stored.

Handles the dynamic loops: 007 (`set_tenant_id_%s` over 24 tables), 245
(`set_tenant_id_%I` over 4) and 252 (`audit_%I` over 13) build trigger names
through EXECUTE format(), so no CREATE TRIGGER statement carries them. Any
`CREATE TRIGGER <prefix>%I|%s` is expanded over the nearest preceding
ARRAY[...] literal rather than special-casing each migration.
"""
import re, glob, os, sys

latest = {}
for f in sorted(glob.glob("supabase/migrations/*.sql")):
    src = open(f, encoding="utf-8", errors="replace").read()
    base = os.path.basename(f)

    for m in re.finditer(
        r'CREATE\s+(?:OR\s+REPLACE\s+)?(?:CONSTRAINT\s+)?TRIGGER\s+([a-zA-Z0-9_]+)\s+'
        r'(?:BEFORE|AFTER|INSTEAD)\b.*?\bON\s+(?:"?([a-zA-Z0-9_]+)"?\.)?"?([a-zA-Z0-9_]+)"?',
        src, re.I | re.S):
        # public schema only — the live query is scoped there, so an auth.users
        # trigger (007) would otherwise be reported MISSING on every run.
        if (m.group(2) or "public").lower() == "public":
            latest[(m.group(1).lower(), m.group(3).lower())] = base

    for tm in re.finditer(r"CREATE\s+TRIGGER\s+([a-z0-9_]+)%[Is]", src, re.I):
        prefix = tm.group(1).lower()
        arrs = re.findall(r"ARRAY\s*\[([^\]]*)\]", src[:tm.start()], re.S)
        if not arrs:
            continue
        for t in re.findall(r"'([a-z0-9_]+)'", arrs[-1]):
            latest[(f"{prefix}{t}", t)] = f"{base} (dynamic)"

if not latest:
    sys.exit("refusing to emit an empty reference — parser or path is wrong")

for (n, t), mig in sorted(latest.items(), key=lambda x: (x[0][1], x[0][0])):
    print(f"{t}\t{n}\t{mig}")
