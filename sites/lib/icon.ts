// The site's tab icon (sites/app/icon.svg): the agency's initial in its own
// main colour. Colours come validated from the brand layer; the letter is
// escaped, so the SVG is safe to serve.

const escapeXml = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!)

export function iconSvg(companyName: string, background: string, foreground: string): string {
  const letter = escapeXml((companyName.trim().match(/\p{L}|\p{N}/u)?.[0] ?? 'A').toUpperCase())
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${background}"/><text x="32" y="43" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="34" font-weight="700" fill="${foreground}">${letter}</text></svg>`
}
