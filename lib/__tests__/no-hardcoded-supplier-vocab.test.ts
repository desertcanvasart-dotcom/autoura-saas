// A rates form must not hardcode a list of companies the suppliers table owns.
//
// Supplier-HAS-properties landed here as migrations 311/312/313 and a resolver
// wired into all eight rate routes — but for TRAINS the form never followed.
// train_rates.property_id existed, resolveRateProperty('train') existed, and
// the form offered neither a supplier nor a train: `supplier_id` appeared once
// in the file, as a type annotation. The fleet was unreachable from the only
// screen that needed it.
//
// What sat there instead was:
//
//   const OPERATORS = ['Egyptian National Railways (ENR)',
//                      'Spanish Trains (Talgo)', 'Private Operator']
//
// which is not merely stale. It teaches the WRONG MODEL: it offers "Spanish
// Trains (Talgo)" as an OPERATOR when, in the model the tenant fills in on the
// supplier's Properties tab, Talgo is one of ENR's TRAINS (operator, 1 Sep).
//
// The rule: the roster lives in `suppliers`, the fleet lives in
// `supplier_properties`, and a form reads them. It does not carry its own copy.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = join(__dirname, '..', '..')

// Known exception, tracked rather than hidden. The flights form DOES have a
// supplier select, but its AIRLINES entries carry an IATA `code` used to build
// flight numbers, and `suppliers` has nowhere to put one — so replacing the
// list is a feature, not a rename. The second test below fails the moment that
// reason stops being true. Remove the entry then; do not add to it.
const KNOWN_UNMIGRATED = new Set(['app/rates/flights/flights-content.tsx'])

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return out }
  for (const e of entries) {
    if (e === 'node_modules' || e === '.next' || e.startsWith('.')) continue
    const full = join(dir, e)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx$/.test(e)) out.push(full)
  }
  return out
}

describe('no hardcoded supplier vocabulary', () => {
  it('no rates form carries its own list of operators, carriers or airlines', () => {
    const violations: string[] = []
    for (const file of walk(join(ROOT, 'app', 'rates'))) {
      const rel = file.replace(ROOT + '/', '')
      if (KNOWN_UNMIGRATED.has(rel)) continue
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(
        /const\s+([A-Z_]*(?:OPERATOR|AIRLINE|CARRIER|COMPANY)[A-Z_]*)\s*(?::[^=]+)?=\s*\[/g
      )) {
        const line = src.slice(0, m.index!).split('\n').length
        violations.push(`${rel}:${line} — const ${m[1]} = [...] hardcodes what the suppliers table owns`)
      }
    }
    expect(
      violations,
      'Read the roster from /api/suppliers?type=… and the fleet from ' +
        '/api/suppliers/:id/properties. A form-local list goes stale silently and, ' +
        'worse, invents entities that contradict the supplier model.'
    ).toEqual([])
  })

  it('the flights exemption still has the reason it claims', () => {
    // The exemption rests on one fact: AIRLINES carries an IATA code that the
    // form turns into a flight number. If that stops being true the list is a
    // plain roster copy and the exemption has to go.
    const src = readFileSync(join(ROOT, 'app/rates/flights/flights-content.tsx'), 'utf8')
    expect(
      src.includes('?.code || airline.substring(0, 2).toUpperCase()'),
      'flights no longer derives a code from AIRLINES — drop it from KNOWN_UNMIGRATED and read the roster from /api/suppliers'
    ).toBe(true)
  })

  it('a train rate form can name both the operator and the train', () => {
    // The half-ported state this replaced: a database and an API that could
    // link a train, and a form with no way to say which.
    for (const rel of [
      'app/rates/trains/train-rates-content.tsx',
      'app/rates/sleeping-train/sleeping-train-rates-content.tsx',
    ]) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      expect(src, `${rel} must offer the operator roster`).toContain("/api/suppliers?status=active")
      expect(src, `${rel} must offer the operator's fleet`).toContain("properties?type=train")
      expect(src, `${rel} must submit the chosen train`).toContain('property_id')
    }
  })

  it('a train form does not offer an operator field at all', () => {
    // Deriving it in the form was still wrong: it filled only when the
    // supplier SELECTION CHANGED, so opening a rate that already had a
    // supplier showed a placeholder and saved null back over it. The supplier
    // IS the operator, so the form names it once and the server stamps the
    // denormalized column.
    for (const rel of [
      'app/rates/trains/train-rates-content.tsx',
      'app/rates/sleeping-train/sleeping-train-rates-content.tsx',
    ]) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      expect(
        /name="operator_name"|Set from the operator above/.test(src),
        `${rel} must not render an operator control — the supplier names it`
      ).toBe(false)
    }
  })

  it('every train rate write derives operator_name from the supplier', () => {
    // A denormalized column the client can set is a column that drifts.
    for (const rel of [
      'app/api/rates/trains/route.ts',
      'app/api/rates/trains/[id]/route.ts',
      'app/api/rates/sleeping-trains/route.ts',
      'app/api/rates/sleeping-trains/[id]/route.ts',
    ]) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      expect(src, `${rel} must stamp operator_name from the supplier`).toContain('operatorNameForSupplier')
      expect(
        /operator_name\s*[:=]\s*body\.operator_name/.test(src),
        `${rel} takes operator_name straight from the client — derive it instead`
      ).toBe(false)
    }
  })

  it('every screen that lists train rates names the train', () => {
    // The link kept being stored and never shown: it reached the trains page
    // first and was still missing from the rates hub, where a train rate was
    // listed with only its operator — so a fleet could be recorded, linked,
    // and still invisible on the screen opened first.
    for (const rel of ['app/rates/trains/train-rates-content.tsx', 'app/rates/page.tsx']) {
      const src = readFileSync(join(ROOT, rel), 'utf8')
      expect(
        src.includes('property_name'),
        `${rel} lists train rates without naming which train each one prices`
      ).toBe(true)
    }
  })
})
