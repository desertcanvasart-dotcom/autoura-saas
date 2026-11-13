// WhatsApp attachments (2026-11-13): which files may be sent, how big, what
// name a download gets, where copies are kept, and the migration.
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import { PGlite } from '@electric-sql/pglite'
import {
  checkSendable, resolveMime, safeFileName, downloadName, kindOfLink, extFor, labelFor, SENDABLE_ACCEPT,
} from '@/lib/whatsapp/attachments'
import { outboundFilePath, inboundFilePath, storagePathBelongsTo } from '@/lib/whatsapp/voice-note-storage'
import { keepTwilioMedia } from '@/lib/whatsapp/keep-inbound-media'
import { parseMetaWebhook } from '@/lib/whatsapp-cloud-api'

const MB = 1024 * 1024

describe('what may be sent', () => {
  it('photos, video and documents — PDF, Word, Excel, PowerPoint, text, CSV', () => {
    for (const [name, type] of [
      ['a.jpg', 'image/jpeg'], ['a.png', 'image/png'], ['a.mp4', 'video/mp4'], ['a.pdf', 'application/pdf'],
      ['a.docx', ''], ['a.xlsx', ''], ['a.pptx', ''], ['a.txt', 'text/plain'], ['rates.csv', 'text/csv'],
    ]) expect(checkSendable({ name, type, size: 1000 }).ok, name).toBe(true)
  })

  it('refuses other files, empty ones, and anything over WhatsApp\'s size', () => {
    expect(checkSendable({ name: 'a.zip', type: 'application/zip', size: 10 })).toMatchObject({ ok: false })
    expect(checkSendable({ name: 'a.exe', type: '', size: 10 })).toMatchObject({ ok: false })
    expect(checkSendable({ name: 'a.webp', type: 'image/webp', size: 10 })).toMatchObject({ ok: false })
    expect(checkSendable({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toMatchObject({ ok: false })
    const big = checkSendable({ name: 'pic.jpg', type: 'image/jpeg', size: 6 * MB })
    expect(big).toMatchObject({ ok: false })
    expect(!big.ok && big.error).toMatch(/5 MB/)
    expect(checkSendable({ name: 'doc.pdf', type: 'application/pdf', size: 15 * MB }).ok).toBe(true)
    expect(checkSendable({ name: 'doc.pdf', type: 'application/pdf', size: 17 * MB }).ok).toBe(false)
  })

  it('the file\'s extension wins over a missing or wrong browser type (Windows calls a .csv Excel)', () => {
    expect(resolveMime('application/vnd.ms-excel', 'rates.csv')).toBe('text/csv')
    expect(resolveMime('', 'plan.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(resolveMime('application/octet-stream', 'x.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(resolveMime('image/jpeg', 'photo.JPEG')).toBe('image/jpeg')
    expect(resolveMime('', 'noextension')).toBe(null)
  })

  it('the picker offers what can be sent', () => {
    expect(SENDABLE_ACCEPT).toContain('.csv')
    expect(SENDABLE_ACCEPT).toContain('.xlsx')
    expect(SENDABLE_ACCEPT).not.toContain('.webp')
  })
})

describe('file names', () => {
  it('safe: letters, digits, dot, dash; the type\'s extension; never empty', () => {
    expect(safeFileName('Itinéraire Nil 2027 (v2).pdf', 'application/pdf')).toBe('Itineraire-Nil-2027-v2.pdf')
    expect(safeFileName('../../etc/passwd', 'text/plain')).toBe('etc-passwd.txt')
    expect(safeFileName('', 'image/jpeg')).toBe('file.jpg')
    expect(safeFileName('rates', 'text/csv')).toBe('rates.csv')
    expect(safeFileName('x'.repeat(200) + '.pdf', 'application/pdf').length).toBeLessThanOrEqual(80)
  })

  it('a download keeps its own name, else WhatsApp-<date>-<type>', () => {
    expect(downloadName({ media_filename: 'Passport scan.pdf', media_type: 'application/pdf' })).toBe('Passport-scan.pdf')
    expect(downloadName({ media_filename: null, media_type: 'image/jpeg', sent_at: '2026-11-12T10:00:00Z' })).toBe('WhatsApp-2026-11-12-photo.jpg')
    expect(downloadName({ media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', created_at: '2026-11-13T00:00:00Z' })).toBe('WhatsApp-2026-11-13-excel-sheet.xlsx')
  })

  it('Word, Excel and CSV keep their extension (were stored as .bin)', () => {
    expect(extFor('text/csv')).toBe('csv')
    expect(extFor('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx')
    expect(extFor('audio/ogg; codecs=opus')).toBe('ogg')
    expect(extFor('application/x-unknown')).toBe('bin')
    expect(labelFor('text/csv')).toBe('CSV file')
  })
})

describe('Meta: what a link is sent as, and a document\'s name', () => {
  it('by the link\'s extension', () => {
    expect(kindOfLink('https://x.supabase.co/storage/v1/object/sign/whatsapp-media/outbound/t/i/Plan.pdf?token=abc')).toBe('document')
    expect(kindOfLink('https://x/a/photo.jpg?token=1')).toBe('image')
    expect(kindOfLink('https://x/a/clip.mp4?token=1')).toBe('video')
    expect(kindOfLink('https://x/a/note.ogg?token=1')).toBe('audio')
    expect(kindOfLink('https://x/a/rates.csv?token=1')).toBe('document')
  })

  it('an inbound document keeps the file name the customer\'s WhatsApp sent', () => {
    const { messages } = parseMetaWebhook({ entry: [{ changes: [{ field: 'messages', value: {
      metadata: { display_phone_number: '201551772258' },
      messages: [{ id: 'wamid.1', from: '447700900123', type: 'document', document: { id: 'm1', mime_type: 'text/csv', filename: 'Group list.csv', caption: 'our names' } }],
    } }] }] })
    expect(messages[0]).toMatchObject({ mediaId: 'm1', mediaType: 'text/csv', mediaFilename: 'Group list.csv', body: 'our names' })
  })
})

describe('where files are kept, and which a message may point at', () => {
  const tenant = '11271ceb-709a-40ef-ba14-81cac60953a9'
  it('an attachment keeps its name in the path; the path belongs to its tenant only', () => {
    const p = outboundFilePath(tenant, 'abc-123', 'Plan-2027.pdf')
    expect(p).toBe(`outbound/${tenant}/abc-123/Plan-2027.pdf`)
    expect(storagePathBelongsTo(p, { message_sid: 'SMx', tenant_id: tenant })).toBe(true)
    expect(storagePathBelongsTo(p, { message_sid: 'SMx', tenant_id: '00000000-0000-0000-0000-000000000000' })).toBe(false)
    expect(storagePathBelongsTo(`outbound/${tenant}/abc/../../x.pdf`, { message_sid: 'SMx', tenant_id: tenant })).toBe(false)
    expect(storagePathBelongsTo(`outbound/${tenant}/abc.ogg`, { message_sid: 'SMx', tenant_id: tenant })).toBe(true)
  })

  it('an inbound copy is inbound/<its sid>.<ext>', () => {
    const p = inboundFilePath('MM0123456789abcdef0123456789abcdef', 'pdf')
    expect(p).toBe('inbound/MM0123456789abcdef0123456789abcdef.pdf')
    expect(storagePathBelongsTo(p, { message_sid: 'MM0123456789abcdef0123456789abcdef', tenant_id: tenant })).toBe(true)
    expect(storagePathBelongsTo(p, { message_sid: 'MMother', tenant_id: tenant })).toBe(false)
  })
})

describe('keeping our own copy of a Twilio file', () => {
  const ACC = 'AC' + 'a'.repeat(32)
  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACC}/Messages/MM${'b'.repeat(32)}/Media/ME${'c'.repeat(32)}`
  const sid = 'MM' + 'b'.repeat(32)

  function fakeAdmin(row: { media_storage_path: string | null } | null) {
    const calls: { uploads: Array<{ path: string; type: string; size: number }>; updates: Array<Record<string, unknown>> } = { uploads: [], updates: [] }
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row }) }) }),
        update: (patch: Record<string, unknown>) => ({ eq: () => ({ is: async () => { calls.updates.push(patch); return { error: null } } }) }),
      }),
      storage: { from: () => ({ upload: async (p: string, b: Uint8Array, o: { contentType: string }) => { calls.uploads.push({ path: p, type: o.contentType, size: b.byteLength }); return { error: null } } }) },
    }
    return { admin: admin as never, calls }
  }
  const twilio = (status: number, type = 'application/pdf', bytes = 3) =>
    (async () => new Response(new Uint8Array(bytes), { status, headers: { 'content-type': type } })) as unknown as typeof fetch

  it('copies the bytes to inbound/<sid>.<ext> and points the row at them', async () => {
    const { admin, calls } = fakeAdmin({ media_storage_path: null })
    const r = await keepTwilioMedia(admin, { message_sid: sid, media_url: url, media_type: 'application/pdf' }, { fetch: twilio(200), accountSid: ACC, authToken: 't' })
    expect(r).toEqual({ ok: true, path: `inbound/${sid}.pdf` })
    expect(calls.uploads).toEqual([{ path: `inbound/${sid}.pdf`, type: 'application/pdf', size: 3 }])
    expect(calls.updates).toEqual([{ media_storage_path: `inbound/${sid}.pdf` }])
  })

  it('never fetches a link that is not our own Twilio account\'s', async () => {
    const { admin, calls } = fakeAdmin({ media_storage_path: null })
    const r = await keepTwilioMedia(admin, { message_sid: sid, media_url: 'https://evil.example/x.pdf', media_type: null }, { fetch: twilio(200), accountSid: ACC, authToken: 't' })
    expect(r.ok).toBe(false)
    expect(calls.uploads).toEqual([])
  })

  it('skips a message that was not stored (a blocked sender) or already has a copy; reports a Twilio failure', async () => {
    const opts = { fetch: twilio(200), accountSid: ACC, authToken: 't' }
    expect(await keepTwilioMedia(fakeAdmin(null).admin, { message_sid: sid, media_url: url, media_type: null }, opts)).toEqual({ ok: false, reason: 'message not stored' })
    expect(await keepTwilioMedia(fakeAdmin({ media_storage_path: 'inbound/x.pdf' }).admin, { message_sid: sid, media_url: url, media_type: null }, opts)).toEqual({ ok: false, reason: 'already copied' })
    const failed = await keepTwilioMedia(fakeAdmin({ media_storage_path: null }).admin, { message_sid: sid, media_url: url, media_type: null }, { ...opts, fetch: twilio(404) })
    expect(failed).toEqual({ ok: false, reason: 'Twilio answered 404' })
  })
})

describe('466_whatsapp_media_filename', () => {
  let db: PGlite
  beforeAll(async () => {
    db = new PGlite()
    await db.exec('create table whatsapp_messages(id serial primary key, media_type text);')
    const mig = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/466_whatsapp_media_filename.sql'), 'utf8')
    await db.exec(mig)
    await db.exec(mig)
  }, 60_000)

  it('adds the column, empty by default, and replays', async () => {
    await db.exec("insert into whatsapp_messages(media_type) values ('application/pdf')")
    const { rows } = await db.query<{ media_filename: string | null }>('select media_filename from whatsapp_messages')
    expect(rows).toEqual([{ media_filename: null }])
  })
})
