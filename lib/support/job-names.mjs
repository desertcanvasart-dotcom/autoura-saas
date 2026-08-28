// ============================================
// The scheduled-job vocabulary — RUNTIME CORE
// ============================================
// Plain JavaScript for the same reason as bundle-core.mjs: scripts/doctor.mjs
// is a bare node script and cannot import .ts, and two lists of job names is
// exactly how one of them stops matching what the scheduler actually runs.
// lib/support/job-runs.ts re-exports this.

/** Every scheduled job in this product, exactly once. */
export const JOB_NAMES = [
  'exchange-rates',
  'agent-memory',
  'reminders',
  'task-reminders',
  'purge-traveller-documents',
]
