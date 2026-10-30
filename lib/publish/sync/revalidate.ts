// ============================================
// Publish sync — telling the site renderer which pages changed
// ============================================
// The worker (GetAutoura app) and the site renderer (the sites/ app, step 3)
// are separate services. The worker POSTs the tags to revalidate; the
// renderer verifies the signature, revalidates each tag and answers how many
// it did. Both halves live here so they cannot drift apart, and the
// renderer's route is a thin call to handleRevalidateRequest().
//
// Signed exactly like the concierge and Sawa webhooks (HMAC-SHA256 over
// `${t}.${rawBody}`, header `t=<unix>,v1=<hex>`), with its own secret pair:
// PUBLISH_REVALIDATE_SECRET and PUBLISH_REVALIDATE_SECRET_PREVIOUS.
//
// "Sent" is not "done": the worker counts a refresh as delivered only when the
// renderer answers 200 with `revalidated` equal to the number of tags sent.
// Anything else is a failure the health record shows.

import { z } from 'zod'
import { buildSignatureHeader, verifyConciergeSignature, SIGNATURE_HEADER } from '@/lib/concierge-webhook-auth'

export const REVALIDATE_PATH = '/api/revalidate'

const requestSchema = z.object({
  tenantId: z.string().uuid(),
  tags: z.array(z.string().min(1).max(200)).min(1).max(500),
  sentAt: z.string(),
})
export type RevalidateRequest = z.infer<typeof requestSchema>

const responseSchema = z.object({ ok: z.literal(true), revalidated: z.number().int() })

type Secrets = Array<{ label: 'current' | 'previous'; secret: string }>

export function revalidateSecrets(env: NodeJS.ProcessEnv = process.env): Secrets {
  const out: Secrets = []
  if (env.PUBLISH_REVALIDATE_SECRET) out.push({ label: 'current', secret: env.PUBLISH_REVALIDATE_SECRET })
  if (env.PUBLISH_REVALIDATE_SECRET_PREVIOUS) out.push({ label: 'previous', secret: env.PUBLISH_REVALIDATE_SECRET_PREVIOUS })
  return out
}

/** Revalidate one company's tags. Resolves when the renderer confirmed every
 *  tag; throws (with a reason fit for the health record) otherwise. */
export type Revalidator = (tenantId: string, tags: string[]) => Promise<void>

export function createRevalidator(opts: {
  rendererUrl: string | undefined
  secret: string | undefined
  fetchImpl?: typeof fetch
  now?: () => Date
}): Revalidator {
  const fetchImpl = opts.fetchImpl ?? fetch
  const now = opts.now ?? (() => new Date())
  return async (tenantId, requested) => {
    const tags = [...new Set(requested)]
    if (!opts.rendererUrl) throw new Error('site renderer not configured (PUBLISH_RENDERER_URL is not set)')
    if (!opts.secret) throw new Error('PUBLISH_REVALIDATE_SECRET is not set')
    const body = JSON.stringify({ tenantId, tags, sentAt: now().toISOString() } satisfies RevalidateRequest)
    const t = Math.floor(now().getTime() / 1000)
    let res: Response
    try {
      res = await fetchImpl(`${opts.rendererUrl.replace(/\/$/, '')}${REVALIDATE_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: buildSignatureHeader(opts.secret, t, body) },
        body,
        signal: AbortSignal.timeout(15_000),
      })
    } catch (e) {
      throw new Error(`renderer unreachable: ${e instanceof Error ? e.message : String(e)}`)
    }
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error(`renderer answered HTTP ${res.status}${json?.error ? `: ${json.error}` : ''}`)
    const parsed = responseSchema.safeParse(json)
    if (!parsed.success) throw new Error('renderer gave no revalidation count')
    if (parsed.data.revalidated !== tags.length) {
      throw new Error(`renderer revalidated ${parsed.data.revalidated} of ${tags.length} tags`)
    }
  }
}

/** The renderer's side: verify, then revalidate every tag. Pure apart from
 *  the injected revalidateTag, so it is tested without a server. */
export async function handleRevalidateRequest(input: {
  rawBody: string
  signatureHeader: string | null
  secrets: Secrets
  revalidateTag: (tag: string) => void | Promise<void>
  nowSeconds?: number
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const verified = verifyConciergeSignature({
    rawBody: input.rawBody,
    signatureHeader: input.signatureHeader,
    secrets: input.secrets,
    nowSeconds: input.nowSeconds,
  })
  if (!verified.ok) {
    return { status: verified.code === 'no_secret_configured' ? 500 : 401, body: { ok: false, error: verified.message } }
  }
  let json: unknown
  try {
    json = JSON.parse(input.rawBody)
  } catch {
    return { status: 400, body: { ok: false, error: 'body is not JSON' } }
  }
  const parsed = requestSchema.safeParse(json)
  if (!parsed.success) return { status: 400, body: { ok: false, error: 'invalid revalidate request' } }

  let revalidated = 0
  for (const tag of new Set(parsed.data.tags)) {
    await input.revalidateTag(tag)
    revalidated++
  }
  return { status: 200, body: { ok: true, revalidated } }
}
