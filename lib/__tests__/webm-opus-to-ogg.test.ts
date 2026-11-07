// A browser recording becomes a WhatsApp voice note (Ogg/Opus) — 2026-11-07.
// The fixture is a real 1.5 s Chrome MediaRecorder recording
// (audio/webm;codecs=opus, a 440 Hz tone). Its conversion was decoded by
// Chrome when this was written: 1.44 s, 440 Hz.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  readWebmOpus, writeOggOpus, toWhatsAppVoiceNote, isOggOpus, oggOpusDurationSeconds,
  opusPacketSamples, oggCrc, VoiceNoteFormatError,
} from '@/lib/whatsapp/webm-opus-to-ogg'

const webm = new Uint8Array(readFileSync(join(__dirname, 'fixtures', 'chrome-voice-note.webm')))

/** Every page of an Ogg file: header fields, and whether its CRC holds. */
function pages(ogg: Uint8Array) {
  const out: Array<{ type: number; granule: number; seq: number; crcOk: boolean; packets: number }> = []
  let at = 0
  while (at < ogg.length) {
    expect(String.fromCharCode(...ogg.subarray(at, at + 4))).toBe('OggS')
    const v = new DataView(ogg.buffer, ogg.byteOffset + at)
    const segs = ogg[at + 26]
    const lacing = ogg.subarray(at + 27, at + 27 + segs)
    const bodyLen = lacing.reduce((n, x) => n + x, 0)
    const page = ogg.slice(at, at + 27 + segs + bodyLen)
    const stored = new DataView(page.buffer).getUint32(22, true)
    new DataView(page.buffer).setUint32(22, 0, true)
    out.push({
      type: ogg[at + 5],
      granule: v.getUint32(6, true) + v.getUint32(10, true) * 2 ** 32,
      seq: v.getUint32(18, true),
      crcOk: oggCrc(page) === stored,
      packets: [...lacing].filter(x => x < 255).length,
    })
    at += 27 + segs + bodyLen
  }
  return out
}

describe('reading a Chrome recording', () => {
  it('finds the Opus header and every audio frame', () => {
    const t = readWebmOpus(webm)
    expect(String.fromCharCode(...t.opusHead.subarray(0, 8))).toBe('OpusHead')
    expect(t.packets.length).toBe(24) // Chrome writes 60 ms frames: 24 × 60 ms = 1.44 s
    expect(t.packets.every(p => opusPacketSamples(p) === 2880)).toBe(true)
  })
})

describe('writing the voice note', () => {
  const ogg = toWhatsAppVoiceNote(webm)

  it('is Ogg/Opus, as WhatsApp plays natively', () => {
    expect(isOggOpus(ogg)).toBe(true)
  })

  it('has valid pages: OpusHead first, OpusTags, audio, an end mark, every CRC right', () => {
    const p = pages(ogg)
    expect(p[0]).toMatchObject({ type: 0x02, granule: 0, seq: 0, packets: 1 })
    expect(p[1]).toMatchObject({ type: 0x00, granule: 0, seq: 1, packets: 1 })
    expect(p[p.length - 1].type).toBe(0x04)
    expect(p.every(x => x.crcOk)).toBe(true)
    expect(p.map(x => x.seq)).toEqual(p.map((_, i) => i))
    expect(p.slice(2).reduce((n, x) => n + x.packets, 0)).toBe(24)
  })

  it('carries the recording’s length', () => {
    const last = pages(ogg).at(-1)!
    expect(last.granule).toBe(24 * 2880)
    // Chrome's OpusHead declares no pre-skip, so the length is the whole 1.44 s.
    expect(oggOpusDurationSeconds(ogg)).toBeCloseTo(1.44, 3)
  })

  it('leaves an Ogg/Opus recording (Firefox) untouched', () => {
    expect(toWhatsAppVoiceNote(ogg)).toBe(ogg)
  })

  it('splits long recordings over several pages', () => {
    const t = readWebmOpus(webm)
    const long = writeOggOpus({ opusHead: t.opusHead, packets: [...t.packets, ...t.packets, ...t.packets] })
    const p = pages(long)
    expect(p.length).toBe(2 + 2) // 72 packets: 50 + 22
    expect(p[2].granule).toBe(50 * 2880)
    expect(p[3].granule).toBe(72 * 2880)
  })
})

describe('refuses what is not a voice recording', () => {
  it('a non-WebM file', () => {
    expect(() => toWhatsAppVoiceNote(new TextEncoder().encode('hello, not audio at all'))).toThrow(VoiceNoteFormatError)
  })
  it('a truncated header', () => {
    expect(() => toWhatsAppVoiceNote(webm.subarray(0, 40))).toThrow(VoiceNoteFormatError)
  })
})

describe('Opus frame lengths (RFC 6716 TOC byte)', () => {
  it.each([
    [0x00, 480],   // SILK 10 ms, one frame
    [0x08, 960],   // SILK 20 ms
    [0x18, 2880],  // SILK 60 ms
    [0xf8, 960],   // CELT 20 ms
    [0xf9, 1920],  // CELT 20 ms × 2 frames
  ])('TOC %i → %i samples', (toc, samples) => {
    expect(opusPacketSamples(new Uint8Array([toc, 0]))).toBe(samples)
  })
  it('code 3 reads the frame count from the second byte', () => {
    expect(opusPacketSamples(new Uint8Array([0xfb, 0x03]))).toBe(3 * 960)
  })
})
