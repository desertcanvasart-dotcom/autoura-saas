// ============================================
// A network supplier's papers (licence, vehicle papers) — Phase 3, 453
// ============================================
// Uploaded by the supplier from their inbox into the private bucket
// `supplier-network`; read only by the Autoura team (signed links). The file
// is checked by its contents, not its name (the supplier-contracts check),
// and only PDFs and photos are taken.

import { checkContractUpload } from '@/lib/supplier-contracts'

export const NETWORK_PAPERS_BUCKET = 'supplier-network'
export const MAX_PAPER_BYTES = 10 * 1024 * 1024
export const PAPER_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
export { PAPER_KINDS } from '@/lib/supplier-network'
export const MAX_PAPERS = 12

export function checkPaperUpload(bytes: Uint8Array, declaredType: string): { ok: true; type: string; ext: string } | { ok: false; error: string } {
  if (!bytes || bytes.length === 0) return { ok: false, error: 'The file is empty.' }
  if (bytes.length > MAX_PAPER_BYTES) return { ok: false, error: 'The file is too large (10 MB maximum).' }
  if (!PAPER_TYPES.includes(declaredType)) return { ok: false, error: 'Please upload a PDF or a photo (JPEG, PNG, WEBP).' }
  const v = checkContractUpload(bytes, declaredType)
  if (!v.ok) return { ok: false, error: 'The file contents do not match its format. Please try a different file.' }
  return v
}

/** `<account>/<unique>.<ext>` — the account prefix lets reads refuse any other path. */
export function paperKey(accountId: string, unique: string, ext: string): string {
  return `${accountId}/${unique}.${ext}`
}
