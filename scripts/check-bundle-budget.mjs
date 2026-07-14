#!/usr/bin/env node
// ============================================
// Bundle budget — client JS can't silently balloon
// ============================================
// Measures the gzipped client JavaScript in .next/static after `next build`
// and fails if it exceeds the budgets below. Catches the classic Next.js
// regression: one import pulls a heavy dependency (puppeteer-adjacent code,
// recharts, jspdf, @react-pdf/renderer are all in this app's dependency
// tree) into a client chunk and every page pays for it.
//
//   npm run build && npm run check:bundle
//
// To investigate an overage: npm run analyze (bundle-analyzer treemap).
// Budgets are deliberate headroom (~20%) over the 2026-07-14 measurement —
// raise them only for justified growth, in the same PR that causes it.

import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const STATIC_DIR = path.join(ROOT, '.next', 'static')

// ── Budgets (gzipped bytes) ──────────────────────────────────────────────────
// Measured 2026-07-14: total 1697 KB gzip, largest chunk 130 KB gzip.
const BUDGETS = {
  totalJsGzip: 2048 * 1024, // 2 MB
  largestChunkGzip: 160 * 1024, // 160 KB
}

if (!fs.existsSync(STATIC_DIR)) {
  console.error('✗ .next/static not found — run `npm run build` first.')
  process.exit(1)
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name)
    return e.isDirectory() ? walk(full) : [full]
  })
}

const jsFiles = walk(STATIC_DIR).filter(f => f.endsWith('.js'))
const sized = jsFiles
  .map(f => ({
    file: path.relative(STATIC_DIR, f),
    gzip: zlib.gzipSync(fs.readFileSync(f), { level: 9 }).length,
  }))
  .sort((a, b) => b.gzip - a.gzip)

const totalGzip = sized.reduce((s, f) => s + f.gzip, 0)
const largest = sized[0]

const kb = n => `${(n / 1024).toFixed(1)} KB`
console.log(`Client JS (gzipped): ${kb(totalGzip)} across ${sized.length} files`)
console.log('Largest chunks:')
for (const f of sized.slice(0, 5)) console.log(`  ${kb(f.gzip).padStart(10)}  ${f.file}`)

let failed = false
function check(name, actual, budget) {
  if (budget == null) {
    console.log(`  (no budget set for ${name} — calibration run)`)
    return
  }
  if (actual > budget) {
    console.error(`✗ ${name}: ${kb(actual)} exceeds budget ${kb(budget)}`)
    failed = true
  } else {
    console.log(`✓ ${name}: ${kb(actual)} within budget ${kb(budget)}`)
  }
}

check('total gzipped JS', totalGzip, BUDGETS.totalJsGzip)
check('largest chunk (gzipped)', largest.gzip, BUDGETS.largestChunkGzip)

console.log(failed ? '\nBundle budget FAILED — run `npm run analyze` to see what grew.' : '\nBundle budget OK.')
process.exit(failed ? 1 : 0)
