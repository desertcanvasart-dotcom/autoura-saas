// Contact links built from the company's records.
// Step 8 replaces the plain WhatsApp link with the tracked /go/wa redirect
// (tour reference in the message, enquiry recorded with its source).

import type { CompanyIdentity } from '@/lib/publish/contract'

export function whatsappHref(identity: CompanyIdentity): string | null {
  const digits = identity.whatsapp?.replace(/\D/g, '')
  return digits && digits.length >= 8 ? `https://wa.me/${digits}` : null
}

export function emailHref(identity: CompanyIdentity): string | null {
  return identity.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email) ? `mailto:${identity.email}` : null
}

export function phoneHref(identity: CompanyIdentity): string | null {
  const tel = identity.phone?.replace(/[^\d+]/g, '')
  return tel && tel.replace(/\D/g, '').length >= 6 ? `tel:${tel}` : null
}
