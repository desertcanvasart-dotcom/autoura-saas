// ============================================
// PER-TENANT SENDING DOMAINS
// ============================================
// Operators verify their own domain in Resend and send as themselves, instead
// of every traveller receiving a Sawa Tours invoice from quotes@getautoura.net.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE: a tenant's address is used only
// while `email_domain_status` is exactly 'verified'. Every other state falls
// back to the platform sender.
//
// Getting that wrong does not misdeliver mail — Resend rejects a send from an
// unverified domain outright — but it does turn a working invoice reminder into
// a hard failure, which is the same silent-breakage class as the Gmail
// transport this replaced. So the check is here, in one pure function, rather
// than repeated at four call sites.

/** The tenant fields the sender depends on. */
export interface TenantSenderFields {
  company_name?: string | null
  email_domain?: string | null
  email_from_local?: string | null
  email_domain_status?: string | null
}

export interface ResolvedSender {
  /** Ready for Resend's `from`: `Name <local@domain>`. */
  from: string
  /** True when the operator's own verified domain is being used. */
  usingTenantDomain: boolean
  /** Why the platform sender was used, when it was. */
  fallbackReason?: 'not_verified' | 'no_domain' | 'invalid'
}

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i
const LOCAL_RE = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/i

export function isValidSendingDomain(domain: string | null | undefined): boolean {
  if (!domain) return false
  const d = domain.trim().toLowerCase()
  // A scheme, path, port or local part means the operator pasted a URL or an
  // address; Resend wants the bare domain and would silently never verify.
  if (/[/@:\s]/.test(d)) return false
  return DOMAIN_RE.test(d) && d.length <= 253
}

function safeLocal(local: string | null | undefined): string {
  const l = (local ?? '').trim().toLowerCase()
  return LOCAL_RE.test(l) ? l : 'invoices'
}

/**
 * Strip any display name from a configured sender so a tenant's name can be
 * applied to the platform address. `AUTOURA <quotes@x.net>` -> `quotes@x.net`.
 */
export function bareAddress(from: string): string {
  const m = from.match(/<([^>]+)>/)
  return (m ? m[1] : from).trim()
}

/**
 * Make a company name safe to put in a From header.
 *
 * `company_name` is operator-editable, so it is untrusted input landing in a
 * mail header. CR/LF are stripped first — a newline here is header injection,
 * not a formatting problem. Angle brackets and quotes go too, so the address
 * that follows cannot be confused for part of the name, then the whole thing is
 * quoted if it still contains anything a parser treats as structure.
 */
function displayName(name: string): string {
  // CR/LF become a space rather than vanishing, so a legitimate multi-line
  // name keeps its word boundary; <>" are removed outright.
  const clean = name.replace(/[\r\n]+/g, ' ').replace(/[<>"]/g, '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  return /[,:;@.]/.test(clean) ? `"${clean}"` : clean
}

/**
 * The From header for mail sent on a tenant's behalf.
 *
 * `platformFrom` is RESEND_FROM_EMAIL — the fallback, and the address whose
 * domain the platform has verified.
 */
export function resolveSender(
  tenant: TenantSenderFields | null | undefined,
  platformFrom: string
): ResolvedSender {
  const name = tenant?.company_name?.trim()
  const platformAddress = bareAddress(platformFrom)
  const label = name ? displayName(name) : ''
  const fallback = (reason: ResolvedSender['fallbackReason']): ResolvedSender => ({
    from: label ? `${label} <${platformAddress}>` : platformFrom,
    usingTenantDomain: false,
    fallbackReason: reason,
  })

  if (!tenant?.email_domain) return fallback('no_domain')

  // Checked before validity: a domain that was verified and later un-verified
  // must stop being used immediately, whatever it looks like.
  if (tenant.email_domain_status !== 'verified') return fallback('not_verified')

  if (!isValidSendingDomain(tenant.email_domain)) return fallback('invalid')

  const address = `${safeLocal(tenant.email_from_local)}@${tenant.email_domain.trim().toLowerCase()}`
  return {
    from: label ? `${label} <${address}>` : address,
    usingTenantDomain: true,
  }
}

/** The address a tenant will send from once verified, for showing in settings. */
export function previewSenderAddress(tenant: TenantSenderFields): string | null {
  if (!isValidSendingDomain(tenant.email_domain)) return null
  return `${safeLocal(tenant.email_from_local)}@${tenant.email_domain!.trim().toLowerCase()}`
}
