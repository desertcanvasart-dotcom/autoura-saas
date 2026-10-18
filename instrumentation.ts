// Next.js instrumentation: every uncaught server error is logged as one line
// and, with ALERT_WEBHOOK_URL set, alerted (lib/monitoring/error-alerts.ts).
import type { Instrumentation } from 'next'

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  const { reportServerError } = await import('@/lib/monitoring/error-alerts')
  await reportServerError(err, {
    method: request.method,
    path: request.path,
    routePath: context.routePath,
    routeType: context.routeType,
  })
}
