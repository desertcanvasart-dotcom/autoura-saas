import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// On a phone, a finance table inside an overflow-hidden card lost its right
// columns (amounts, status, actions) with no way to scroll to them.
const PAGES = [
  'app/invoices/[id]/page.tsx', 'app/invoices/invoices-content.tsx', 'app/payments/page.tsx',
  'app/receipts/page.tsx', 'app/accounts-receivable/page.tsx', 'app/accounts-payable/page.tsx',
  'app/expenses/page.tsx', 'app/reports/_views/FinanceView.tsx', 'app/profit-loss/page.tsx',
  'app/commissions/page.tsx',
]

describe('finance tables scroll sideways on small screens', () => {
  for (const p of PAGES) {
    it(p, () => {
      const lines = readFileSync(join(process.cwd(), p), 'utf8').split('\n')
      lines.forEach((l, i) => {
        if (!/^\s*<table\b/.test(l)) return
        const above = lines.slice(Math.max(0, i - 3), i).join('\n')
        expect(above, `${p}:${i + 1}`).toMatch(/overflow-x-auto|overflow-auto/)
      })
    })
  }
})
