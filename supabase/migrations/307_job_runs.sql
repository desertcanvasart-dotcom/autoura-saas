-- ============================================
-- job_runs — proof that a scheduled job actually ran
-- ============================================
-- S3 of docs/plans/self-hosted-support.md.
--
-- Nothing in this product recorded that a cron ever ran. docs/CRON-JOBS.md
-- describes three jobs configured in the RAILWAY DASHBOARD — which a
-- self-hosted customer does not have. On their server the jobs are whatever
-- their own scheduler does, and there was no way to tell from inside the app
-- whether exchange rates had refreshed since the day of install.
--
-- That matters beyond tidiness: without refresh-exchange-rates, every historical
-- conversion in the P&L silently falls back to today's rate. The report does not
-- break, it just quietly stops being true.
--
-- One insert per run turns "the FX rates look stale" from a conversation into a
-- line in the support bundle.
--
-- NOT TENANT-SCOPED, deliberately. These are INSTALL-level jobs — one scheduler
-- runs them for every tenant on the box — so a tenant_id here would be a lie
-- about what the row describes. It is also why the table is service-role only:
-- no tenant has business reading another's job history, and none has business
-- reading its own either.

BEGIN;

CREATE TABLE IF NOT EXISTS public.job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The job's stable name, not its route: lib/support/job-runs.ts owns the
  -- vocabulary so the bundle and the scheduler cannot drift apart.
  job_name TEXT NOT NULL,

  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- NULL with a started_at in the past is itself a finding: the job began and
  -- the process died before it could say how it went.
  finished_at TIMESTAMPTZ,

  outcome TEXT CHECK (outcome IN ('ok', 'failed')),
  -- A short, already-redacted summary. Never a payload, never a stack trace —
  -- this table is read into a file customers send us.
  detail TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only query anyone runs: the latest run of a given job.
CREATE INDEX IF NOT EXISTS idx_job_runs_recent
  ON public.job_runs (job_name, started_at DESC);

-- Deny by default. Reached only by the service role inside the cron routes and
-- the support bundle.
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.job_runs IS
  'One row per scheduled-job run. Install-level, not tenant-level. Read by the support bundle to answer "have the jobs ever run on this box?".';

COMMIT;
