#!/usr/bin/env node
// ============================================
// What is actually in the client bundle — and who pays for it
// ============================================
// `npm run analyze` used to be `ANALYZE=true next build`, wrapping
// @next/bundle-analyzer. That plugin hooks `config.webpack`, and Next 16 builds
// this app with TURBOPACK — so the wrapper was never called. The build exited 0
// and wrote no report at all: no treemap, no warning, nothing. Worse, it is the
// escape hatch check-bundle-budget.mjs points you at when the budget fails, so
// the one tool for diagnosing a red CI silently did nothing (2026-09-14).
//
// This reads the built output directly instead, so it works under Turbopack and
// needs no build plugin:
//
//   npm run build && npm run analyze
//
// ── What it can and cannot tell you ─────────────────────────────────────────
// EXACT — which routes load a chunk before they are interactive, and every
// size. Both come from the build's own `.next/diagnostics/route-bundle-stats.json`
// and from gzipping the files on disk.
//
// A GUESS — which library is inside a chunk. Production chunks are minified with
// no module paths and no sourcemaps, so the only signal is a library naming
// itself in a string it happens to ship ("jspdf", "ProseMirror"). A chunk whose
// libraries do not name themselves prints "(no library signature)" rather than a
// plausible-looking guess: this file must never invent an answer it does not
// have. Treat the fingerprint as a lead to confirm, not a fact.
//
// The question worth asking is not "how big is this chunk" but "how many routes
// pay for it before the page works". A 130 KB PDF generator fetched on click
// costs nobody anything; 40 KB on all 171 routes is the real weight.

import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const CHUNKS_DIR = path.join(ROOT, '.next', 'static', 'chunks')
const ROUTE_STATS = path.join(ROOT, '.next', 'diagnostics', 'route-bundle-stats.json')

const args = process.argv.slice(2)
const topN = Number(args.find(a => /^--top=/.test(a))?.split('=')[1] ?? 15)
const asJson = args.includes('--json')

if (!fs.existsSync(CHUNKS_DIR)) {
  console.error('✗ .next/static/chunks not found — run `npm run build` first.')
  process.exit(1)
}

// ── Library fingerprints ────────────────────────────────────────────────────
// Generated from package.json so a new dependency is covered without editing
// this file, plus explicit patterns for libraries whose runtime strings differ
// from their package name. Names too short or too generic to be evidence are
// skipped — matching "react" or "next" inside minified code proves nothing.
// A scoped package is fingerprinted by its SCOPE, not its sub-path: reducing
// '@react-email/render' to 'render' matched essentially every chunk, and the
// first run of this script duly reported react-email inside jspdf. A token that
// matches everything is not evidence — it is noise wearing a library's name.
const GENERIC = new Set(['react', 'react-dom', 'next', 'zod', 'dotenv', 'pg', 'render', 'core', 'utilities', 'components'])
const EXPLICIT = {
  tiptap: /ProseMirror|tiptap/g,
  'react-pdf': /react-pdf/gi,
  'dnd-kit': /DndContext|dnd-kit/g,
  leaflet: /leaflet|L\.Icon/gi,
  papaparse: /papaparse|Papa\.parse/gi,
  dompurify: /DOMPurify/g,
}

function fingerprints() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const out = new Map(Object.entries(EXPLICIT))
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    // '@scope/thing' -> 'scope'; 'papaparse' -> 'papaparse'.
    const token = name.startsWith('@') ? name.slice(1).split('/')[0] : name
    if (GENERIC.has(token) || token.length < 5) continue
    if ([...out.keys()].includes(token)) continue
    out.set(token, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'))
  }
  return out
}

const FINGERPRINTS = fingerprints()
const MIN_HITS = 5 // one stray mention is not evidence a library is bundled

/** Which chunks each route loads before it is interactive. */
function routeStats() {
  try {
    const stats = JSON.parse(fs.readFileSync(ROUTE_STATS, 'utf8'))
    if (!Array.isArray(stats) || stats.length === 0) return null
    return stats
  } catch {
    return null
  }
}

