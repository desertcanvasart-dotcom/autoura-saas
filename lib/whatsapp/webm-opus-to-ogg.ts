// ============================================
// A browser recording (WebM/Opus) → a WhatsApp voice note (Ogg/Opus)
// ============================================
// WhatsApp plays a voice note natively only when it is Ogg with the Opus codec
// (Twilio, "Guidance on WhatsApp Media Messages"). Chrome, Edge and Safari
// 18.4+ record Opus, but wrapped in WebM. The sound itself is already right,
// so this re-wraps it — the same Opus packets moved from one container to the
// other, no re-encoding, no ffmpeg. Pure: the voice-note route and the tests
// both call it.
//
// WebM side: walk the EBML tree, take OpusHead from the track's CodecPrivate
// and every audio frame from SimpleBlock / Block elements. MediaRecorder
// writes the Segment and Clusters with "unknown" sizes, so container elements
// are stepped INTO rather than skipped, which needs no sizes at all.
// Ogg side (RFC 3533 + RFC 7845): page 0 OpusHead, page 1 OpusTags, then the
// audio packets, each page stamped with the running sample count at 48 kHz.

const EBML_ID = {
  EBML: 0x1a45dfa3,
  Segment: 0x18538067,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  CodecID: 0x86,
  CodecPrivate: 0x63a2,
  Audio: 0xe1,
  Channels: 0x9f,
  Cluster: 0x1f43b675,
  BlockGroup: 0xa0,
  Block: 0xa1,
  SimpleBlock: 0xa3,
} as const

/** Elements whose children we read; everything else is skipped by its size. */
const CONTAINERS = new Set<number>([EBML_ID.Segment, EBML_ID.Tracks, EBML_ID.TrackEntry, EBML_ID.Audio, EBML_ID.Cluster, EBML_ID.BlockGroup])

export class VoiceNoteFormatError extends Error {}

interface Vint { value: number; length: number; unknown: boolean }

function readVint(b: Uint8Array, pos: number, keepMarker: boolean): Vint {
  const first = b[pos]
  if (first === undefined) throw new VoiceNoteFormatError('The recording ended unexpectedly.')
  let length = 1
  let mask = 0x80
  while (length <= 8 && !(first & mask)) { length++; mask >>= 1 }
  if (length > 8) throw new VoiceNoteFormatError('The recording is not a valid WebM file.')
  if (pos + length > b.length) throw new VoiceNoteFormatError('The recording ended unexpectedly.')
  let value = keepMarker ? first : first & (mask - 1)
  let allOnes = (first & (mask - 1)) === mask - 1
  for (let i = 1; i < length; i++) {
    value = value * 256 + b[pos + i]
    if (b[pos + i] !== 0xff) allOnes = false
  }
  return { value, length, unknown: !keepMarker && allOnes }
}

/** The pieces of a WebM/Opus recording that an Ogg file needs. */
export interface OpusTrack {
  opusHead: Uint8Array
  packets: Uint8Array[]
}

export function readWebmOpus(webm: Uint8Array): OpusTrack {
  if (readVint(webm, 0, true).value !== EBML_ID.EBML) throw new VoiceNoteFormatError('The recording is not a WebM file.')

  let opusHead: Uint8Array | null = null
  let codec = ''
  let channels = 1
  let audioTrack: number | null = null
  let currentTrack: { number?: number; codec?: string; priv?: Uint8Array; channels?: number } | null = null
  const finishTrack = () => {
    if (!currentTrack) return
    if (currentTrack.codec === 'A_OPUS' && audioTrack === null) {
      audioTrack = currentTrack.number ?? 1
      codec = 'A_OPUS'
      opusHead = currentTrack.priv ?? null
      channels = currentTrack.channels ?? 1
    } else if (currentTrack.codec && !codec) {
      codec = currentTrack.codec
    }
    currentTrack = null
  }
  const raw: Array<{ track: number; data: Uint8Array }> = []

  let pos = 0
  while (pos < webm.length) {
    const id = readVint(webm, pos, true)
    const size = readVint(webm, pos + id.length, false)
    const start = pos + id.length + size.length
    if (CONTAINERS.has(id.value)) {
      if (id.value === EBML_ID.TrackEntry) { finishTrack(); currentTrack = {} }
      pos = start // step into: its children follow
      continue
    }
    if (size.unknown) throw new VoiceNoteFormatError('The recording is not a valid WebM file.')
    const end = start + size.value
    if (end > webm.length) break // a recording cut short: keep what is whole
    const body = webm.subarray(start, end)
    switch (id.value) {
      case EBML_ID.TrackNumber: if (currentTrack) currentTrack.number = readUint(body); break
      case EBML_ID.CodecID: if (currentTrack) currentTrack.codec = new TextDecoder().decode(body).replace(/\0+$/, ''); break
      case EBML_ID.CodecPrivate: if (currentTrack) currentTrack.priv = body.slice(); break
      case EBML_ID.Channels: if (currentTrack) currentTrack.channels = readUint(body); break
      case EBML_ID.SimpleBlock:
      case EBML_ID.Block: {
        finishTrack()
        const track = readVint(body, 0, false)
        const flags = body[track.length + 2]
        if (flags & 0x06) throw new VoiceNoteFormatError('The recording uses a WebM layout this app cannot read.')
        raw.push({ track: track.value, data: body.slice(track.length + 3) })
        break
      }
    }
    pos = end
  }
  finishTrack()

  if (codec !== 'A_OPUS' || audioTrack === null) throw new VoiceNoteFormatError('The recording is not Opus audio.')
  const packets = raw.filter(r => r.track === audioTrack && r.data.length > 0).map(r => r.data)
  if (packets.length === 0) throw new VoiceNoteFormatError('The recording has no sound in it.')
  return { opusHead: opusHead ?? defaultOpusHead(channels), packets }
}

