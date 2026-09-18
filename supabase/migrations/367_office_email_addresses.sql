-- ============================================================================
-- 367 — The office's other addresses
-- ============================================================================
--
-- Sync calls a message ours only when its From is the connected mailbox
-- EXACTLY. An office writes to customers from more than one address — the
-- connected info@ and a colleague's hello@ on the same domain — and every
-- reply sent from the second read as the CUSTOMER writing. Since migration
-- 366 that has a visible cost: the conversation sits in "Waiting on us" for a
-- reply that already went.
--
-- The connected mailbox and its domain are known already. This column is for
-- the rest: a colleague's address on another domain, a partner office that
-- answers on the agency's behalf, an old domain still in use. Each entry is a
-- full address or a whole domain (lib/email/office-addresses.ts).
-- ============================================================================

BEGIN;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS office_email_addresses text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.tenants.office_email_addresses IS
  'Addresses or whole domains that count as the office writing, beyond the connected mailbox and its own domain. Used by email sync to tell our reply from a customer''s message.';

COMMIT;
