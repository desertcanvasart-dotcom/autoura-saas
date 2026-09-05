// ============================================
// Supplier contracts — what is accepted, where it lands, what it means
// ============================================
// The documents a company holds with its suppliers: contracts, rate sheets,
// allotment agreements, licences, insurance. The rules for what a staff
// member may upload live here and are tested directly; the routes under
// app/api/suppliers/[id]/contracts only call them.
//
// The bucket is PRIVATE (migration 332). Nothing here ever builds a public
// URL; reads are short-lived signed URLs issued behind a staff session.

import { safeKeySegment } from '@/lib/storage-key'
import { sniffType } from '@/lib/portal/traveller-documents'

export const SUPPLIER_CONTRACTS_BUCKET = 'supplier-contracts'

/** 20 MB. A scanned multi-page hotel contract is 5–15 MB. */
export const MAX_CONTRACT_BYTES = 20 * 1024 * 1024

export const CONTRACT_DOCUMENT_TYPES = ['contract', 'rate_sheet', 'allotment', 'license', 'insurance', 'other'] as const
export type ContractDocumentType = (typeof CONTRACT_DOCUMENT_TYPES)[number]

export const CONTRACT_DOCUMENT_TYPE_LABELS: Record<ContractDocumentType, string> = {
  contract: 'Contract',
  rate_sheet: 'Rate sheet',
  allotment: 'Allotment',
  license: 'Licence',
  insurance: 'Insurance',
  other: 'Other',
}

export function isContractDocumentType(v: unknown): v is ContractDocumentType {
  return (CONTRACT_DOCUMENT_TYPES as readonly string[]).includes(String(v))
}

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Declared type → stored extension. Membership here IS the allowlist. */
export const CONTRACT_EXT_FOR_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  [DOCX]: 'docx',
  [XLSX]: 'xlsx',
}

export const CONTRACT_ALLOWED_TYPES = Object.keys(CONTRACT_EXT_FOR_TYPE)

/** The file-picker `accept` string: MIME types plus the extensions browsers
 *  match on when they don't know the type. */
export const CONTRACT_ACCEPT = [...CONTRACT_ALLOWED_TYPES, '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.docx', '.xlsx'].join(',')

/** Word and Excel files are ZIP containers: the magic bytes say "zip", and
 *  the declared type decides which Office format. That is enough to refuse a
 *  renamed PDF or HTML file; it does not distinguish docx from xlsx. */
function isZip(buf: Uint8Array): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
}

export type ContractUploadRejection = 'empty' | 'too_large' | 'type_not_allowed' | 'content_mismatch'

/** Decide whether these bytes may be stored. The declared type must be on
 *  the allowlist AND agree with the bytes. */
export function checkContractUpload(
  bytes: Uint8Array,
  declaredType: string
): { ok: true; type: string; ext: string } | { ok: false; reason: ContractUploadRejection } {
  if (!bytes || bytes.length === 0) return { ok: false, reason: 'empty' }
  if (bytes.length > MAX_CONTRACT_BYTES) return { ok: false, reason: 'too_large' }
  if (!CONTRACT_ALLOWED_TYPES.includes(declaredType)) return { ok: false, reason: 'type_not_allowed' }

  if (declaredType === DOCX || declaredType === XLSX) {
    if (!isZip(bytes)) return { ok: false, reason: 'content_mismatch' }
    return { ok: true, type: declaredType, ext: CONTRACT_EXT_FOR_TYPE[declaredType] }
  }

  const sniffed = sniffType(bytes)
  if (!sniffed || sniffed !== declaredType) return { ok: false, reason: 'content_mismatch' }
  return { ok: true, type: sniffed, ext: CONTRACT_EXT_FOR_TYPE[sniffed] }
}

export const CONTRACT_REJECTION_MESSAGE: Record<ContractUploadRejection, string> = {
  empty: 'The file is empty.',
  too_large: 'The file is too large (20 MB maximum).',
  type_not_allowed: 'This format is not supported — please use PDF, JPEG, PNG, WEBP, Word (.docx) or Excel (.xlsx).',
  content_mismatch: 'The file contents do not match its format. Please try a different file.',
}

/** Where the object lands: `<tenant>/<supplier>/<unique>.<ext>`. The tenant
 *  prefix lets the read route refuse to sign any path outside the caller's
 *  tenant, even if the column were tampered with. */
