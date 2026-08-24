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
//
// ── Why "largest chunk" is measured on FIRST LOAD (2026-08-25) ──────────────
// The rule above says "every page pays for it", and that is the actual cost
// being guarded: bytes a visitor downloads before the page is usable. The
// check originally took the largest file in .next/static, first-load or not,
// and those are not the same thing.
//
// Next 16.3's chunking put pdf-lib — needed by exactly one route, only after
// the user clicks Download — into a single 176 KB chunk, and the check failed
// on it while every page's actual first load was unchanged. Moving that import
// behind `await import()` fixed the real cost and the number did not move,
// because the file still existed on disk. A guard that cannot tell "shipped to
// everyone" from "fetched on click" cannot tell you whether a fix worked.
//
// So the 160 KB rule now applies to the largest chunk that any route loads up
// front, which is the thing worth defending. Lazily-loaded code has NOT escaped
// scrutiny: it still counts in full toward the total budget, and a second,
// deliberately generous per-file cap catches a runaway on-demand chunk.

import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const STATIC_DIR = path.join(ROOT, '.next', 'static')

// ── Budgets (gzipped bytes) ──────────────────────────────────────────────────
// Measured 2026-07-14: total 1697 KB gzip, largest chunk 130 KB gzip.
const BUDGETS = {
  totalJsGzip: 2048 * 1024, // 2 MB
  largestFirstLoadChunkGzip: 160 * 1024, // 160 KB — bytes before a page is usable
  // Backstop for code loaded on demand. Deliberately loose: this is not a page
  // load, so it does not deserve the same 160 KB. It exists so a single
  // runaway lazy chunk still fails loudly instead of hiding inside the 2 MB
  // total.
  largestAnyChunkGzip: 256 * 1024, // 256 KB
}

// Which chunks a route pulls before it is interactive. Written by `next build`;
// if a future Next drops or renames it, fall back to treating every chunk as
// first-load — the old, stricter behaviour. Failing safe means over-reporting,
// never silently passing.
const ROUTE_STATS = path.join(ROOT, '.next', 'diagnostics', 'route-bundle-stats.json')

function firstLoadChunkFiles() {
  try {
    const stats = JSON.parse(fs.readFileSync(ROUTE_STATS, 'utf8'))
    const paths = new Set()
    for (const route of stats) {
      for (const p of route.firstLoadChunkPaths || []) paths.add(path.basename(p))
    }
    return paths.size ? paths : null
  } catch {
    return null
  }
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

const firstLoad = firstLoadChunkFiles()
const isFirstLoad = f => (firstLoad ? firstLoad.has(path.basename(f.file)) : true)
const largestFirstLoad = sized.find(isFirstLoad) || largest

const kb = n => `${(n / 1024).toFixed(1)} KB`
console.log(`Client JS (gzipped): ${kb(totalGzip)} across ${sized.length} files`)
if (!firstLoad) {
  console.log('(route-bundle-stats.json not found — treating every chunk as first-load)')
}
console.log('Largest chunks:')
for (const f of sized.slice(0, 5)) {
  const tag = firstLoad ? (isFirstLoad(f) ? 'first-load' : 'on-demand ') : ''
  console.log(`  ${kb(f.gzip).padStart(10)}  ${tag}  ${f.file}`)
}

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
check(
  `largest first-load chunk (gzipped) [${largestFirstLoad.file}]`,
  largestFirstLoad.gzip,
  BUDGETS.largestFirstLoadChunkGzip
)
check(
  `largest chunk of any kind (gzipped) [${largest.file}]`,
  largest.gzip,
  BUDGETS.largestAnyChunkGzip
)

console.log(failed ? '\nBundle budget FAILED — run `npm run analyze` to see what grew.' : '\nBundle budget OK.')
process.exit(failed ? 1 : 0)
