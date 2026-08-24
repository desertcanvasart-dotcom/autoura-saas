import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// ============================================================================
// A public Storage bucket has no session and no tenant check: every object in
// it is served to anyone holding the URL. That is correct for a logo and wrong
// for a supplier invoice, which records what an operator pays whom.
//
// The supplier-invoices bucket was created `public: true` and its
// `getPublicUrl()` was stored on the row and rendered as a link, so the URL
// also survived in history, referrers and logs. The path was no secret either:
// `<tenant_id>/<invoice_id>/…` is built from ids the app puts in its own URLs.
//
// This pins the two halves of the fix, because both are easy to undo by
// accident — a future `createBucket` call defaults nothing, and a
// `getPublicUrl` is one autocomplete away from a `createSignedUrl`.
//
// DELIBERATELY NOT COVERED: buckets whose objects an EXTERNAL service must
// fetch — the quote/invoice/contract PDFs handed to WhatsApp as a media URL.
// The provider dereferences those itself with no session to present, so
// "public" there is a different decision with different tradeoffs, not this
// bug. They are listed by name so adding a new one is a conscious act.
// ============================================================================

const API_DIR = path.resolve(__dirname, '..')

// Buckets holding documents that only a signed-in operator ever reads.
const MUST_BE_PRIVATE = ['supplier-invoices']

// Routes that legitimately hand a public URL to an external fetcher.
const EXTERNAL_FETCHER_ROUTES = [
  'whatsapp/send-invoice/route.ts',
  'whatsapp/send-contract/route.ts',
  'whatsapp/send-supplier-document/route.ts',
  'quotes/[type]/[id]/send-whatsapp/route.ts',
  'quotes/b2b/[id]/generate-pdf/route.ts',
  'quotes/b2c/[id]/generate-pdf/route.ts',
  // Inbound WhatsApp media is NOT in this list on purpose: nothing external
  // fetches it. It is still public and is tracked as its own follow-up.
  'whatsapp/webhook/route.ts',
  // Avatars and tenant branding are public by design — a logo is embedded in
  // PDFs and emails that have no session to present.
  'avatar/upload/route.ts',
]

// Comments are prose, not behaviour. Scanning them makes DOCUMENTING the bug
// trip the guard against it — this test failed on its own route's header,
// which explains why `getPublicUrl` is wrong here. Same lesson as the
// euro-literal ratchet, which had to stop counting the symbol in its own
// explanation.
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name !== '__tests__') routeFiles(p, out)
    } else if (e.name === 'route.ts') out.push(p)
  }
  return out
}

describe('documents only an operator reads live in private buckets', () => {
  const files = routeFiles(API_DIR)

  it('finds route files at all (a silent zero would pass vacuously)', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('never creates a private-document bucket as public', () => {
    const offenders: string[] = []

    for (const file of files) {
      const src = code(fs.readFileSync(file, 'utf8'))
      if (!/createBucket/.test(src)) continue
      if (!MUST_BE_PRIVATE.some((b) => src.includes(`'${b}'`) || src.includes(`"${b}"`))) continue

      if (/createBucket\([^)]*public:\s*true/s.test(src)) {
        offenders.push(path.relative(API_DIR, file))
      }
    }

    expect(
      offenders,
      'These create a bucket of operator-only documents as PUBLIC:\n' + offenders.join('\n'),
    ).toEqual([])
  })

  it('never stores a public URL for an object in a private bucket', () => {
    const offenders: string[] = []

    for (const file of files) {
      const rel = path.relative(API_DIR, file)
      if (EXTERNAL_FETCHER_ROUTES.includes(rel)) continue

      const src = code(fs.readFileSync(file, 'utf8'))
      if (!MUST_BE_PRIVATE.some((b) => src.includes(`'${b}'`) || src.includes(`"${b}"`))) continue
      if (/getPublicUrl/.test(src)) offenders.push(rel)
    }

    expect(
      offenders,
      'These mint a public URL for a private-bucket object; sign it instead:\n' +
        offenders.join('\n'),
    ).toEqual([])
  })

  it('the document is served by a route that re-derives permission', () => {
    const route = path.join(API_DIR, 'supplier-invoices/[id]/document/route.ts')
    expect(fs.existsSync(route), 'the signed-URL route is missing').toBe(true)

    const src = code(fs.readFileSync(route, 'utf8'))

    // Short-lived, and signed rather than public.
    expect(src).toMatch(/createSignedUrl/)
    expect(src).not.toMatch(/getPublicUrl/)

    // The permission check must run on the CALLER'S client. Reading the
    // invoice with the service-role client would sign a document for a caller
    // who cannot see the invoice — the silent-empty lesson inverted.
    const readsInvoiceViaRls = /supabase\s*\n?\s*\.from\('supplier_invoices'\)/.test(src)
    expect(readsInvoiceViaRls, 'the invoice must be read with the RLS-bound client').toBe(true)
    expect(src).not.toMatch(/admin\(\)[\s\S]{0,80}from\('supplier_invoices'\)/)
  })
})
