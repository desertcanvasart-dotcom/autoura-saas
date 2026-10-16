// ============================================
// Server errors: logged as one line, and optionally alerted
// ============================================
// Next calls instrumentation.ts → onRequestError for every uncaught error in
// a route handler, page or server action. Before this, an error there was a
// stack trace somewhere in the Railway log and nobody was told.
//
// Every error is logged as one JSON line (searchable in the log viewer). When
// ALERT_WEBHOOK_URL is set — a Slack, Discord or any "POST {text}" incoming
// webhook — each DISTINCT error is also posted there, at most once per
// ALERT_THROTTLE_MS, so a hot loop sends one message rather than thousands.
// Messages are scrubbed (lib/support/bundle redactText): no addresses, keys or
// tokens leave the server.

import { redactText } from '@/lib/support/bundle'

export const ALERT_THROTTLE_MS = 10 * 60 * 1000

const lastSent = new Map<string, number>()

export interface ErrorContext {
  method?: string
  path?: string
  routePath?: string
  routeType?: string
}

/** One alert per distinct error and route — not per request. */
export function errorSignature(err: unknown, ctx: ErrorContext): string {
  const e = err as { name?: string; message?: string; digest?: string } | null
  const message = String(e?.message ?? err).replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '<id>').replace(/\d+/g, 'N')
  return `${ctx.routePath ?? ctx.path ?? '?'}|${e?.name ?? 'Error'}|${message.slice(0, 200)}`
}

/** Whether this signature may alert now (and records that it did). */
export function shouldAlert(signature: string, now = Date.now()): boolean {
  const prev = lastSent.get(signature)
  if (prev !== undefined && now - prev < ALERT_THROTTLE_MS) return false
  lastSent.set(signature, now)
  if (lastSent.size > 500) {
    for (const [k, t] of lastSent) if (now - t >= ALERT_THROTTLE_MS) lastSent.delete(k)
  }
  return true
}

export function alertText(err: unknown, ctx: ErrorContext): string {
  const e = err as { name?: string; message?: string; digest?: string } | null
  const where = `${ctx.method ?? ''} ${ctx.routePath ?? ctx.path ?? ''}`.trim()
  const what = redactText(`${e?.name ?? 'Error'}: ${e?.message ?? String(err)}`).slice(0, 500)
  const sha = process.env.GIT_SHA ? ` (build ${process.env.GIT_SHA.slice(0, 7)})` : ''
  return `🚨 Autoura server error${sha}\n${where}\n${what}${e?.digest ? `\ndigest ${e.digest}` : ''}`
}

export async function reportServerError(err: unknown, ctx: ErrorContext): Promise<void> {
  try {
    const e = err as { name?: string; message?: string; digest?: string; stack?: string } | null
    console.error(JSON.stringify({
      level: 'error',
      event: 'server_error',
      route: ctx.routePath ?? ctx.path,
      routeType: ctx.routeType,
      method: ctx.method,
      name: e?.name,
      message: redactText(String(e?.message ?? err)).slice(0, 1000),
      digest: e?.digest,
      stack: e?.stack ? redactText(e.stack).split('\n').slice(0, 8).join('\n') : undefined,
    }))

    const url = process.env.ALERT_WEBHOOK_URL
    if (!url || !shouldAlert(errorSignature(err, ctx))) return
    const text = alertText(err, ctx)
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `text` for Slack, `content` for Discord.
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // Reporting must never become the error.
  }
}
