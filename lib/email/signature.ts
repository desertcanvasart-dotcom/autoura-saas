import { sanitizeEmailHtml } from '@/lib/sanitize-html'

/** A signature as stored: HTML ones cleaned (no scripts or on* handlers —
 *  they went out in every email), plain text left as typed. */
export function cleanSignature(raw: unknown): string {
  const text = String(raw ?? '').trim()
  return /<[a-z][\s\S]*>/i.test(text) ? sanitizeEmailHtml(text).trim() : text
}

/**
 * The composer's body with its signature block replaced by another. Done on
 * the document, not by pattern: the pattern stopped at the first </div>, and
 * a multi-line signature is a <div> per line, so switching signatures left
 * the old one's later lines and a stray </div> behind.
 */
export function swapSignatureBlock(bodyHtml: string, signatureHtml: string): string {
  if (typeof DOMParser === 'undefined') {
    return bodyHtml.replace(/<div data-signature="true"[\s\S]*<\/div>\s*$/, signatureHtml)
  }
  const doc = new DOMParser().parseFromString(`<body>${bodyHtml}</body>`, 'text/html')
  const block = doc.body.querySelector('[data-signature="true"]')
  if (!block) return bodyHtml
  const holder = doc.createElement('div')
  holder.innerHTML = signatureHtml
  block.replaceWith(...Array.from(holder.childNodes))
  return doc.body.innerHTML
}
