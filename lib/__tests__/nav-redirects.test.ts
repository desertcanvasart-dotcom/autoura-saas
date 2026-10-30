import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import path from 'node:path'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MOVED, SETTINGS_TABS, navRedirects } = require('../nav/redirects.js') as {
  MOVED: Array<{ source: string; destination: string }>
  SETTINGS_TABS: Record<string, string>
  navRedirects: () => Array<{ source: string; destination: string; permanent: boolean; has?: unknown[] }>
}

// Every address the navigation restructure moved keeps working: the old page
// is gone from app/ (or the redirect would never be reached… and the page
// would be served twice), and the new one is there.

const appPage = (route: string) =>
  existsSync(path.join(process.cwd(), 'app', ...route.split('?')[0].split('/').filter(Boolean).map(p => (p.startsWith(':') ? '[id]' : p)), 'page.tsx'))

describe('old addresses redirect', () => {
  it('each moved page lives at its new address and no longer at its old one', () => {
    for (const r of MOVED) {
      expect(appPage(r.destination), r.destination).toBe(true)
      expect(appPage(r.source), r.source).toBe(false)
    }
  })

  it('old Settings tabs land on their own pages', () => {
    for (const dest of Object.values(SETTINGS_TABS)) expect(appPage(dest), dest).toBe(true)
  })

  it('all permanent, except bare /settings (where it opens may change)', () => {
    const all = navRedirects()
    expect(all.length).toBe(MOVED.length + Object.keys(SETTINGS_TABS).length + 1)
    for (const r of all) expect(r.permanent, r.source).toBe(!(r.source === '/settings' && !r.has))
    // The ?tab= ones must come before the bare one, or it would swallow them.
    expect(all[all.length - 1]).toMatchObject({ source: '/settings', destination: '/settings/profile' })
  })
})
