#!/usr/bin/env node
// ============================================
// Deploy verification — verify the COMMIT, not the "success" status
// ============================================
// Deploy drift (an old build still serving after a "successful" deploy) has
// repeatedly masked already-merged fixes in this project. This script proves
// which commit a deployment is actually serving, plus a minimal health sweep.
//
// Usage:
//   npm run verify:deploy                          # target NEXT_PUBLIC_APP_URL
//   npm run verify:deploy -- --url http://localhost:3000
//   npm run verify:deploy -- --url https://autoura.net --sha <expected-sha>
//
// Expected SHA defaults to the local checkout's origin/main (falls back to
// HEAD) — i.e. "is prod serving what's merged?".
//
// Checks:
//   1. GET /api/version    → 200 and sha === expected
//   2. GET /login          → 200 (app serves pages)
//   3. GET /api/itineraries→ 401 (auth gate is up — a 200 here means the
//                            API is open to the anonymous internet)
// Exit code 0 = all pass; 1 = any failure.

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')

function envFromDotLocal(key) {
  if (process.env[key]) return process.env[key]
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && m[1] === key) return m[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch { /* optional */ }
  return undefined
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 ? process.argv[i + 1] : undefined
}

function localSha() {
  for (const ref of ['origin/main', 'HEAD']) {
    try {
      const out = execSync(`git rev-parse ${ref}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString().trim()
      if (/^[0-9a-f]{40}$/.test(out)) return { sha: out, ref }
    } catch { /* try next ref */ }
  }
  return null
}

const baseUrl = (arg('url') || envFromDotLocal('NEXT_PUBLIC_APP_URL') || 'http://localhost:3000')
  .replace(/\/$/, '')
const expectedArg = arg('sha')
const local = expectedArg ? { sha: expectedArg, ref: '--sha argument' } : localSha()

let failures = 0
const ok = (msg) => console.log(`  ✓ ${msg}`)
const fail = (msg) => { failures++; console.log(`  ✗ ${msg}`) }

async function probe(pathname) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(15_000),
  })
  return res
}

console.log(`Verifying deployment at ${baseUrl}`)
if (local) console.log(`Expected commit: ${local.sha.slice(0, 12)}… (${local.ref})\n`)

// ── 1. Version / commit drift ──────────────────────────────────────────────
try {
  const res = await probe('/api/version')
  if (res.status !== 200) {
    fail(`/api/version returned ${res.status} — this deployment predates the version endpoint (or the route is blocked). Deploy current main first.`)
  } else {
    const v = await res.json()
    if (v.sha === 'unknown') {
      fail(`deployment cannot report its commit (shaSource=unknown). Bake it in: docker build --build-arg GIT_SHA=$(git rev-parse HEAD) with ARG GIT_SHA + ENV GIT_SHA=$GIT_SHA in the Dockerfile, or run from a git checkout.`)
    } else if (!local) {
      fail(`no expected SHA available (not a git checkout and no --sha given); deployment reports ${v.sha.slice(0, 12)}…`)
    } else if (v.sha === local.sha) {
      ok(`deployment is serving ${v.sha.slice(0, 12)}… (matches ${local.ref}; source=${v.shaSource}, up ${v.uptimeSeconds}s)`)
    } else {
      fail(`COMMIT DRIFT: deployment serves ${v.sha.slice(0, 12)}… but ${local.ref} is ${local.sha.slice(0, 12)}… — the deploy did not ship what you think it shipped.`)
    }
  }
} catch (e) {
  fail(`/api/version unreachable: ${e.message}`)
}

// ── 2. App serves pages ─────────────────────────────────────────────────────
try {
  const res = await probe('/login')
  res.status === 200 ? ok('/login → 200') : fail(`/login → ${res.status} (expected 200)`)
} catch (e) {
  fail(`/login unreachable: ${e.message}`)
}

// ── 3. Auth gate is up ──────────────────────────────────────────────────────
try {
  const res = await probe('/api/itineraries')
  res.status === 401
    ? ok('/api/itineraries → 401 for anonymous (auth gate up)')
    : fail(`/api/itineraries → ${res.status} for anonymous — expected 401. ${res.status === 200 ? 'THE API IS OPEN TO THE INTERNET.' : ''}`)
} catch (e) {
  fail(`/api/itineraries unreachable: ${e.message}`)
}

console.log(failures === 0 ? '\nDeployment verified.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
