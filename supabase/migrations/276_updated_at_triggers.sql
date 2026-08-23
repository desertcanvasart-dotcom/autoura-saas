-- ============================================================================
-- 276 — make `updated_at` actually update
-- ============================================================================
--
-- 88 tables carry an `updated_at` column. 65 have a BEFORE UPDATE trigger that
-- assigns it; 23 do not, so on those the column keeps its creation date
-- forever unless the writing code happens to set it by hand. Every
-- "recently changed" view, sort and sync watermark built on them is wrong, and
-- nothing errors.
--
-- Four of the 23 are worse than merely absent: migrations 000, 030, 119 and
-- 120 DECLARE a trigger that was never created (found by check 14 —
-- scripts/sql-checks/check-14-diff.sh). The repo believes they exist.
--
-- ── Safety ─────────────────────────────────────────────────────────────────
-- A BEFORE UPDATE trigger overwrites whatever the caller passed for
-- updated_at. That is only safe if no writer sets it to a meaningful value.
-- All 101 places in app/, lib/ and scripts/ that assign updated_at use
-- new Date().toISOString() or NOW(); none preserves an original timestamp.
-- Checked before writing this.
--
-- ── Two halves, deliberately ───────────────────────────────────────────────
-- Part 1 recreates the four DECLARED triggers under the exact names their
-- migrations use, including 119's and 120's own copies of the helper. Those
-- copies are byte-identical to update_updated_at_column() and would normally
-- be worth collapsing — but this migration's job is to make the database match
-- the repository, and consolidating the helpers is a separate change with its
-- own risk. Reproduced as declared so check-14-diff.sh and
-- check-migration-drift.py both come back clean.
--
-- Part 2 covers the remaining 19, which no migration declares at all, using
-- the canonical helper and the dominant naming convention (update_<t>_updated_at,
-- 40 of the 65 live triggers). It is schema-driven rather than a list, so it
-- cannot drift from what the schema actually has.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Part 1 — the four declared-but-never-created triggers
-- ---------------------------------------------------------------------------

-- migration 119
CREATE OR REPLACE FUNCTION update_content_library_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_content_library_updated_at ON content_library;
CREATE TRIGGER trigger_content_library_updated_at
  BEFORE UPDATE ON content_library
  FOR EACH ROW EXECUTE FUNCTION update_content_library_updated_at();

-- migration 120
CREATE OR REPLACE FUNCTION update_writing_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_writing_rules_updated_at ON writing_rules;
CREATE TRIGGER trigger_writing_rules_updated_at
  BEFORE UPDATE ON writing_rules
  FOR EACH ROW EXECUTE FUNCTION update_writing_rules_updated_at();

-- migration 030
DROP TRIGGER IF EXISTS trigger_tenant_invitations_updated_at ON tenant_invitations;
CREATE TRIGGER trigger_tenant_invitations_updated_at
  BEFORE UPDATE ON tenant_invitations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- migration 000
DROP TRIGGER IF EXISTS update_tour_templates_updated_at ON tour_templates;
CREATE TRIGGER update_tour_templates_updated_at
  BEFORE UPDATE ON tour_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Part 2 — the remaining 19, which no migration declares at all.
--
-- The table list is EXPLICIT, not a catalogue query, for two reasons. A
-- schema-driven loop does something different on every database it meets,
-- which is not what a migration should do. And check-14-diff.sh derives the
-- declared set by parsing these files: it expands `CREATE TRIGGER <prefix>%I`
-- over the nearest ARRAY literal, so a loop fed by pg_class is invisible to it
-- and every trigger created that way is reported UNVERSIONED forever. The
-- first draft of this migration did exactly that and produced 19 phantom
-- findings — the same trap 007, 245, 252 and 241 each sprang today.
--
-- The catalogue query survives where it belongs: the post-check, where being
-- database-specific is the point.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agent_memory', 'b2b_partner_pricing', 'b2b_pricing_rules',
    'b2b_transport_packages', 'booking_supplier_status', 'email_client_links',
    'email_conversations', 'email_sync_state', 'gmail_tokens',
    'message_templates', 'nile_cruises', 'prompt_templates', 'scheduled_sends',
    'tour_categories', 'tour_quotes', 'tour_variations', 'tours',
    'transportation_rates', 'unified_conversations'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Post-check: no table with an updated_at column may be left unmaintained.
-- Migration 220 shipped without one and silently never ran; every migration in
-- this repair series asserts its own outcome.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  stragglers TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO stragglers
  FROM pg_class c
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'updated_at'
                     AND a.attnum > 0 AND NOT a.attisdropped
  WHERE c.relkind = 'r' AND c.relnamespace = 'public'::regnamespace
    AND NOT EXISTS (
      SELECT 1 FROM pg_trigger tg JOIN pg_proc p ON p.oid = tg.tgfoid
      WHERE tg.tgrelid = c.oid AND NOT tg.tgisinternal
        AND (tg.tgtype & 16) <> 0
        AND p.prosrc ~* 'NEW\.updated_at\s*(:?=)'
    );

  IF stragglers IS NOT NULL THEN
    RAISE EXCEPTION 'tables still without an updated_at trigger: %', stragglers;
  END IF;

  -- The four from Part 1 must exist under their DECLARED names, or the repo
  -- still disagrees with the database and check 14 still reports them.
  IF (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND t.tgname IN (
        'trigger_content_library_updated_at', 'trigger_writing_rules_updated_at',
        'trigger_tenant_invitations_updated_at', 'update_tour_templates_updated_at')) <> 4
  THEN
    RAISE EXCEPTION 'the four declared triggers are not all present under their declared names';
  END IF;
END $$;

COMMIT;