export function contractStorageKey(args: { tenantId: string; supplierId: string; unique: string; ext: string }): string {
  const tenant = safeKeySegment(args.tenantId, 'tenant')
  const supplier = safeKeySegment(args.supplierId, 'supplier')
  const unique = safeKeySegment(args.unique, 'file')
  const ext = safeKeySegment(args.ext, 'bin')
  return `${tenant}/${supplier}/${unique}.${ext}`
}

/** A title when the uploader gave none: the filename without its extension. */
export function titleFromFilename(filename: string): string {
  const base = String(filename ?? '').split(/[\\/]/).pop() ?? ''
  return base.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[_-]+/g, ' ').trim().slice(0, 200) || 'Document'
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** A YYYY-MM-DD string or null; anything else is a validation error. */
export function parseContractDate(v: unknown): { ok: true; value: string | null } | { ok: false } {
  if (v === undefined || v === null || v === '') return { ok: true, value: null }
  const s = String(v).slice(0, 10)
  if (!ISO_DATE.test(s) || Number.isNaN(Date.parse(`${s}T00:00:00Z`))) return { ok: false }
  return { ok: true, value: s }
}

// ------------------------------------------------------------------
// Validity — what the dates mean today
// ------------------------------------------------------------------

/** Renewal warning horizon: a contract ending within this many days is
 *  "expiring", so the renewal conversation starts before the rates lapse. */
export const CONTRACT_EXPIRING_DAYS = 60

export type ContractStatus = 'active' | 'expiring' | 'expired' | 'upcoming' | 'undated'

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  active: 'Active',
  expiring: 'Expiring soon',
  expired: 'Expired',
  upcoming: 'Not yet in force',
  undated: 'No dates',
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso}T00:00:00Z`)
  const to = Date.parse(`${toIso}T00:00:00Z`)
  return Math.round((to - from) / 86_400_000)
}

/** Dates are YYYY-MM-DD, compared as calendar days in the operator's day. */
export function contractStatus(
  validFrom: string | null | undefined,
  validTo: string | null | undefined,
  today: string
): ContractStatus {
  const from = validFrom ? String(validFrom).slice(0, 10) : null
  const to = validTo ? String(validTo).slice(0, 10) : null
  if (!from && !to) return 'undated'
  if (from && today < from) return 'upcoming'
  if (to && today > to) return 'expired'
  if (to && daysBetween(today, to) <= CONTRACT_EXPIRING_DAYS) return 'expiring'
  return 'active'
}

export function formatBytes(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(0)} KB`
  return `${(v / (1024 * 1024)).toFixed(1)} MB`
}

/** What the browser sees: never the storage path. */
export interface SupplierContract {
  id: string
  tenant_id: string
  supplier_id: string
  property_id: string | null
  document_type: ContractDocumentType | string
  title: string
  valid_from: string | null
  valid_to: string | null
  notes: string | null
  mime_type: string
  size_bytes: number
  original_filename: string | null
  uploaded_by: string | null
  created_at: string
  updated_at: string
  property?: { id: string; name: string } | null
}

// ------------------------------------------------------------------
// The renewal view — what the dashboard shows
// ------------------------------------------------------------------

/** A contract that lapsed this recently is still news: the rates it carried
 *  may be in live quotes. Older lapses are history, not a reminder. */
export const CONTRACT_EXPIRED_LOOKBACK_DAYS = 30

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Whole days from `today` to `date` (negative when `date` has passed). */
export function daysUntil(today: string, date: string): number {
  return daysBetween(today.slice(0, 10), date.slice(0, 10))
}

/** The valid_to range the dashboard reminder covers: recently expired
 *  through expiring within the warning horizon. */
export function contractsExpiryWindow(today: string): { from: string; to: string } {
  return { from: addDaysIso(today, -CONTRACT_EXPIRED_LOOKBACK_DAYS), to: addDaysIso(today, CONTRACT_EXPIRING_DAYS) }
}

/** "Expires in 12 days", "Expires today", "Expired 3 days ago". */
export function describeExpiry(today: string, validTo: string): string {
  const n = daysUntil(today, validTo)
  if (n === 0) return 'Expires today'
  if (n === 1) return 'Expires tomorrow'
  if (n > 1) return `Expires in ${n} days`
  if (n === -1) return 'Expired yesterday'
  return `Expired ${-n} days ago`
}
