// Contact links built from the company's records.

import type { CompanyIdentity, PagePayload } from '@/lib/publish/contract'

/** The WhatsApp button: through /api/wa, which records the page (and its
 *  campaign) under a reference the message carries (step 8). Only for a
 *  company with its own number — `identity.whatsapp` is
 *  tenants.whatsapp_number, which a shared-number company does not have. */
export function whatsappHref(page: PagePayload): string | null {
  const digits = page.site.identity.whatsapp?.replace(/\D/g, '')
  if (!digits || digits.length < 8) return null
  const q = new URLSearchParams({ lang: page.language })
  if (page.pageId) q.set('page', page.pageId)
  return `/api/wa?${q}`
}

export function emailHref(identity: CompanyIdentity): string | null {
  return identity.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email) ? `mailto:${identity.email}` : null
}

export function phoneHref(identity: CompanyIdentity): string | null {
  const tel = identity.phone?.replace(/[^\d+]/g, '')
  return tel && tel.replace(/\D/g, '').length >= 6 ? `tel:${tel}` : null
}
