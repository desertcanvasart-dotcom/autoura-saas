-- ============================================
-- 432: a deleted account takes its Gmail connections with it
-- ============================================
-- gmail_tokens.user_id had no foreign key (007), so deleting an account left
-- its refresh tokens — live access to that person's mailbox — in the table
-- for good. The app now revokes them at Google first (lib/gmail-revoke);
-- this makes sure the rows can never outlive the account, whatever path
-- deletes it.

BEGIN;

-- Rows already orphaned by earlier deletions.
DELETE FROM public.gmail_tokens t
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = t.user_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.gmail_tokens'::regclass AND conname = 'gmail_tokens_user_id_fkey'
  ) THEN
    ALTER TABLE public.gmail_tokens
      ADD CONSTRAINT gmail_tokens_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

COMMIT;
