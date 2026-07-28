// ============================================
// HTML ESCAPING FOR SERVER-RENDERED DOCUMENTS
// ============================================
// React escapes interpolated text automatically. Our PDF pipeline does NOT:
// two routes build an HTML string by hand and hand it to Puppeteer, which
// renders it in headless Chrome launched with `--no-sandbox`.
//
// That combination is why this file exists. Operator- and client-supplied
// strings (company_name, logo_url, client_name, day descriptions, quote
// notes) went into that HTML raw. A tenant admin — or anyone who can get
// text into a client record — could close the attribute and run script
// inside a browser sitting on the app's own network:
//
//     logo_url = x" onerror="fetch('http://169.254.169.254/...')
//
// This is not self-XSS: the script runs server-side, in the server's
// network position, during someone else's PDF render.
//
// The rule: EVERY interpolation of a database value into hand-built HTML
// goes through escapeHtml(). No exceptions for "that field is internal" —
// today's internal field is tomorrow's lead-form input.

/**
 * Escape text for HTML body AND double-quoted attribute contexts.
 *
 * `&` first, or the other replacements' entities get double-escaped. Quotes
 * are what stop attribute breakout, so they are not optional even when the
 * value "obviously" has none.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * A URL safe to put in `src`/`href`, or '' if it is not one.
 *
 * Escaping alone stops attribute breakout, but a URL context has its own
 * hazards: `javascript:` (inert in <img>, live in <a href>), and `data:`
 * SVGs which can carry script in some contexts. Allowlisting http/https
 * sidesteps the whole class rather than enumerating what to block.
 *
 * Returns the ESCAPED url, so callers cannot forget the second step.
 */
export function safeUrl(value: unknown): string {
  if (!value) return ''
  const raw = String(value).trim()
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return escapeHtml(parsed.toString())
  } catch {
    // Not an absolute URL. Relative paths are fine and cannot carry a scheme,
    // but must not start with '//' (protocol-relative) or contain a colon
    // before the first slash (a scheme in disguise).
    if (raw.startsWith('/') && !raw.startsWith('//')) return escapeHtml(raw)
    return ''
  }
}
