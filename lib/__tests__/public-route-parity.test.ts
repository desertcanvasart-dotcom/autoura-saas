import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// ============================================================================
// Two lists decide whether a page is public, and they are in different files:
//   middleware.ts   publicRoutes  → ACCESS (can an anonymous visitor load it)
//   app/layout.tsx  publicPages   → CHROME (does the operator's sidebar show)
//
// The share page passed the first and failed the second, so a traveller opening
// their itinerary got the operator's dashboard navigation wrapped around it —
// working, but wrong, and invisible to every test that only checked the data.
// This pins the pairing so the next public route cannot repeat it.
// ============================================================================

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8')

describe('customer-facing routes are public in BOTH senses', () => {
  const middleware = read('middleware.ts')
  // The chrome list moved from app/layout.tsx to app/ClientShell.tsx when the
  // root layout became a server component (so the site can export metadata).
  const layout = read('app/ClientShell.tsx')

  it('/share is access-public in the middleware', () => {
    expect(middleware).toContain("'/share'")
  })

  it('/share is chrome-free in the client shell', () => {
    expect(layout).toContain("pathname.startsWith('/share/')")
  })

  it('every marketing route public in one is public in the other', () => {
    // These are pages a signed-out visitor lands on; a sidebar there is a bug.
    // /pricing used to be exempted here as "marketing-only" — which is exactly
    // how it shipped rendering the operator sidebar to logged-in visitors.
    // No exemptions: access-public ⇒ chrome-free.
    for (const route of ['/login', '/signup', '/pricing', '/privacy', '/terms', '/contact', '/about', '/integrations']) {
      const inMiddleware = middleware.includes(`'${route}'`)
      const inLayout = layout.includes(`'${route}'`)
      if (inMiddleware) {
        expect(inLayout, `${route} is access-public but still renders app chrome`).toBe(true)
      }
    }
  })
})
