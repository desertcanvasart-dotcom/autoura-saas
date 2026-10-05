// Reported 2026-10-06: generating documents from an itinerary opened
// /documents/supplier?itineraryId=…, but the page never read that parameter
// and listed every document from every trip. The API has filtered by
// itineraryId all along; the page has to pass it — and, unfiltered, keep each
// trip's documents together.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'

const PAGE = readFileSync(join(process.cwd(), 'app/documents/supplier/page.tsx'), 'utf8')
const BUTTON = readFileSync(join(process.cwd(), 'app/components/GenerateDocumentsButton.tsx'), 'utf8')
const API = readFileSync(join(process.cwd(), 'app/api/supplier-documents/route.ts'), 'utf8')

describe('documents for one itinerary', () => {
  it('the itinerary links here with its id', () => {
    expect(BUTTON).toContain('/documents/supplier?itineraryId=${itineraryId}')
  })

  it('the page reads that id and sends it to the API', () => {
    expect(PAGE).toContain("new URLSearchParams(window.location.search).get('itineraryId')")
    expect(PAGE).toContain("if (itineraryFilter) params.append('itineraryId', itineraryFilter)")
    expect(PAGE).toMatch(/\[mounted, typeFilter, statusFilter, itineraryFilter\]/)
  })

  it('which filters on it', () => {
    expect(API).toContain("searchParams.get('itineraryId')")
    expect(API).toContain(".eq('itinerary_id', itineraryId)")
  })
})

describe('all documents', () => {
  it('are grouped by itinerary, each with a way to show only its own', () => {
    expect(PAGE).toContain("const key = doc.itinerary?.id ?? ''")
    expect(PAGE).toContain('{groups.map((g) => (')
    expect(PAGE).toContain('Show only these')
  })
})
