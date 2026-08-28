// ============================================
// The support bundle — typed surface
// ============================================
// S1 of docs/plans/self-hosted-support.md. When an install we do not run goes
// wrong, this is what crosses the gap: one file the customer generates, reads,
// and emails. Most "it's broken" reports are answered by two lines of it —
// usually a missing environment variable or an unapplied migration.
//
// THE IMPLEMENTATION IS IN bundle-core.mjs, in plain JavaScript, mirroring
// scripts/migrate-core.mjs. The same redaction has to run inside the Next app
// AND inside scripts/doctor.mjs — a bare node script that cannot import .ts —
// and two copies of a redaction rule is exactly how one of them stops matching.
//
// THE THREE RULES, which every field obeys and lib/__tests__ proves:
//
//   NAMES, NOT VALUES.   Environment variables are reported as set or missing.
//                        No value ever leaves the server, not even a prefix —
//                        "sk_live_51H..." is enough to identify an account.
//   COUNTS, NOT ROWS.    How many bookings, never whose. No client names, no
//                        emails, no passport anything.
//   SCRUBBED, NOT RAW.   Error lines go through redactText, which removes
//                        anything shaped like an address, a key or an id.
//
// And the allow-list is OURS. A customer's own environment variable — their
// internal keys, their hostnames — is never reported at all, not even by name,
// because we did not ask them to have it and it is not ours to see.

import * as core from './bundle-core.mjs'

export interface EnvReport {
  set: string[]
  missing: string[]
  /** Of `missing`, the ones that stop the app working rather than disabling a
   *  feature. Named separately so the first line of a diagnosis is obvious. */
  missingRequired: string[]
}

export interface SupportBundle {
  generatedAt: string
  app: { version: string; sha: string; node: string; uptimeSeconds: number | null }
  database: {
    reachable: boolean
    latencyMs: number | null
    migrationsApplied: number | null
    /** Null = not measured here. The endpoint cannot know it (the migration
     *  files are not in the built image); scripts/doctor.mjs can. */
    migrationsPending: string[] | null
    error?: string
  }
  env: EnvReport
  /** ok = probed and answered · configured = keys present, not probed (a
   *  support check must not spend money or take seconds calling a vendor) ·
   *  unconfigured = no keys, which is normal for an unused feature ·
   *  failed = configured and did not answer. */
  integrations: Record<string, 'ok' | 'configured' | 'unconfigured' | 'failed'>
  crons: Array<{ name: string; lastRun: string | null; lastOutcome: string | null }>
  counts: Record<string, number>
  recentErrors: string[]
  /** Said out loud in the file, because the customer should not have to take
   *  our word for what they are sending. */
  redaction: string[]
}

export interface BundleParts {
  generatedAt: string
  version: string
  sha: string
  node: string
  uptimeSeconds?: number | null
  database: SupportBundle['database']
  env: Record<string, string | undefined>
  integrations?: SupportBundle['integrations']
  crons?: SupportBundle['crons']
  counts?: Record<string, number>
  errors?: unknown[]
}

/** Environment variables this product knows about, by name. Anything not on
 *  this list is invisible to the bundle: it belongs to the customer, not us. */
export const KNOWN_ENV_KEYS: readonly string[] = core.KNOWN_ENV_KEYS

/** The ones without which the app does not work at all. */
export const REQUIRED_ENV_KEYS: readonly string[] = core.REQUIRED_ENV_KEYS

export const REDACTION_NOTICE: readonly string[] = core.REDACTION_NOTICE

/** Which known variables are set. NEVER their values. */
export const reportEnv: (env: Record<string, string | undefined>) => EnvReport = core.reportEnv

/** Make one line of text safe to send. Errs toward over-redacting: an
 *  over-redacted log still says WHICH error happened and where. */
export const redactText: (input: unknown) => string = core.redactText

/** The most recent lines, scrubbed, each capped in length. */
export const redactErrorLines: (lines: unknown[], limit?: number) => string[] = core.redactErrorLines

/** Assemble the bundle. The only way one is built — so the redaction cannot be
 *  skipped by a caller assembling the object itself. */
export const buildBundle: (parts: BundleParts) => SupportBundle = core.buildBundle

/** The one-screen summary: what is wrong, in the order it should be read.
 *  Exists so nobody has to interpret JSON during an incident — the customer can
 *  often fix it themselves from this, which is the whole point. */
export const bundleFindings: (bundle: SupportBundle) => string[] = core.bundleFindings
