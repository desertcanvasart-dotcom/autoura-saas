// Browsers ask for /favicon.ico on their own; send them to the site's icon.
// A relative address, so it stays on the hostname the visitor used (behind
// Railway's proxy the server's own address is not the site's).
export function GET() {
  return new Response(null, { status: 301, headers: { location: '/icon.svg', 'cache-control': 'public, max-age=86400' } })
}
