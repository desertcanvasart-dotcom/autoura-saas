-- =====================================================
-- Migration 222: reconcile gmail_tokens with the code's actual schema
-- =====================================================
-- Migration 007 defined gmail_tokens with `email_address`, `expiry_date` and
-- `tenant_id NOT NULL`. The application code never used those names — the OAuth
-- callback and every gmail/* route read/write `email`, `token_expiry`, and
-- upsert `onConflict: user_id` without a tenant_id. The live table evidently
-- has the code's columns (Gmail send/poll/labels work), so migration 007's
-- definition is stale and a fresh checkout built from migrations would not
-- match the code.
--
-- This migration makes a from-scratch database consistent with the code, and
-- is a safe no-op on any database that already matches. Every step is guarded.

-- 1. Ensure the columns the code uses exist.
ALTER TABLE gmail_tokens ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE gmail_tokens ADD COLUMN IF NOT EXISTS token_expiry TIMESTAMPTZ;

-- 2. Backfill from the legacy columns IF they exist (fresh-from-007 DBs).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'gmail_tokens' AND column_name = 'email_address') THEN
    EXECUTE 'UPDATE gmail_tokens SET email = email_address WHERE email IS NULL AND email_address IS NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'gmail_tokens' AND column_name = 'expiry_date') THEN
    EXECUTE 'UPDATE gmail_tokens SET token_expiry = expiry_date WHERE token_expiry IS NULL AND expiry_date IS NOT NULL';
  END IF;
END $$;

-- 3. The callback upserts with onConflict: 'user_id', which needs a unique key
--    on user_id. (Safe: if prod already has it this is a no-op; the working
--    upsert proves there are no duplicate user_ids.)
CREATE UNIQUE INDEX IF NOT EXISTS uq_gmail_tokens_user_id
  ON gmail_tokens(user_id)
  WHERE user_id IS NOT NULL;

-- 4. The callback does not supply tenant_id; drop the stale NOT NULL if present
--    so from-scratch inserts don't fail.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'gmail_tokens' AND column_name = 'tenant_id'
               AND is_nullable = 'NO') THEN
    EXECUTE 'ALTER TABLE gmail_tokens ALTER COLUMN tenant_id DROP NOT NULL';
  END IF;
END $$;
