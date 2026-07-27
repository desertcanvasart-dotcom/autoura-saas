-- ============================================================================
-- 248 — Make the gmail_tokens unique index usable by ON CONFLICT
-- ============================================================================
--
-- Connecting a Gmail account failed with "Connection failed: Failed to save
-- tokens". Reproduced against production with the exact upsert the OAuth
-- callback performs:
--
--   42P10: there is no unique or exclusion constraint matching the
--          ON CONFLICT specification
--
-- Migration 222 did create a unique index on user_id — but a PARTIAL one:
--
--   CREATE UNIQUE INDEX uq_gmail_tokens_user_id
--     ON gmail_tokens(user_id) WHERE user_id IS NOT NULL;
--
-- PostgreSQL only uses a partial index for ON CONFLICT when the conflict target
-- carries the same predicate. supabase-js emits `ON CONFLICT (user_id)` with no
-- WHERE, so the index is present, correct, and unusable — the upsert fails as
-- though no index existed at all.
--
-- The predicate was never needed. A plain unique index already permits many
-- NULL user_ids, because PostgreSQL treats NULLs as distinct for uniqueness.
-- So dropping the WHERE loses nothing and makes the upsert work.
--
-- (That migration 222 was applied is confirmed by gmail_tokens.tenant_id being
-- nullable in production — step 4 of the same migration dropped that NOT NULL.)
-- ============================================================================

BEGIN;

-- Guard: a plain unique index cannot be created over duplicate user_ids. The
-- table is empty today, but this must not silently do half a job if it is not.
DO $$
DECLARE
  dupes integer;
BEGIN
  SELECT count(*) INTO dupes FROM (
    SELECT user_id FROM gmail_tokens
    WHERE user_id IS NOT NULL
    GROUP BY user_id HAVING count(*) > 1
  ) d;

  IF dupes > 0 THEN
    RAISE EXCEPTION
      'Aborting: % user_id value(s) appear more than once in gmail_tokens. '
      'Resolve the duplicates before adding a unique index — one Gmail '
      'connection per user is what the OAuth callback assumes.', dupes;
  END IF;
END $$;

DROP INDEX IF EXISTS uq_gmail_tokens_user_id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_gmail_tokens_user_id
  ON gmail_tokens (user_id);

COMMENT ON INDEX uq_gmail_tokens_user_id IS
  'Backs the OAuth callback''s upsert(onConflict: user_id). Deliberately NOT '
  'partial: PostgreSQL will not use a partial index for ON CONFLICT unless the '
  'conflict target repeats the predicate, which supabase-js cannot express.';

-- --------------------------------------------------------------------------
-- Post-check: the index must exist AND be usable as a conflict target, i.e.
-- unique, non-partial, over exactly (user_id).
-- --------------------------------------------------------------------------
DO $$
DECLARE
  ok boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_class t ON t.oid = i.indrelid
    WHERE t.relname = 'gmail_tokens'
      AND c.relname = 'uq_gmail_tokens_user_id'
      AND i.indisunique
      AND i.indpred IS NULL          -- not partial: this is the whole point
      AND i.indnatts = 1
  ) INTO ok;

  IF NOT ok THEN
    RAISE EXCEPTION
      'uq_gmail_tokens_user_id is missing, not unique, or still partial — '
      'the Gmail OAuth upsert would keep failing with 42P10.';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- Verify after applying — connect a Gmail account, or re-run the probe:
--   upsert into gmail_tokens with onConflict 'user_id' must succeed rather
--   than returning 42P10.
-- ============================================================================
