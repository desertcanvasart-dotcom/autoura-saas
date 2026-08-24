import { describe, it, expect, afterEach, vi } from 'vitest'
import { fetchLogoBytes } from '@/lib/company-identity'
import { generateContractPDF } from '@/lib/contract-pdf-generator'

// 1x1 red PNG — a real, embeddable image so the pdf-lib embed path is
// exercised for real, not mocked away.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

const pngResponse = () =>
  new Response(new Uint8Array(TINY_PNG), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  })

afterEach(() => vi.unstubAllGlobals())

// The rule under test: like fetchLogoDataUrl, a logo is BEST-EFFORT — any
// failure returns undefined and the document renders its text-only header.
// A missing logo must never block a contract or an invoice.
describe('fetchLogoBytes', () => {
  it('returns bytes and format for a PNG', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => pngResponse()))
    const logo = await fetchLogoBytes('https://cdn.example/logo.png')
    expect(logo?.format).toBe('png')
    expect(logo?.bytes.length).toBe(TINY_PNG.length)
  })

  it('is undefined for no URL, non-image content, HTTP errors, and network failure', async () => {
    expect(await fetchLogoBytes(undefined)).toBeUndefined()
    expect(await fetchLogoBytes(null)).toBeUndefined()

    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response('<html>login</html>', { status: 200, headers: { 'content-type': 'text/html' } })
    ))
    expect(await fetchLogoBytes('https://cdn.example/logo.png')).toBeUndefined()

    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    expect(await fetchLogoBytes('https://cdn.example/logo.png')).toBeUndefined()

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    expect(await fetchLogoBytes('https://cdn.example/logo.png')).toBeUndefined()
  })
})

describe('generateContractPDF branding', () => {
  const base = {
    contractNumber: 'TC-2026-TEST',
    contractDate: '2026-08-25',
    clientName: 'Test Client',
    numTravelers: 2,
    tourName: 'Test Tour',
    startDate: '2026-09-01',
    endDate: '2026-09-08',
    destinations: 'Cairo',
    totalCost: 1000,
    currency: 'EUR',
  }

  it('renders with a tenant logo and brand color', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => pngResponse()))
    const pdf = await generateContractPDF({
      ...base,
      company: { name: 'Acme Tours', primaryColor: '#112233', logoUrl: 'https://cdn.example/logo.png' },
    })
    expect(String.fromCharCode(...pdf.slice(0, 5))).toBe('%PDF-')
  })

  it('renders unbranded exactly as before — no logo fetch without a URL', async () => {
    const fetchSpy = vi.fn(async () => pngResponse())
    vi.stubGlobal('fetch', fetchSpy)
    const pdf = await generateContractPDF({ ...base, company: { name: 'Acme Tours' } })
    expect(String.fromCharCode(...pdf.slice(0, 5))).toBe('%PDF-')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('a broken logo URL still produces the contract (text-only header)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED') }))
    const pdf = await generateContractPDF({
      ...base,
      company: { name: 'Acme Tours', logoUrl: 'https://cdn.example/gone.png' },
    })
    expect(String.fromCharCode(...pdf.slice(0, 5))).toBe('%PDF-')
  })
})
