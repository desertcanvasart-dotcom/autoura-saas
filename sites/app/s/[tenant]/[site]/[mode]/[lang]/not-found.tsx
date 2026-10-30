// The site's own 404. A not-found page receives no route params, so it is
// drawn from the brand variables the layout set — the company's colours and
// faces — and links back to the site's front door.

export default function SiteNotFound() {
  return (
    <main className="site-not-found">
      <h1>Page not found</h1>
      <p>This page does not exist.</p>
      {/* A full load on purpose: "/" is answered by the proxy (a redirect to the
          visitor's language), not by a page the client router knows. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <p><a href="/">Back to the home page</a></p>
    </main>
  )
}
