/** "Jane Doe <jane@x.com>" → "Jane Doe"; a bare address stays as it is. */
export function senderName(from: string): string {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<[^>]+>\s*$/)
  const name = m?.[1]?.trim()
  return name || from.replace(/[<>]/g, '').trim() || 'someone'
}
