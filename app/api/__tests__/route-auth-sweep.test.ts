import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ============================================================================
// Route-auth sweep — locks the invariant the 2026-07 audit restored by hand.
//
// The audit found ~44 API routes reachable without auth; the fix was the
// centralised middleware gate (every /api/* without a session → 401, except a
// small self-auth allowlist). Nothing prevented recurrence: a new route is
// protected only as long as the gate and its allowlist stay correct.
//
// This test enumerates EVERY app/api/**/route.ts on disk and runs its URL
// through the real middleware with an anonymous session:
//   1. Non-allowlisted route  → middleware must answer 401.
//   2. Allowlisted route      → its handler must contain the self-auth
//      mechanism registered below (signature check, CRON_SECRET, …).
//   3. The allowlist itself must match this file's copy — growing it fails
//      the sweep until the new entry's self-auth proof is registered here.
// A brand-new unauthenticated route therefore CANNOT merge silently.
// ============================================================================

// Anonymous session: middleware sees no user. from() should never be reached
// for API routes; throwing makes any unexpected reach loud.
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => {
      throw new Error('middleware touched the DB for an anonymous API request')
    },
  }),
}))

// Env the middleware dereferences with `!` — values are never used because
// the client is mocked.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'https://example.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= 'anon-key'

import { middleware, SELF_AUTH_API_PREFIXES } from '@/middleware'
import { NextRequest } from 'next/server'

const ROOT = path.resolve(__dirname, '../../..')
const API_DIR = path.join(ROOT, 'app/api')

// Every self-auth mechanism must be provable in the handler source. Marker =
// a string the route file (or a lib file it imports) must contain. `null` =
// public/pre-session by design, nothing to prove.
const SELF_AUTH_PROOF: Record<string, string[] | null> = {
  '/api/webhooks/': ['verifyConciergeSignature'],
  '/api/integrations/': ['SAWA_SYNC_SECRET'],
  '/api/auth/': null, // OAuth callbacks / pre-session by nature (state verified in-handler)
  '/api/cron/': ['CRON_SECRET'],
  '/api/version': null, // sha + uptime only, public by design
  '/api/health': null, // pass/fail + latency only, public by design
  '/api/billing/webhook': ['verifyWebhookSignature', 'stripe-signature'],
  '/api/whatsapp/webhook': ['validateRequest'],
  '/api/whatsapp/status-callback': ['validateRequest'],
  // The invitee has no session yet — the secret invitation_token IS the
  // credential, and both handlers look the row up by it.
  '/api/invitations/verify': ['invitation_token'],
  '/api/invitations/accept': ['invitation_token'],
}

/** All route.ts files under app/api, as URL paths with dummy dynamic params. */
function discoverApiPaths(): { urlPath: string; file: string }[] {
  const out: { urlPath: string; file: string }[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'route.ts') {
        const rel = path.relative(path.join(ROOT, 'app'), path.dirname(full))
        const urlPath =
          '/' +
          rel
            .split(path.sep)
            .filter(seg => !(seg.startsWith('(') && seg.endsWith(')'))) // route groups
            .map(seg =>
              seg.startsWith('[...') || seg.startsWith('[[...')
                ? 'a/b' // catch-all
                : seg.startsWith('[')
                  ? 'test-param' // dynamic segment
                  : seg
            )
            .join('/')
        out.push({ urlPath, file: full })
      }
    }
  }
  walk(API_DIR)
  return out
}

const routes = discoverApiPaths()
const isAllowlisted = (p: string) =>
  SELF_AUTH_API_PREFIXES.some(prefix => p.startsWith(prefix))

describe('route-auth sweep', () => {
  it('found a realistic number of API routes (discovery is not broken)', () => {
    expect(routes.length).toBeGreaterThan(250)
  })

  it('the middleware allowlist matches the registered self-auth proofs exactly', () => {
    expect([...SELF_AUTH_API_PREFIXES].sort()).toEqual(
      Object.keys(SELF_AUTH_PROOF).sort()
    )
  })

  describe('anonymous requests are rejected by the middleware gate', () => {
    const protectedRoutes = routes.filter(r => !isAllowlisted(r.urlPath))

    it.each(protectedRoutes.map(r => [r.urlPath] as const))(
      '%s → 401',
      async urlPath => {
        const res = await middleware(
          new NextRequest(`http://localhost${urlPath}`)
        )
        expect(res.status).toBe(401)
        expect(await res.json()).toMatchObject({ success: false })
      }
    )
  })

  describe('allowlisted routes self-authenticate in the handler', () => {
    const allowlisted = routes.filter(r => isAllowlisted(r.urlPath))

    it('the allowlist is actually in use (some routes match it)', () => {
      expect(allowlisted.length).toBeGreaterThan(0)
    })

    it.each(allowlisted.map(r => [r.urlPath, r.file] as const))(
      '%s passes the gate and proves its own auth',
      async (urlPath, file) => {
        // Middleware lets it through (it must not 401 — that would break
        // Stripe/Twilio/cron callers that can never hold a session).
        const res = await middleware(
          new NextRequest(`http://localhost${urlPath}`)
        )
        expect(res.status).not.toBe(401)

        // The registered proof marker appears in the handler source.
        const prefix = Object.keys(SELF_AUTH_PROOF).find(p =>
          urlPath.startsWith(p)
        )!
        const markers = SELF_AUTH_PROOF[prefix]
        if (markers) {
          const src = fs.readFileSync(file, 'utf8')
          expect(
            markers.some(m => src.includes(m)),
            `${path.relative(ROOT, file)} is allowlisted as self-authenticating ` +
              `but contains none of its proof markers [${markers.join(', ')}] — ` +
              `it may be reachable by the whole internet with no auth at all.`
          ).toBe(true)
        }
      }
    )
  })
})
