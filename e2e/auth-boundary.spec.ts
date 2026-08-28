import { test, expect } from '@playwright/test'

// ============================================
// The auth boundary, as the running server enforces it
// ============================================
// Unit tests read the allowlist out of middleware.ts. These make real
// requests, so they also catch the case that source-reading cannot: a
// middleware that does not run at all for a path.

test.describe('anonymous visitors', () => {
  for (const path of ['/dashboard', '/itineraries', '/rates', '/bookings', '/settings']) {
    test(`${path} redirects to the login page`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login/)
    })
  }

  for (const path of ['/login', '/signup']) {
    test(`${path} renders`, async ({ page }) => {
      const response = await page.goto(path)
      expect(response?.status()).toBeLessThan(400)
      // A rendered auth page, not a Next error overlay.
      await expect(page.locator('body')).not.toContainText('Application error')
    })
  }
})

test.describe('protected API routes', () => {
  // 401 JSON, never a redirect and never a 500: the caller is an API client.
  for (const path of ['/api/itineraries', '/api/rates', '/api/bookings', '/api/invitations']) {
    test(`${path} answers 401 with a JSON body`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.status()).toBe(401)
      expect(res.headers()['content-type']).toContain('application/json')
      expect(await res.json()).toMatchObject({ success: false })
    })
  }
})

test.describe('self-authenticating routes are reachable without a session', () => {
  // The invite flow died once because a token-authenticated endpoint sat
  // behind the session gate: every invitation link answered "invalid".
  // Reachable means NOT 401 — the handler gets to judge the token itself.
  test('the portal API judges its own token rather than 401ing', async ({ request }) => {
    const res = await request.post('/api/portal/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/verify', {
      data: { answer: 'nobody' },
      failOnStatusCode: false,
    })
    expect(res.status()).not.toBe(401)
    // A bogus token is refused uniformly — 403, never 200.
    expect(res.status()).toBe(403)
  })

  test('the version probe is public', async ({ request }) => {
    const res = await request.get('/api/version')
    expect(res.status()).toBe(200)
    expect(await res.json()).toHaveProperty('sha')
  })
})

test.describe('token-gated pages refuse a bogus token without leaking', () => {
  for (const path of [
    '/portal/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '/share/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '/staff/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  ]) {
    test(`${path} renders a refusal, not a crash or a redirect to login`, async ({ page }) => {
      const response = await page.goto(path)
      // Reachable (the middleware opened the path) …
      expect(page.url()).not.toContain('/login')
      // … and not a server crash.
      expect(response?.status()).toBeLessThan(500)
      await expect(page.locator('body')).not.toContainText('Application error')
    })
  }
})
