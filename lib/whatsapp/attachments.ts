// ============================================
// WhatsApp attachments — which files, how big, under what name (2026-11-13)
// ============================================
// Operator: "check the mechanism to download documents coming from customers
// on WhatsApp, and whether we can upload documents as well — images, docs,
// CSV files and similar." Inbound files opened but saved under an internal id,
// stayed only on Twilio, and the inbox could not send a file at all.
//
// One rule for every place that touches an attachment: the webhook (what to
// call a file it stores), the inbox's attach button and its route (what may
// be sent, how big), the media route (what name a download gets) and the
// Meta sender (image / video / audio / document).
//
// Sizes are WhatsApp's own ceilings, capped at Twilio's 16 MB for everything
// because Twilio is the live provider; a bigger file is refused here with a
// message rather than by the provider after the upload.
//
// Pure: the browser and the server both import it.

export type AttachmentKind = 'image' | 'video' | 'audio' | 'document'

interface FileType {
  ext: string
  kind: AttachmentKind
  label: string
  /** May staff send it from the inbox? (webp arrives as stickers only). */
  sendable: boolean
}

const MB = 1024 * 1024

export const MAX_BYTES: Record<AttachmentKind, number> = {
  image: 5 * MB,
  video: 16 * MB,
  audio: 16 * MB,
  document: 16 * MB,
}

/** Every type we know, by MIME. */
export const FILE_TYPES: Record<string, FileType> = {
  'image/jpeg': { ext: 'jpg', kind: 'image', label: 'Photo', sendable: true },
  'image/png': { ext: 'png', kind: 'image', label: 'Photo', sendable: true },
  'image/webp': { ext: 'webp', kind: 'image', label: 'Sticker', sendable: false },
  'video/mp4': { ext: 'mp4', kind: 'video', label: 'Video', sendable: true },
  'video/3gpp': { ext: '3gp', kind: 'video', label: 'Video', sendable: true },
  'audio/ogg': { ext: 'ogg', kind: 'audio', label: 'Voice message', sendable: false },
  'audio/mpeg': { ext: 'mp3', kind: 'audio', label: 'Audio', sendable: true },
  'audio/aac': { ext: 'aac', kind: 'audio', label: 'Audio', sendable: true },
  'audio/amr': { ext: 'amr', kind: 'audio', label: 'Audio', sendable: false },
  'audio/mp4': { ext: 'm4a', kind: 'audio', label: 'Audio', sendable: true },
  'application/pdf': { ext: 'pdf', kind: 'document', label: 'PDF', sendable: true },
  'application/msword': { ext: 'doc', kind: 'document', label: 'Word document', sendable: true },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', kind: 'document', label: 'Word document', sendable: true },
  'application/vnd.ms-excel': { ext: 'xls', kind: 'document', label: 'Excel sheet', sendable: true },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', kind: 'document', label: 'Excel sheet', sendable: true },
  'application/vnd.ms-powerpoint': { ext: 'ppt', kind: 'document', label: 'PowerPoint', sendable: true },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', kind: 'document', label: 'PowerPoint', sendable: true },
  'text/plain': { ext: 'txt', kind: 'document', label: 'Text file', sendable: true },
  'text/csv': { ext: 'csv', kind: 'document', label: 'CSV file', sendable: true },
}

const BY_EXT: Record<string, string> = Object.fromEntries(
  Object.entries(FILE_TYPES).map(([mime, t]) => [t.ext, mime]),
)
// Other spellings of the same files.
BY_EXT.jpeg = 'image/jpeg'
BY_EXT.opus = 'audio/ogg'

/** "audio/ogg; codecs=opus" → "audio/ogg". */
export const bareMime = (mime: string | null | undefined): string =>
  String(mime ?? '').split(';')[0].trim().toLowerCase()

const extOfName = (name: string | null | undefined): string => {
  const m = String(name ?? '').toLowerCase().match(/\.([a-z0-9]{1,5})$/)
  return m ? m[1] : ''
}

/**
 * The MIME a file really is. The extension wins when the browser's type is
 * missing, generic, or a known mislabel (Windows reports a .csv as
 * "application/vnd.ms-excel").
 */
export function resolveMime(declared: string | null | undefined, fileName: string | null | undefined): string | null {
  const fromExt = BY_EXT[extOfName(fileName)]
  const mime = bareMime(declared)
  if (fromExt && (!mime || mime === 'application/octet-stream' || FILE_TYPES[mime]?.ext !== extOfName(fileName))) return fromExt
  if (FILE_TYPES[mime]) return mime
  return fromExt ?? null
}

export const kindOf = (mime: string | null | undefined): AttachmentKind | null => FILE_TYPES[bareMime(mime)]?.kind ?? null
export const extFor = (mime: string | null | undefined): string => FILE_TYPES[bareMime(mime)]?.ext ?? 'bin'
export const labelFor = (mime: string | null | undefined): string => FILE_TYPES[bareMime(mime)]?.label ?? 'Attachment'

/** The accept= list for the inbox's file picker. */
export const SENDABLE_ACCEPT = Object.entries(FILE_TYPES)
  .filter(([, t]) => t.sendable)
  .flatMap(([mime, t]) => [mime, `.${t.ext}`])
  .join(',')

export type SendCheck = { ok: true; mime: string; kind: AttachmentKind } | { ok: false; error: string }

/** May this file be sent on WhatsApp? Type and size, said plainly. */
export function checkSendable(file: { name: string; type: string; size: number }): SendCheck {
  const mime = resolveMime(file.type, file.name)
  const type = mime ? FILE_TYPES[mime] : undefined
  if (!mime || !type || !type.sendable) {
    return { ok: false, error: `WhatsApp can't send "${file.name}". Send a photo (JPG, PNG), a video (MP4) or a document (PDF, Word, Excel, PowerPoint, text, CSV).` }
  }
  if (file.size === 0) return { ok: false, error: `"${file.name}" is empty.` }
  const max = MAX_BYTES[type.kind]
  if (file.size > max) {
    return { ok: false, error: `"${file.name}" is ${(file.size / MB).toFixed(1)} MB; WhatsApp takes ${type.kind === 'image' ? 'photos' : 'files'} up to ${max / MB} MB.` }
  }
  return { ok: true, mime, kind: type.kind }
}

/**
 * A file name safe for a storage path and a download: letters, digits, dot,
 * dash and underscore only, at most 80 characters, ending in the extension
 * the type says. Never empty.
 */
export function safeFileName(name: string | null | undefined, mime: string | null | undefined): string {
  const ext = extFor(mime)
  const base = String(name ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80 - ext.length - 1)
  return `${base || 'file'}.${ext}`
}

/** The name a download is saved under: its own, else WhatsApp-<date>-<type>.<ext>. */
export function downloadName(row: { media_filename?: string | null; media_type?: string | null; created_at?: string | null; sent_at?: string | null }): string {
  if (row.media_filename) return safeFileName(row.media_filename, row.media_type)
  const when = String(row.sent_at || row.created_at || '').slice(0, 10) || 'file'
  const what = labelFor(row.media_type).toLowerCase().replace(/[^a-z]+/g, '-')
  return safeFileName(`WhatsApp-${when}-${what}`, row.media_type)
}

/**
 * Meta sends a link by type: image, video, audio, or a document with its
 * file name. Decided from the link's own extension (our stored paths always
 * end in it).
 */
export function kindOfLink(url: string): AttachmentKind {
  const ext = extOfName(String(url).split('?')[0])
  return kindOf(BY_EXT[ext]) ?? 'document'
}
