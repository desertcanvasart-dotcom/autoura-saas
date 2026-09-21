// Reported from production, 2026-09-21: a bare "0" under the totals in the B2B
// calculator. `{result.single_supplement && result.single_supplement > 0 && (`
// — when the supplement is 0, `0 && …` IS 0, and React prints a number.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const PAGE = readFileSync(join(process.cwd(), 'app/b2b/calculator/[id]/page.tsx'), 'utf8')

describe('the calculator never prints a stray number', () => {
  it.each(['single_supplement', 'tour_leader_cost', 'num_paying_pax'])('%s is compared, not used as the condition', field => {
    // `{… result.x && (` opens a JSX block on the raw number.
    expect(PAGE).not.toMatch(new RegExp(`result\\.${field} && \\(`))
  })

  it('the supplement still shows when there is one', () => {
    expect(PAGE).toMatch(/typeof result\.single_supplement === 'number' && result\.single_supplement > 0 && \(/)
  })
})
