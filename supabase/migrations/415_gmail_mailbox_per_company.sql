-- ============================================================================
-- 415 — a Gmail mailbox per person PER COMPANY
-- ============================================================================
--
-- Since 414 one login can work in several companies, but gmail_tokens was
-- unique per user (248): one mailbox per person, filed under one company. In
-- any other company their Inbox was empty and they could not connect the
-- mailbox they use there — the OAuth callback upserted onto the one row and
-- re-filed it.
--
-- Now a mailbox belongs to (person, company): connecting files it under the
-- company the person is working in, and the Inbox, sending and syncing use
-- that company's mailbox. The same Gmail address may be connected in two
-- companies; each syncs into its own company (email_messages is already
-- unique per (tenant_id, gmail_message_id)). Sync progress
-- (email_sync_state) is kept per mailbox the same way.
--
-- Existing rows keep their company; a row with none gets the owner's oldest
-- active membership (390's rule). Constraints are found by column, not name.
-- Idempotent.
-- ============================================================================

BEGIN;

-- 1. Every mailbox filed under a company.
UPDATE public.gmail_tokens g
   SET tenant_id = (
         SELECT m.tenant_id
           FROM public.tenant_members m
          WHERE m.user_id = g.user_id
            AND m.status = 'active'
          ORDER BY m.joined_at ASC NULLS LAST, m.tenant_id ASC
          LIMIT 1)
 WHERE g.tenant_id IS NULL
   AND g.user_id IS NOT NULL;

-- 2. One mailbox per (person, company), not per person.
DROP INDEX IF EXISTS public.uq_gmail_tokens_user_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_gmail_tokens_user_tenant
  ON public.gmail_tokens (user_id, tenant_id);
COMMENT ON INDEX public.uq_gmail_tokens_user_tenant IS
  'Backs the OAuth callback''s upsert(onConflict: user_id,tenant_id): a person '
  'has one mailbox in each company they work in (migration 415).';

-- 3. Sync progress per mailbox.
ALTER TABLE public.email_sync_state
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

UPDATE public.email_sync_state s
   SET tenant_id = g.tenant_id
  FROM public.gmail_tokens g
 WHERE s.tenant_id IS NULL
   AND g.user_id = s.user_id
   AND g.tenant_id IS NOT NULL;

DO $$
DECLARE
  c TEXT;
BEGIN
  -- The UNIQUE on user_id alone (from 202/231), by its column.
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'public.email_sync_state'::regclass
       AND con.contype = 'u'
       AND con.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                                WHERE attrelid = 'public.email_sync_state'::regclass
                                  AND attname = 'user_id')]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.email_sync_state DROP CONSTRAINT %I', c);
    RAISE NOTICE '[415] dropped % on email_sync_state(user_id)', c;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_sync_state_user_tenant
  ON public.email_sync_state (user_id, tenant_id);

COMMIT;
