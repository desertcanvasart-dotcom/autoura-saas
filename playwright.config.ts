import { defineConfig, devices } from '@playwright/test'

// ============================================
// E2E smoke — the auth boundary, proven through the real middleware (C5)
// ============================================
// This suite is deliberately UNAUTHENTICATED and database-free. Everything it
// asserts is a guarantee no unit test can make, because the guarantee lives in
// the middleware and the Next runtime rather than in a function:
//
//   * a protected page redirects an anonymous visitor to /login
//   * a protected /api route answers 401 JSON — not 200, not a 500
//   * a self-authenticating route (portal, share, staff) is REACHABLE without
//     a session and still refuses a bogus token
//   * the public marketing surface renders
//
// The route-auth sweep test asserts the allowlist by reading source; this
// asserts what the running server actually does with a request. Both matter:
// the sweep caught a route that authenticated itself but was unreachable, and
// only a real request can catch middleware that never ran.
//
// The auth-boundary spec needs NO DATABASE. Placeholder Supabase env is
// enough for those paths: the app's build-safe convention keeps clients lazy,
// an anonymous getUser() simply yields no user, and every assertion there is
// about refusal.
//
// portal-journey.spec.ts is the exception — it WRITES. It runs only when a
// throwaway project's credentials AND a tenant marked settings.e2e_fixture
// are supplied, and skips itself otherwise, so this config stays safe to run
// anywhere by default. See docs/E2E.md.

const PORT = process.env.E2E_PORT ?? '3111'
const BASE_URL = `http://127.0.0.1:${PORT}`

// Real values when CI provides them; otherwise syntactically valid
// placeholders so the server boots and every auth check simply finds nobody.
const supabaseUrl = process.env.E2E_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const supabaseAnon = process.env.E2E_SUPABASE_ANON_KEY ?? 'placeholder-anon-key'
const supabaseService = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder-service-key'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `next start` against a production build: the same code path the deploy
    // runs, so a module-scope crash or a middleware misconfiguration shows up
    // here rather than in production.
    command: `npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnon,
      SUPABASE_SERVICE_ROLE_KEY: supabaseService,
      NEXT_PUBLIC_APP_URL: BASE_URL,
      NODE_ENV: 'production',
      // The portal journey drives routes that read the service key from the
      // SERVER; without it the app under test would be talking to a
      // different database than the spec's own client.
      E2E_TENANT_ID: process.env.E2E_TENANT_ID ?? '',
    },
  },
})
