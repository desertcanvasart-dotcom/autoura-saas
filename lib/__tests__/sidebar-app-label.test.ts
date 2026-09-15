import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ============================================================================
// The sidebar header is the white-label slot: it shows the tenant's own
// company name. A build tag next to it ("SaaS", telling this getautoura.net
// app apart from the autoura.net "Autoura Ops" one) is for US, and must not
// follow a paying agency into production.
// ============================================================================

const src = fs.readFileSync(
  path.join(process.cwd(), 'components/Sidebar.tsx'),
  'utf8'
)

// Assertions about absence must look at code, not at the comment explaining it.
const code = src
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
  })
  .join('\n')

describe('the build tag never reaches a production tenant', () => {
  it('is gated on the environment, not hardcoded', () => {
    expect(code).toContain("process.env.NODE_ENV !== 'production' ? 'SaaS' : ''")
  })

  it('renders through the gate, not as a literal', () => {
    // A bare <span>SaaS</span> in the JSX would sail past the check above.
    expect(code).not.toMatch(/>\s*SaaS\s*</)
    expect(code).toContain('{APP_LABEL}')
  })

  it('can still be switched on deliberately somewhere else', () => {
    // A staging deploy should be able to show it without a code change.
    expect(code).toContain('process.env.NEXT_PUBLIC_APP_LABEL')
  })

  it('does not render an empty tag when there is nothing to show', () => {
    expect(code).toContain('(tenant || APP_LABEL)')
  })
})
