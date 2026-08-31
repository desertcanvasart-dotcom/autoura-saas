-- 309: the schema behind WhatsApp conversation assignment
--
-- The feature was fully built in the app -- an assign button, an
-- Available/Away toggle, a capacity readout, "unassigned only" and
-- per-agent filters -- against columns that were never migrated. The list
-- query embedded team_members through a foreign key that did not exist, so
-- PostgREST answered PGRST200 and the WhatsApp inbox could not load at all.
--
-- Deliberately NOT added here:
--
--   current_conversations -- a stored counter drifts. The agents route now
--     counts open assigned conversations at read time, which is the same
--     rail the conversation preview/counters ride (recomputed from source,
--     no app-side increments).
--   last_assigned_at     -- selected but never read by any UI.
--   assigned_agent_id    -- a duplicate of assigned_team_member_id that the
--     assign route wrote alongside it. The write is removed instead.
--   avatar_url           -- team_members.photo_url already means this; the
--     agents route aliases it rather than carrying two photo columns.

-- ---------- whatsapp_conversations ----------

-- hidden_at/hidden_by belong to the same gap: the route's hide and unhide
-- actions write all three, and the list query filters on is_hidden.
-- hidden_by is an auth user id (user.id), not a team_members row, so it
-- takes no foreign key here.
ALTER TABLE whatsapp_conversations
  ADD COLUMN IF NOT EXISTS assigned_team_member_id UUID,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'whatsapp_conversations_assigned_team_member_id_fkey'
      AND table_name = 'whatsapp_conversations'
  ) THEN
    -- The app names this constraint explicitly in its embed hint, so the
    -- name is load-bearing, not cosmetic.
    ALTER TABLE whatsapp_conversations
      ADD CONSTRAINT whatsapp_conversations_assigned_team_member_id_fkey
      FOREIGN KEY (assigned_team_member_id)
      REFERENCES team_members(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Both filters the inbox offers: by agent, and unassigned-only.
CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_assigned
  ON whatsapp_conversations (tenant_id, assigned_team_member_id);

-- ---------- team_members ----------

ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS max_conversations INTEGER NOT NULL DEFAULT 10;

-- A capacity of zero would make an agent permanently unassignable through a
-- UI that offers no way to change it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'team_members_max_conversations_positive'
  ) THEN
    ALTER TABLE team_members
      ADD CONSTRAINT team_members_max_conversations_positive
      CHECK (max_conversations > 0);
  END IF;
END $$;
