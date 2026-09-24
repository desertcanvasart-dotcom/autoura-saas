/* Autoura service worker — PUSH ONLY.
 *
 * Deliberately no fetch handler and no caching: this worker exists so the
 * app — installed or just open in a browser — can receive alerts, not to
 * serve stale pages. (The v1 PWA decision to skip offline stands; push is why
 * the SW appeared.) Alerts: ops checkpoints, and since 2026-09-24 new email,
 * WhatsApp messages and concierge leads, each opening its own page.
 */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Autoura', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Autoura'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/ops-192.png',
      badge: '/icons/ops-192.png',
      data: { url: data.url || '/ops' },
      tag: data.tag || 'autoura-ops',
      // Same tag = the same chat's alert is REPLACED, not stacked — and must
      // still sound, or a second message from a customer arrives silently.
      renotify: Boolean(data.tag),
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/ops'
  const target = new URL(url, self.location.origin).href
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Already on that page: bring it forward.
      for (const w of wins) {
        if (w.url === target && 'focus' in w) return w.focus()
      }
      // Autoura open elsewhere: take that window to the page.
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin && 'navigate' in w) {
          // navigate() refuses a window this worker does not control; then
          // open a fresh one rather than doing nothing.
          return w.navigate(target)
            .then(c => (c || w).focus())
            .catch(() => clients.openWindow(target))
        }
      }
      return clients.openWindow(target)
    })
  )
})
