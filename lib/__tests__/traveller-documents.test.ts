import { describe, it, expect } from 'vitest'
import {
  sniffType,
  checkUpload,
  documentStorageKey,
  purgeAfterFor,
  MAX_DOCUMENT_BYTES,
  MAX_OTHER_DOCUMENTS,
} from '../portal/traveller-documents'
import { safeKeySegment } from '../storage-key'

// C1b: the file gate. The upload route is the only path that accepts a FILE
// from someone with no session — these rules are the whole defence, so they
// are tested byte-level.

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])          // %PDF-1
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])
const WEBP = new Uint8Array([...'RIFF'].map(c => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map(c => c.charCodeAt(0))))
const HEIC = new Uint8Array([0, 0, 0, 0x18, ...'ftypheic'.split('').map(c => c.charCodeAt(0)), 0, 0, 0, 0])
const HTML = new Uint8Array([...'<html><script>'].map(c => c.charCodeAt(0)))

describe('sniffType', () => {
  it('recognises the five accepted formats by magic bytes', () => {
    expect(sniffType(PDF)).toBe('application/pdf')
    expect(sniffType(JPEG)).toBe('image/jpeg')
    expect(sniffType(PNG)).toBe('image/png')
    expect(sniffType(WEBP)).toBe('image/webp')
    expect(sniffType(HEIC)).toBe('image/heic')
    expect(sniffType(HTML)).toBeNull()
  })
})

describe('checkUpload', () => {
  it('accepts matching declared type + bytes, returning the SNIFFED type', () => {
    const v = checkUpload(JPEG, 'image/jpeg')
    expect(v).toEqual({ ok: true, type: 'image/jpeg', ext: 'jpg' })
  })

  it('rejects a declared type the bytes contradict — both directions', () => {
    // HTML dressed as a JPEG (the classic stored-XSS smuggle)
    expect(checkUpload(HTML, 'image/jpeg')).toEqual({ ok: false, reason: 'content_mismatch' })
    // a real JPEG announced as a PDF
    expect(checkUpload(JPEG, 'application/pdf')).toEqual({ ok: false, reason: 'content_mismatch' })
  })

  it('rejects types off the allowlist, empty files and oversized files', () => {
    expect(checkUpload(HTML, 'text/html')).toEqual({ ok: false, reason: 'type_not_allowed' })
    expect(checkUpload(new Uint8Array(0), 'image/jpeg')).toEqual({ ok: false, reason: 'empty' })
    const big = new Uint8Array(MAX_DOCUMENT_BYTES + 1)
    big.set(JPEG)
    expect(checkUpload(big, 'image/jpeg')).toEqual({ ok: false, reason: 'too_large' })
  })

  it('caps supporting documents, never the passport slot', () => {
    expect(checkUpload(JPEG, 'image/jpeg', { kind: 'other', existingOtherCount: MAX_OTHER_DOCUMENTS }))
      .toEqual({ ok: false, reason: 'too_many' })
    expect(checkUpload(JPEG, 'image/jpeg', { kind: 'passport', existingOtherCount: MAX_OTHER_DOCUMENTS }).ok).toBe(true)
  })
})

describe('storage keys', () => {
  it('builds sane keys from ids and never lets a segment climb or nest', () => {
    expect(documentStorageKey({ bookingId: 'b-1', passengerId: 'p-1', kind: 'passport', ext: 'jpg', unique: 'u1' }))
      .toBe('b-1/p-1/passport-u1.jpg')
    expect(safeKeySegment('../../etc/passwd')).toBe('etcpasswd')
    expect(safeKeySegment('a/b/c')).toBe('abc')
    expect(safeKeySegment('..')).toBe('unknown')
  })
})

describe('purgeAfterFor', () => {
  const uploaded = new Date('2026-08-29T10:00:00Z')

  it('the day after the booking ends', () => {
    expect(purgeAfterFor('2026-10-05', uploaded)).toBe('2026-10-06T00:00:00.000Z')
  })

  it('an undated booking still gets a horizon — a year from upload, not forever', () => {
    expect(purgeAfterFor(null, uploaded)).toBe('2027-08-30T10:00:00.000Z')
  })
})
