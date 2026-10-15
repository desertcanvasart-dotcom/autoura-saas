// ============================================
// Print an email or its whole conversation
// ============================================
// A clean page for the printer: the subject, then each message's From / To /
// Cc / Date and body, oldest first. Header text is escaped; bodies must
// already be sanitised (sanitizeEmailHtml) by the caller.

export interface PrintableMessage {
  from: string
  to: string
  cc?: string
  date: string
  body: string
  attachments?: Array<{ filename: string }>
}

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function printHtml(subject: string, messages: PrintableMessage[], ownerLabel = ''): string {
  const parts = messages.map(m => {
    const when = new Date(m.date)
    const whenText = isNaN(when.getTime()) ? m.date : when.toLocaleString()
    const files = m.attachments?.length
      ? `<p class="files">Attachments: ${m.attachments.map(a => esc(a.filename)).join(', ')}</p>`
      : ''
    return `<section class="msg">
  <table class="hdr">
    <tr><th>From</th><td>${esc(m.from)}</td></tr>
    <tr><th>To</th><td>${esc(m.to)}</td></tr>
    ${m.cc ? `<tr><th>Cc</th><td>${esc(m.cc)}</td></tr>` : ''}
    <tr><th>Date</th><td>${esc(whenText)}</td></tr>
  </table>
  <div class="body">${m.body}</div>
  ${files}
</section>`
  })
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(subject || '(No subject)')}</title>
<style>
  body { font: 13px/1.5 -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
  .msg { border-top: 1px solid #ccc; padding: 12px 0; page-break-inside: avoid; }
  .hdr th { text-align: left; color: #666; font-weight: normal; padding-right: 12px; vertical-align: top; }
  .hdr td { word-break: break-word; }
  .body { margin-top: 10px; }
  .body img { max-width: 100%; }
  .files { color: #666; font-size: 11px; }
</style></head><body>
<h1>${esc(subject || '(No subject)')}</h1>
<p class="meta">${messages.length} message${messages.length === 1 ? '' : 's'}${ownerLabel ? ` · ${esc(ownerLabel)}` : ''}</p>
${parts.join('\n')}
</body></html>`
}

/** Open the print view in a new tab and print it. */
export function printEmails(subject: string, messages: PrintableMessage[], ownerLabel = ''): boolean {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open()
  w.document.write(printHtml(subject, messages, ownerLabel))
  w.document.close()
  w.focus()
  // Let images load before the print dialog opens — once, whichever comes first.
  let printed = false
  const go = () => {
    if (printed) return
    printed = true
    try { w.print() } catch { /* the tab was closed */ }
  }
  w.addEventListener('load', go)
  setTimeout(go, 1500)
  return true
}
