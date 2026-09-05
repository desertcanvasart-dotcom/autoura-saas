import { describe, it, expect } from 'vitest'
import {
  checkContractUpload,
  contractStatus,
  contractStorageKey,
  parseContractDate,
  titleFromFilename,
  CONTRACT_DOCUMENT_TYPES,
  CONTRACT_DOCUMENT_TYPE_LABELS,
  MAX_CONTRACT_BYTES,
} from '@/lib/supplier-contracts'

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
const ZIP = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])
const HTML = new TextEncoder().encode('<html><script>alert(1)</script></html>')
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

describe('checkContractUpload', () => {
  it('accepts a PDF declared as a PDF and works from the sniffed type', () => {
    expect(checkContractUpload(PDF, 'application/pdf')).toEqual({ ok: true, type: 'application/pdf', ext: 'pdf' })
  })

  it('accepts Word and Excel files when the bytes are a ZIP container', () => {
    expect(checkContractUpload(ZIP, DOCX)).toEqual({ ok: true, type: DOCX, ext: 'docx' })
    expect(checkContractUpload(ZIP, XLSX)).toEqual({ ok: true, type: XLSX, ext: 'xlsx' })
  })

  it('refuses a renamed file: declared type must match the bytes', () => {
    expect(checkContractUpload(HTML, 'application/pdf')).toEqual({ ok: false, reason: 'content_mismatch' })
    expect(checkContractUpload(PDF, DOCX)).toEqual({ ok: false, reason: 'content_mismatch' })
    expect(checkContractUpload(JPEG, 'image/png')).toEqual({ ok: false, reason: 'content_mismatch' })
  })

  it('refuses types off the allowlist, empty files and oversize files', () => {
    expect(checkContractUpload(HTML, 'text/html')).toEqual({ ok: false, reason: 'type_not_allowed' })
    expect(checkContractUpload(new Uint8Array(0), 'application/pdf')).toEqual({ ok: false, reason: 'empty' })
    expect(checkContractUpload(new Uint8Array(MAX_CONTRACT_BYTES + 1), 'application/pdf')).toEqual({ ok: false, reason: 'too_large' })
  })
})

describe('contractStorageKey', () => {
  it('is tenant-prefixed and sanitised — the read route checks the prefix', () => {
    const key = contractStorageKey({ tenantId: 'ten-1', supplierId: 'sup/../2', unique: 'u1', ext: 'pdf' })
    expect(key).toBe('ten-1/sup.2/u1.pdf')
    expect(key.startsWith('ten-1/')).toBe(true)
  })
})

describe('contractStatus', () => {
  const today = '2026-09-06'
  it('reads the dates as a calendar', () => {
    expect(contractStatus(null, null, today)).toBe('undated')
    expect(contractStatus('2026-10-01', '2027-09-30', today)).toBe('upcoming')
    expect(contractStatus('2025-01-01', '2026-09-05', today)).toBe('expired')
    expect(contractStatus('2025-01-01', '2026-09-06', today)).toBe('expiring') // ends today: still in force, renew now
    expect(contractStatus('2025-01-01', '2026-11-05', today)).toBe('expiring') // 60 days out
    expect(contractStatus('2025-01-01', '2026-11-06', today)).toBe('active')   // 61 days out
    expect(contractStatus('2025-01-01', null, today)).toBe('active')           // open-ended
    expect(contractStatus(null, '2027-01-01', today)).toBe('active')
  })
})

describe('metadata helpers', () => {
  it('titles a file from its name', () => {
    expect(titleFromFilename('Sabena_Al-Farida contract 2026.pdf')).toBe('Sabena Al Farida contract 2026')
    expect(titleFromFilename('C:\\scans\\rates.xlsx')).toBe('rates')
    expect(titleFromFilename('.pdf')).toBe('Document')
  })

  it('accepts only YYYY-MM-DD dates, blank meaning none', () => {
    expect(parseContractDate('')).toEqual({ ok: true, value: null })
    expect(parseContractDate('2026-09-06')).toEqual({ ok: true, value: '2026-09-06' })
    expect(parseContractDate('2026-09-06T10:00:00Z')).toEqual({ ok: true, value: '2026-09-06' })
    expect(parseContractDate('06/09/2026')).toEqual({ ok: false })
    expect(parseContractDate('2026-13-40')).toEqual({ ok: false })
  })

  it('every document type has a label', () => {
    for (const t of CONTRACT_DOCUMENT_TYPES) expect(CONTRACT_DOCUMENT_TYPE_LABELS[t]).toBeTruthy()
  })
})
