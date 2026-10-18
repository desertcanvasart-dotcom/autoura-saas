// ============================================
// Non-ASCII in the headers of a hand-built (Gmail API) email
// ============================================
// The Gmail sends build raw RFC 822 messages. A Subject or attachment name with
// a Japanese or accented guest name went out as raw UTF-8 bytes, which mail
// clients show as mojibake. Headers must be ASCII:
//   - Subject → RFC 2047 encoded-words (=?UTF-8?B?…?=)
//   - attachment names → an ASCII fallback plus RFC 2231 filename*=UTF-8''…

/** A header value on one line (no CR/LF injection). */
export function singleLine(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim()
}

/** A header value as RFC 2047 encoded-words when it is not plain ASCII. */
export function encodeEmailHeader(value: unknown): string {
  const text = singleLine(value)
  if (!/[^\x20-\x7e]/.test(text)) return text
  // Encoded-words stay under 75 characters: chunk by code point, ~45 bytes each.
  const words: string[] = []
  let chunk = ''
  for (const ch of text) {
    if (Buffer.byteLength(chunk + ch, 'utf8') > 45) {
      words.push(chunk)
      chunk = ''
    }
    chunk += ch
  }
  if (chunk) words.push(chunk)
  return words.map(w => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join(' ')
}

/** `name=…` / `filename=…` parameters for an attachment, safe for any name. */
export function attachmentNameParams(filename: unknown): { name: string; disposition: string } {
  const raw = singleLine(filename).replace(/"/g, '') || 'attachment'
  const ascii = raw.replace(/[^\x20-\x7e]/g, '_')
  if (ascii === raw) return { name: `name="${raw}"`, disposition: `filename="${raw}"` }
  const star = `UTF-8''${encodeURIComponent(raw).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`
  return {
    name: `name="${ascii}"; name*=${star}`,
    disposition: `filename="${ascii}"; filename*=${star}`,
  }
}
