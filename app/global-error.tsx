'use client'

// The last resort: the root layout itself failed, so neither it nor the app's
// stylesheet is here. Everything is inline.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#F7F7F4', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ maxWidth: 420, width: '100%', textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, background: '#263A29', borderRadius: 16 }} aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white" />
                <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 style={{ margin: '24px 0 8px', fontSize: 24, color: '#111827' }}>Autoura hit a problem</h1>
            <p style={{ margin: 0, color: '#4B5563', lineHeight: 1.5 }}>
              Something went wrong loading the app. Your saved work is safe. Please try again in a moment.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{ marginTop: 32, padding: '10px 20px', borderRadius: 8, border: 0, background: '#263A29', color: 'white', fontSize: 16, fontWeight: 500, cursor: 'pointer' }}
            >
              Try again
            </button>
            {error.digest && <p style={{ marginTop: 24, fontSize: 12, color: '#9CA3AF' }}>Reference: {error.digest}</p>}
          </div>
        </div>
      </body>
    </html>
  )
}
