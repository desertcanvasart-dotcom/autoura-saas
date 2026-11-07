// A customer's voice note becomes text (2026-11-07). OpenAI is mocked here;
// the real call was checked by hand with an English and an Arabic sentence.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const create = vi.fn()
vi.mock('openai', () => ({
  default: class { audio = { transcriptions: { create } } },
  toFile: async (bytes: Uint8Array, name: string, opts: { type: string }) => ({ bytes, name, type: opts.type }),
}))

import { transcribeMessage, type VoiceRow } from '@/lib/whatsapp/transcribe'
import { messageWords, transcriptOf, transcriptText, withTranscript, isVoiceMessage } from '@/lib/whatsapp/transcript'

const T = '11111111-2222-3333-4444-555555555555'
const row = (over: Partial<VoiceRow> = {}): VoiceRow => ({
  id: 'm1', tenant_id: T, message_sid: 'SM1', direction: 'inbound', media_type: 'audio/ogg',
  media_url: null, media_storage_path: `outbound/${T}/abc.ogg`, metadata: { keep: 1 }, ...over,
})

/** A fake service-role client recording every metadata write. */
function fakeAdmin(audio: Uint8Array | null = new Uint8Array([1, 2, 3])) {
  const writes: unknown[] = []
  const admin = {
    storage: { from: () => ({ download: async () => (audio ? { data: new Blob([audio]), error: null } : { data: null, error: { message: 'x' } }) }) },
    from: () => ({
      update: (v: { metadata: unknown }) => { writes.push(v.metadata); return { eq: () => ({ eq: async () => ({ error: null }) }) } },
    }),
  }
  return { admin: admin as never, writes }
}

beforeEach(() => { process.env.OPENAI_API_KEY = 'sk-test'; delete process.env.WHATSAPP_TRANSCRIBE; create.mockReset() })
afterEach(() => { delete process.env.OPENAI_API_KEY })

describe('transcribing a voice note', () => {
  it('saves pending, then the words — keeping the other metadata', async () => {
    create.mockResolvedValue({ text: ' Hello, a Nile cruise for four. ' })
    const { admin, writes } = fakeAdmin()
    const out = await transcribeMessage(admin, row())
    expect(out).toMatchObject({ ok: true, transcript: { status: 'done', text: 'Hello, a Nile cruise for four.' } })
    expect(writes).toHaveLength(2)
    expect(writes[0]).toMatchObject({ keep: 1, transcript: { status: 'pending' } })
    expect(writes[1]).toMatchObject({ keep: 1, transcript: { status: 'done', text: 'Hello, a Nile cruise for four.' } })
    expect(create.mock.calls[0][0]).toMatchObject({ model: 'gpt-4o-mini-transcribe', file: { name: 'voice.ogg', type: 'audio/ogg' } })
  })

  it('a finished transcript is reused — no second charge — unless forced', async () => {
    const done = { transcript: { status: 'done', text: 'already' } }
    const { admin, writes } = fakeAdmin()
    expect(await transcribeMessage(admin, row({ metadata: done }))).toMatchObject({ ok: true, reused: true })
    expect(create).not.toHaveBeenCalled()
    expect(writes).toHaveLength(0)
    create.mockResolvedValue({ text: 'again' })
    expect(await transcribeMessage(admin, row({ metadata: done }), { force: true })).toMatchObject({ ok: true, transcript: { text: 'again' } })
  })

  it('a provider error is saved as failed, so the inbox can offer to try again', async () => {
    create.mockRejectedValue(new Error('rate limited'))
    const { admin, writes } = fakeAdmin()
    const out = await transcribeMessage(admin, row())
    expect(out).toMatchObject({ ok: true, transcript: { status: 'failed', error: 'rate limited' } })
    expect(writes.at(-1)).toMatchObject({ transcript: { status: 'failed' } })
  })

  it('a file that is not this message’s is never read', async () => {
    const { admin, writes } = fakeAdmin()
    const out = await transcribeMessage(admin, row({ media_storage_path: 'outbound/99999999-0000-0000-0000-000000000000/x.ogg' }))
    expect(out).toMatchObject({ ok: true, transcript: { status: 'failed' } })
    expect(create).not.toHaveBeenCalled()
    expect(writes.at(-1)).toMatchObject({ transcript: { status: 'failed' } })
  })

  it('does nothing without a key, when switched off, or for a non-audio message', async () => {
    const { admin } = fakeAdmin()
    delete process.env.OPENAI_API_KEY
    expect(await transcribeMessage(admin, row())).toEqual({ ok: false, reason: 'disabled' })
    process.env.OPENAI_API_KEY = 'sk-test'
    process.env.WHATSAPP_TRANSCRIBE = 'off'
    expect(await transcribeMessage(admin, row())).toEqual({ ok: false, reason: 'disabled' })
    delete process.env.WHATSAPP_TRANSCRIBE
    expect(await transcribeMessage(admin, row({ media_type: 'image/jpeg' }))).toEqual({ ok: false, reason: 'not_voice' })
  })

  it('leaves one already running alone (for two minutes)', async () => {
    const { admin } = fakeAdmin()
    const pending = { transcript: { status: 'pending', at: new Date().toISOString() } }
    expect(await transcribeMessage(admin, row({ metadata: pending }))).toMatchObject({ ok: false, reason: 'busy' })
    create.mockResolvedValue({ text: 'took over' })
    const stale = { transcript: { status: 'pending', at: new Date(Date.now() - 5 * 60_000).toISOString() } }
    expect(await transcribeMessage(admin, row({ metadata: stale }))).toMatchObject({ ok: true, transcript: { text: 'took over' } })
  })
})

describe('what a message says', () => {
  it('typed text first, else the voice note’s transcript', () => {
    expect(messageWords({ message_body: 'Hi' , metadata: { transcript: { status: 'done', text: 'ignored' } } })).toBe('Hi')
    expect(messageWords({ message_body: '', metadata: { transcript: { status: 'done', text: ' مرحبا ' } } })).toBe('مرحبا')
    expect(messageWords({ message_body: '', metadata: { transcript: { status: 'failed' } } })).toBe('')
    expect(messageWords({ message_body: null, message_text: 'legacy' })).toBe('legacy')
  })
  it('reads only a well-formed transcript', () => {
    expect(transcriptOf({ transcript: { status: 'weird' } })).toBeNull()
    expect(transcriptOf(null)).toBeNull()
    expect(transcriptText({ transcript: { status: 'pending', text: 'x' } })).toBe('')
  })
  it('sets the transcript without dropping other metadata', () => {
    expect(withTranscript({ voice_note: true }, { status: 'done', text: 'a' })).toEqual({ voice_note: true, transcript: { status: 'done', text: 'a' } })
    expect(withTranscript(['bad'], { status: 'failed' })).toEqual({ transcript: { status: 'failed' } })
  })
  it('knows a voice message', () => {
    expect(isVoiceMessage({ media_type: 'audio/ogg', media_url: 'https://api.twilio.com/x' })).toBe(true)
    expect(isVoiceMessage({ media_type: 'audio/ogg' })).toBe(false)
    expect(isVoiceMessage({ media_type: 'image/png', media_storage_path: 'x' })).toBe(false)
  })
})