const stats = routeStats()

const chunks = fs
  .readdirSync(CHUNKS_DIR)
  .filter(f => f.endsWith('.js'))
  .map(file => {
    const bytes = fs.readFileSync(path.join(CHUNKS_DIR, file))
    const source = bytes.toString('utf8')
    const libs = [...FINGERPRINTS]
      .map(([name, re]) => [name, (source.match(re) ?? []).length])
      .filter(([, n]) => n >= MIN_HITS)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
    return { file, gzip: zlib.gzipSync(bytes, { level: 9 }).length, libs, routes: 0 }
  })
  .sort((a, b) => b.gzip - a.gzip)

const byFile = new Map(chunks.map(c => [c.file, c]))

// Exact: straight from the build's own record of what each route pulls up front.
if (stats) {
  for (const route of stats) {
    for (const p of route.firstLoadChunkPaths ?? []) {
      const chunk = byFile.get(path.basename(p))
      if (chunk) chunk.routes++
    }
  }
}

const totalGzip = chunks.reduce((s, c) => s + c.gzip, 0)
const routeCount = stats?.length ?? 0
// The shared baseline: chunks EVERY route loads. This is what a visitor pays
// before their page's own code, and the number worth defending.
const baseline = stats ? chunks.filter(c => c.routes === routeCount) : []
const baselineGzip = baseline.reduce((s, c) => s + c.gzip, 0)
const onDemandGzip = stats ? chunks.filter(c => c.routes === 0).reduce((s, c) => s + c.gzip, 0) : 0

const kb = n => `${(n / 1024).toFixed(1)} KB`

if (asJson) {
  console.log(JSON.stringify({ totalGzip, baselineGzip, onDemandGzip, routeCount, chunks }, null, 2))
  process.exit(0)
}

console.log(`Client JS: ${kb(totalGzip)} gzipped across ${chunks.length} files`)
if (!stats) {
  // Fail loud, never silently pretend the per-route numbers are known — the
  // whole point of this script is that a quiet no-op is worse than an error.
  console.log('\n⚠ .next/diagnostics/route-bundle-stats.json not found — cannot tell')
  console.log('  first-load from on-demand. Sizes below are still exact.\n')
} else {
  console.log(`Every one of the ${routeCount} routes loads: ${kb(baselineGzip)} (${baseline.length} shared chunks)`)
  console.log(`Fetched only on demand:                ${kb(onDemandGzip)}`)
  console.log('\nThat first number is what a visitor pays before their page works.')
}

console.log(`\nTop ${Math.min(topN, chunks.length)} chunks`)
console.log(`${'size'.padStart(10)}  ${'loaded by'.padEnd(16)}  contents`)
for (const c of chunks.slice(0, topN)) {
  const where = !stats
    ? ''
    : c.routes === 0
      ? 'on demand'
      : c.routes === routeCount
        ? `ALL ${routeCount} routes`
        : `${c.routes} of ${routeCount} routes`
  console.log(
    `${kb(c.gzip).padStart(10)}  ${where.padEnd(16)}  ${c.libs.slice(0, 3).join(', ') || '(no library signature)'}`
  )
}

if (stats) {
  // A route far above the pack is usually one heavy import away from the rest.
  const heaviest = stats
    .map(r => ({
      route: r.route,
      gzip: (r.firstLoadChunkPaths ?? []).reduce((s, p) => s + (byFile.get(path.basename(p))?.gzip ?? 0), 0),
    }))
    .sort((a, b) => b.gzip - a.gzip)
    .slice(0, 10)
  console.log('\nHeaviest routes (first load, gzipped)')
  for (const r of heaviest) console.log(`${kb(r.gzip).padStart(10)}  ${r.route}`)
}

console.log('\nSizes and route counts are exact. Library names are fingerprints from')
console.log('strings in minified code — a lead to confirm, not proof.')
console.log('Budgets and pass/fail live in `npm run check:bundle`.')
