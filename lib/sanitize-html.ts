import DOMPurify from 'isomorphic-dompurify'

// Force external links opened from sanitized email/message HTML to be safe:
// new tab + no window.opener handle back to us.
let hookInstalled = false
function ensureHook() {
  if (hookInstalled) return
  DOMPurify.addHook('afterSanitizeAttributes', (node: any) => {
    if (node.tagName === 'A' && node.getAttribute('href')) {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
  hookInstalled = true
}

/**
 * Sanitize untrusted HTML (inbound email bodies, message HTML, signatures)
 * before it is rendered with dangerouslySetInnerHTML.
 *
 * DOMPurify's default profile already strips <script>, on* event handlers,
 * javascript:/data: URLs, and other execution vectors while keeping normal
 * formatting/layout/images/links — so a malicious email can no longer run
 * code in the operator's session (stored XSS). We additionally harden anchors
 * to open in a new tab with rel=noopener.
 */
export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return ''
  ensureHook()
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })
}
