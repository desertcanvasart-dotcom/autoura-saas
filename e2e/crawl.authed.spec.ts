// The console-error crawl: sign in once, walk every sidebar destination, and
// fail on anything a human tester would have had to *notice* — a console
// error, a failed request, a page that renders "null".
//
// Born from two QA rounds (31 Aug) in which every screen-by-screen walk of
// the app surfaced another batch of silent breakage: dead buttons, 400ing
// writes, "1 null" chart slices. Each round was the FIRST time many screens
// had ever been opened. This spec makes that walk automatic, so the next
// batch is found by CI, not by the next external tester.
//
// Gated like the portal journey: skips entirely unless the throwaway
// project's secrets AND the crawler login exist (docs/E2E.md). It signs in as
// a real user, so it must never point at a live tenant.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'

const configured = !!(
  process.env.E2E_SUPABASE_URL &&
  !process.env.E2E_SUPABASE_URL.includes('placeholder') &&
  process.env.E2E_TENANT_ID &&
  process.env.E2E_USER_PASSWORD
)
const EMAIL = 'e2e-crawler@example.invalid'

/** Every href the sidebar offers, read from the source so the crawl and the
 *  app cannot drift apart. */
function sidebarRoutes(): string[] {
  const src = readFileSync(join(__dirname, '..', 'components', 'Sidebar.tsx'), 'utf8')
  const out = new Set<string>()
  for (const m of src.matchAll(/href: '(\/[^']*)'/g)) out.add(m[1])
  return [...out]
}

// Noise that is not a defect: benign browser chatter and third-party warnings.
const IGNORE = [
  /Download the React DevTools/,
  /hydrat/i, // hydration warnings are tracked separately, not crawl failures
  /Failed to load resource.*40[134]/, // authz probes some pages make on purpose
]

test.describe('authed console-error crawl', () => {
  test.skip(!configured, 'needs E2E_SUPABASE_URL, E2E_TENANT_ID and E2E_USER_PASSWORD (docs/E2E.md)')
  test.describe.configure({ mode: 'serial' })
  test.setTimeout(300_000)

  test('every sidebar destination renders without console errors or 5xx', async ({ page }) => {
    const routes = sidebarRoutes()
    expect(routes.length).toBeGreaterThan(30)

    // Sign in through the real form — the same path a person takes.
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(EMAIL)
    await page.locator('input[type="password"]').fill(process.env.E2E_USER_PASSWORD!)
    await page.locator('button[type="submit"]').click()
    await page.waitForURL(/dashboard|onboarding/, { timeout: 20_000 })

    const failures: string[] = []
    for (const route of routes) {
      const consoleErrors: string[] = []
      const badResponses: string[] = []
      const onConsole = (msg: { type(): string; text(): string }) => {
        if (msg.type() === 'error' && !IGNORE.some(re => re.test(msg.text()))) {
          consoleErrors.push(msg.text().slice(0, 200))
        }
      }
      const onResponse = (res: { status(): number; url(): string }) => {
        if (res.status() >= 500) badResponses.push(`${res.status()} ${res.url()}`)
      }
      page.on('console', onConsole)
      page.on('response', onResponse)
      try {
        await page.goto(route, { waitUntil: 'networkidle', timeout: 30_000 })
        // The literal string "null" rendered as content is always a bug
        // (GET-M01's class). Scoped to leaf text nodes to avoid JSON blobs.
        const nullChips = await page
          .locator('span,td,p,h1,h2,h3,label', { hasText: /^null$/ })
          .count()
        if (nullChips > 0) failures.push(`${route}: renders the literal string "null" (${nullChips}×)`)
      } catch (e) {
        failures.push(`${route}: navigation failed — ${(e as Error).message.slice(0, 120)}`)
      } finally {
        page.off('console', onConsole)
        page.off('response', onResponse)
      }
      for (const c of consoleErrors) failures.push(`${route}: console error — ${c}`)
      for (const r of badResponses) failures.push(`${route}: ${r}`)
    }

    expect(failures, `${failures.length} defect(s) across ${routes.length} routes`).toEqual([])
  })
})