function readUint(b: Uint8Array): number {
  let v = 0
  for (const x of b) v = v * 256 + x
  return v
}

/** OpusHead for a track that carried none (RFC 7845 §5.1). */
function defaultOpusHead(channels: number): Uint8Array {
  const h = new Uint8Array(19)
  h.set(new TextEncoder().encode('OpusHead'))
  h[8] = 1
  h[9] = channels
  new DataView(h.buffer).setUint32(12, 48000, true)
  return h
}

/** Samples (at 48 kHz) one Opus packet decodes to — from its TOC byte (RFC 6716 §3.1). */
export function opusPacketSamples(packet: Uint8Array): number {
  if (packet.length === 0) return 0
  const toc = packet[0]
  const config = toc >> 3
  let frameTenthsMs: number
  if (config < 12) frameTenthsMs = [100, 200, 400, 600][config % 4]
  else if (config < 16) frameTenthsMs = [100, 200][config % 2]
  else frameTenthsMs = [25, 50, 100, 200][config % 4]
  const code = toc & 0x03
  const frames = code === 0 ? 1 : code === 3 ? (packet[1] ?? 0) & 0x3f : 2
  return (frames * frameTenthsMs * 48) / 10
}

// ---- Ogg ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
    t[i] = r >>> 0
  }
  return t
})()

export function oggCrc(bytes: Uint8Array): number {
  let crc = 0
  for (const b of bytes) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ b) & 0xff]) >>> 0
  return crc >>> 0
}

function oggPage(packets: Uint8Array[], granule: number, serial: number, sequence: number, headerType: number): Uint8Array {
  const lacing: number[] = []
  for (const p of packets) {
    let n = p.length
    while (n >= 255) { lacing.push(255); n -= 255 }
    lacing.push(n)
  }
  const bodyLength = packets.reduce((n, p) => n + p.length, 0)
  const page = new Uint8Array(27 + lacing.length + bodyLength)
  const v = new DataView(page.buffer)
  page.set([0x4f, 0x67, 0x67, 0x53]) // "OggS"
  page[4] = 0
  page[5] = headerType
  v.setUint32(6, granule % 2 ** 32, true)
  v.setUint32(10, Math.floor(granule / 2 ** 32), true)
  v.setUint32(14, serial, true)
  v.setUint32(18, sequence, true)
  page[26] = lacing.length
  page.set(lacing, 27)
  let at = 27 + lacing.length
  for (const p of packets) { page.set(p, at); at += p.length }
  v.setUint32(22, oggCrc(page), true)
  return page
}

function opusTags(): Uint8Array {
  const vendor = new TextEncoder().encode('Autoura')
  const t = new Uint8Array(8 + 4 + vendor.length + 4)
  const v = new DataView(t.buffer)
  t.set(new TextEncoder().encode('OpusTags'))
  v.setUint32(8, vendor.length, true)
  t.set(vendor, 12)
  v.setUint32(12 + vendor.length, 0, true)
  return t
}

/** Packets per audio page: about a second of 20 ms frames, well inside 255 lacing values. */
const PACKETS_PER_PAGE = 50

export function writeOggOpus(track: OpusTrack, serial = 0x41555452): Uint8Array {
  const pages: Uint8Array[] = []
  let seq = 0
  pages.push(oggPage([track.opusHead], 0, serial, seq++, 0x02))
  pages.push(oggPage([opusTags()], 0, serial, seq++, 0x00))
  let granule = 0
  for (let i = 0; i < track.packets.length; i += PACKETS_PER_PAGE) {
    const chunk = track.packets.slice(i, i + PACKETS_PER_PAGE)
    // A packet over 255 lacing values' worth would not fit; Opus packets are
    // at most ~1.3 KB, so this never splits in practice — but stay correct.
    for (const p of chunk) granule += opusPacketSamples(p)
    const last = i + PACKETS_PER_PAGE >= track.packets.length
    pages.push(oggPage(chunk, granule, serial, seq++, last ? 0x04 : 0x00))
  }
  const out = new Uint8Array(pages.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of pages) { out.set(p, at); at += p.length }
  return out
}

/** Is this already an Ogg/Opus file (Firefox records these directly)? */
export function isOggOpus(b: Uint8Array): boolean {
  if (b.length < 36 || b[0] !== 0x4f || b[1] !== 0x67 || b[2] !== 0x67 || b[3] !== 0x53) return false
  const segments = b[26]
  const head = new TextDecoder().decode(b.subarray(27 + segments, 27 + segments + 8))
  return head === 'OpusHead'
}

/** Seconds of sound in an Ogg/Opus file we wrote or received, from its last page. */
export function oggOpusDurationSeconds(b: Uint8Array): number {
  for (let i = b.length - 27; i >= 0; i--) {
    if (b[i] === 0x4f && b[i + 1] === 0x67 && b[i + 2] === 0x67 && b[i + 3] === 0x53) {
      const v = new DataView(b.buffer, b.byteOffset + i)
      const granule = v.getUint32(6, true) + v.getUint32(10, true) * 2 ** 32
      const preSkip = isOggOpus(b) ? new DataView(b.buffer, b.byteOffset + 27 + b[26]).getUint16(10, true) : 0
      return Math.max(0, granule - preSkip) / 48000
    }
  }
  return 0
}

/** A browser recording → an Ogg/Opus voice note. Ogg passes through untouched. */
export function toWhatsAppVoiceNote(recording: Uint8Array): Uint8Array {
  if (isOggOpus(recording)) return recording
  return writeOggOpus(readWebmOpus(recording))
}
