#!/usr/bin/env node
// ============================================
// Lint ratchet — debt can shrink, never grow
// ============================================
// The codebase has too much standing lint debt for a blocking gate
// (16,899 problems on 2026-07-14), so this ratchets instead: CI fails only
// if the error or warning count EXCEEDS the committed baseline. When you
// pay debt down, tighten the ratchet so it can't come back:
//
//   npm run lint:ratchet            # check against scripts/lint-baseline.json
//   npm run lint:ratchet -- --update  # re-baseline to current counts
//
// The baseline may only ever be lowered by --update after real fixes;
// raising it by hand defeats the purpose and should be rejected in review.

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const BASELINE_PATH = path.join(ROOT, 'scripts', 'lint-baseline.json')

function runEslintJson() {
  // eslint exits 1 when errors exist — that's expected, the JSON on stdout
  // is still complete.
  try {
    return execSync('npx eslint --format json', {
      cwd: ROOT,
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).toString()
  } catch (e) {
    if (e.stdout && e.stdout.length > 0) return e.stdout.toString()
    console.error('✗ eslint failed to produce output:', e.stderr?.toString() || e.message)
    process.exit(1)
  }
}

console.log('Running eslint (full project)...')
const results = JSON.parse(runEslintJson())
const current = results.reduce(
  (acc, f) => {
    acc.errors += f.errorCount + f.fatalErrorCount
    acc.warnings += f.warningCount
    return acc
  },
  { errors: 0, warnings: 0 }
)

if (process.argv.includes('--update')) {
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n')
  console.log(`Baseline updated: ${current.errors} errors, ${current.warnings} warnings.`)
  process.exit(0)
}

if (!fs.existsSync(BASELINE_PATH)) {
  console.error(`✗ No baseline at ${BASELINE_PATH}. Create one: npm run lint:ratchet -- --update`)
  process.exit(1)
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
console.log(`Current:  ${current.errors} errors, ${current.warnings} warnings`)
console.log(`Baseline: ${baseline.errors} errors, ${baseline.warnings} warnings`)

let failed = false
if (current.errors > baseline.errors) {
  console.error(`✗ Lint errors grew by ${current.errors - baseline.errors} — fix the new ones (npx eslint <changed files>).`)
  failed = true
}
if (current.warnings > baseline.warnings) {
  console.error(`✗ Lint warnings grew by ${current.warnings - baseline.warnings} — fix the new ones.`)
  failed = true
}

if (!failed && (current.errors < baseline.errors || current.warnings < baseline.warnings)) {
  console.log('↓ Debt went DOWN — lock it in: npm run lint:ratchet -- --update (commit the baseline)')
}

console.log(failed ? '\nLint ratchet FAILED.' : '\nLint ratchet OK.')
process.exit(failed ? 1 : 0)
