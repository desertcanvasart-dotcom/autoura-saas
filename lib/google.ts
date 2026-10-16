// The googleapis client, with a timeout on every request. Without one a
// Gmail call that hangs held its cron run (mail-alerts, scheduled-send,
// gmail-sync) open indefinitely, and the next runs piled up behind it.
// Import `google` from here, not from 'googleapis'.

import { google } from 'googleapis'

// Guarded: test doubles of googleapis carry no options().
if (typeof google.options === 'function') google.options({ timeout: 60_000 })

export { google }
