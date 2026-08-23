#!/usr/bin/env node
// ============================================
// Lint ratchet — per rule, so debt cannot be swapped
// ============================================
// The codebase has too much standing lint debt for a blocking gate
// (16,899 problems on 2026-07-14), so this ratchets instead: CI fails only
// if a rule's error or warning count EXCEEDS the committed baseline.
//
//   npm run lint:ratchet              # check against scripts/lint-baseline.json
//   npm run lint:ratchet -- --update  # re-baseline to current counts
//
// WHY PER RULE, NOT PER TOTAL
// ---------------------------
// This gate used to compare two integers: total errors and total warnings.
// That cannot see WHICH rule fired, so deleting one `no-explicit-any` paid
// for introducing one `react-hooks/rules-of-hooks` — a hook called
// conditionally, which crashes the page with "rendered fewer hooks than
// expected" — and the ratchet still reported OK.
//
// That was not hypothetical. On 2026-08-23 the baseline read exactly
// 1553/581 and passed, while two rules-of-hooks errors sat inside the
// total. One was a real conditional useState in the content-library editor.
//
// A count is not a measurement if it cannot say what it counted. Baselines
// are now per rule: a rule may shrink freely, and may never grow.
//
// The baseline may only ever be lowered by --update after real fixes;
// raising it by hand defeats the purpose and should be rejected in review.

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const BASELINE_PATH = path.join(ROOT, 'scripts', 'lint-baseline.json')

// Rules that must always be zero, whatever the baseline says. These do not
// describe style debt — each one means the code is already broken:
//
//   react-hooks/rules-of-hooks — a conditional or misplaced hook. React
//   throws on the render where the hook count changes, so the page white-
//   screens. There is no such thing as an acceptable standing count.
//
// A rule belongs here only if firing it means something is broken at
// runtime, not merely untidy.
const ZERO_TOLERANCE = ['react-hooks/rules-of-hooks']

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

// Tally by rule. A message with no ruleId is a parse/config failure; those
// are grouped under a reserved key so a file that silently stops being
// linted at all cannot pass as "no problems found".
const RULELESS = '(no rule — parse or config error)'
const rules = {}
const filesByRule = {}
let fatal = 0

for (const f of results) {
  fatal += f.fatalErrorCount || 0
  for (const m of f.messages) {
    const id = m.ruleId || RULELESS
    rules[id] ??= { errors: 0, warnings: 0 }
    if (m.severity === 2) rules[id].errors++
    else rules[id].warnings++
    ;(filesByRule[id] ??= new Set()).add(
      `${path.relative(ROOT, f.filePath)}:${m.line}`
    )
  }
}

const totals = Object.values(rules).reduce(
  (a, r) => ({ errors: a.errors + r.errors, warnings: a.warnings + r.warnings }),
  { errors: 0, warnings: 0 }
)

const current = {
  totals,
  rules: Object.fromEntries(
    Object.entries(rules).sort(([a], [b]) => a.localeCompare(b))
  ),
}

if (process.argv.includes('--update')) {
  const blocked = ZERO_TOLERANCE.filter((r) => rules[r])
  if (blocked.length) {
    console.error(
      `✗ Refusing to baseline a zero-tolerance rule: ${blocked.join(', ')}.\n` +
        '  These crash pages at runtime — fix the code, do not record it as debt.'
    )
    for (const r of blocked) for (const loc of filesByRule[r]) console.error(`    ${loc}`)
    process.exit(1)
  }
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + '\n')
  console.log(
    `Baseline updated: ${totals.errors} errors, ${totals.warnings} warnings ` +
      `across ${Object.keys(rules).length} rules.`
  )
  process.exit(0)
}

if (!fs.existsSync(BASELINE_PATH)) {
  console.error(`✗ No baseline at ${BASELINE_PATH}. Create one: npm run lint:ratchet -- --update`)
  process.exit(1)
}

const baselineRaw = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
if (!baselineRaw.rules) {
  console.error(
    '✗ Baseline is in the old totals-only format, which cannot detect a rule\n' +
      '  being swapped for another. Re-baseline once: npm run lint:ratchet -- --update'
  )
  process.exit(1)
}
const baseline = baselineRaw.rules

console.log(
  `Current:  ${totals.errors} errors, ${totals.warnings} warnings ` +
    `across ${Object.keys(rules).length} rules`
)
console.log(
  `Baseline: ${baselineRaw.totals.errors} errors, ${baselineRaw.totals.warnings} warnings ` +
    `across ${Object.keys(baseline).length} rules`
)

let failed = false

// 1. Zero-tolerance rules — independent of the baseline entirely.
for (const rule of ZERO_TOLERANCE) {
  const hit = rules[rule]
  if (!hit) continue
  failed = true
  const n = hit.errors + hit.warnings
  console.error(`\n✗ ${rule}: ${n} occurrence(s) — must be zero.`)
  console.error('  A hook called conditionally crashes the page it is on.')
  for (const loc of filesByRule[rule]) console.error(`    ${loc}`)
}

// 2. A file that fails to parse is not linted at all — its problems vanish
//    from the count rather than being reported.
if (fatal > 0) {
  failed = true
  console.error(`\n✗ ${fatal} file(s) failed to parse — those files are not being linted.`)
}

// 3. Per-rule growth. A rule absent from the baseline has an implicit zero,
//    so a newly introduced rule fails on its first occurrence.
const grown = []
for (const [rule, cur] of Object.entries(rules)) {
  const base = baseline[rule] ?? { errors: 0, warnings: 0 }
  if (cur.errors > base.errors) grown.push([rule, 'errors', base.errors, cur.errors])
  if (cur.warnings > base.warnings) grown.push([rule, 'warnings', base.warnings, cur.warnings])
}

if (grown.length) {
  failed = true
  console.error('\n✗ These rules grew:')
  for (const [rule, kind, was, now] of grown) {
    console.error(`    ${rule} — ${kind} ${was} → ${now}`)
    for (const loc of [...filesByRule[rule]].slice(0, 5)) console.error(`      ${loc}`)
    if (filesByRule[rule].size > 5) console.error(`      … ${filesByRule[rule].size - 5} more`)
  }
  console.error('\n  Fix the new ones: npx eslint <changed files>')
}

if (!failed) {
  const shrunk = Object.entries(baseline).filter(([rule, base]) => {
    const cur = rules[rule] ?? { errors: 0, warnings: 0 }
    return cur.errors < base.errors || cur.warnings < base.warnings
  })
  if (shrunk.length) {
    console.log(`\n↓ ${shrunk.length} rule(s) went DOWN — lock it in:`)
    console.log('  npm run lint:ratchet -- --update  (commit the baseline)')
  }
}

console.log(failed ? '\nLint ratchet FAILED.' : '\nLint ratchet OK.')
process.exit(failed ? 1 : 0)
