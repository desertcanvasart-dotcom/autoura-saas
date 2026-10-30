// Old addresses → their new homes, for bookmarks and links in sent emails.
// Permanent (308). next.config.js serves these; lib/__tests__/nav-redirects
// checks every source is gone from app/ and every destination exists.
//
// CommonJS: next.config.js loads it with require.

/** Settings tabs that became their own pages: /settings?tab=<tab>. */
const SETTINGS_TABS = {
  profile: '/settings/profile',
  email: '/settings/email',
  notifications: '/settings/notifications',
  preferences: '/settings/pricing',
}

/** @type {Array<{ source: string, destination: string }>} */
const MOVED = [
  // Setup pages that left the main sidebar for the Settings area.
  { source: '/templates', destination: '/settings/message-templates' },
  { source: '/content-library/prompts', destination: '/settings/ai-prompts' },
  { source: '/content-library/rules', destination: '/settings/writing-rules' },
  { source: '/content-library', destination: '/settings/content-library' },
  { source: '/content-library/:id', destination: '/settings/content-library/:id' },
  { source: '/copilot-knowledge', destination: '/settings/copilot-knowledge' },
  { source: '/users', destination: '/settings/team' },
  { source: '/team-members', destination: '/settings/staff-directory' },
  { source: '/settings/tenant', destination: '/settings/company' },
  { source: '/settings/attraction-aliases', destination: '/settings/attraction-names' },
  // Work pages that were filed under /settings.
  { source: '/settings/capacity', destination: '/departures/capacity' },
  { source: '/settings/copilot-analytics', destination: '/reports?tab=copilot' },
  // Merged into Reports' tabs.
  { source: '/analytics', destination: '/reports?tab=analytics' },
  { source: '/financial-reports', destination: '/reports?tab=finance' },
  { source: '/copilot-analytics', destination: '/reports?tab=copilot' },
  // Merged into the Inbox's channel tabs.
  { source: '/conversations', destination: '/inbox?channel=all' },
  { source: '/whatsapp-inbox', destination: '/inbox?channel=whatsapp' },
]

function navRedirects() {
  return [
    ...Object.entries(SETTINGS_TABS).map(([tab, destination]) => ({
      source: '/settings',
      has: [{ type: 'query', key: 'tab', value: tab }],
      destination,
      permanent: true,
    })),
    ...MOVED.map(r => ({ ...r, permanent: true })),
    // Bare /settings opens the Account group, which everyone has. Here and
    // not only in app/settings/page.tsx: the middleware's admin-only
    // '/settings' rule would turn a manager away before the page ran.
    { source: '/settings', destination: '/settings/profile', permanent: false },
  ]
}

module.exports = { MOVED, SETTINGS_TABS, navRedirects }
