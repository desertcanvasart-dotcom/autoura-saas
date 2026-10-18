// POST /api/csp-report — where browsers send Content-Security-Policy
// violations (lib/security/csp.js). Public by necessity: a violation can
// happen on a page with no session (the marketing site, a share link).
// Per-IP rate limited; it only ever logs, and each distinct violation
// (directive + blocked origin) is logged at most once an hour per server.

import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit'
import { summariseCspReport, shouldLogCspViolation } from '@/lib/security/csp-report'

export async function POST(request: NextRequest) {
  const rl = checkRateLimit(getClientIdentifier(request), 'contact')
  if (!rl.success) return new NextResponse(null, { status: 204 })

  let body: unknown = null
  try {
    const text = await request.text()
    if (text.length <= 20_000) body = JSON.parse(text)
  } catch {
    // Not JSON: nothing to log.
  }
  const summary = summariseCspReport(body)
  if (summary && shouldLogCspViolation(summary)) {
    console.warn(JSON.stringify({ level: 'warn', event: 'csp_violation', ...summary }))
  }
  return new NextResponse(null, { status: 204 })
}
