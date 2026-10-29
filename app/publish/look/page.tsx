'use client'
// ============================================
// Publish — the website's look (brand studio)
// ============================================
// Redesign, operator 2026-10-27: modern by default, never forced gold or
// beige — each agency picks its theme, its colours and its fonts. A preview
// shows the choice as it is made; colours that would be hard to read are
// flagged here and refused on save (lib/publish/brand.ts, the same rules the
// website applies). Managers save; everyone on the team may look.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, AlertTriangle, Palette as PaletteIcon } from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import { showToast } from '@/app/contexts/ToastContext'
import { contrastRatio, readableOn, MIN_TEXT_CONTRAST, MIN_UI_CONTRAST } from '@/lib/publish/brand'

type Palette = { primary: string; accent: string; ink: string; surface: string }
interface Look {
  archetype: string
  stored: { website: string | null }
  resolved: { palette: Palette; fontPair: string }
  problems: string[]
  languages: string[]
  about: Record<string, string>
  headline: Record<string, string>
  foundedYear: number | null
  footer: { legalEntity: string | null; termsUrl: string | null; privacyUrl: string | null; licenseNumber: string | null; address: string | null; whatsapp: string | null }
  choices: {
    archetypes: Array<{ key: string; defaults: { palette: Palette; fontPair: string } }>
    palettes: Array<{ key: string; label: string; palette: Palette }>
    fontPairs: Array<{ key: string; label: string; display: string; text: string }>
  }
}

const THEME_TEXT: Record<string, { label: string; text: string }> = {
  modern: { label: 'Modern', text: 'Clean and photo-led: a gallery, key facts at a glance, a sticky price for each group size, FAQ and related tours.' },
  private_journeys: { label: 'Private journeys', text: 'Quiet and editorial, for tailor-made trips: long itineraries, the price late, a consultation last.' },
  transparent_value: { label: 'Transparent value', text: 'Price-led: clear prices and what they buy up front, WhatsApp to ask.' },
}
const COLOUR_LABEL: Record<keyof Palette, string> = { primary: 'Main colour', accent: 'Accent', ink: 'Text', surface: 'Background' }
const HEX = /^#[0-9a-fA-F]{6}$/
/** The preview's sample price — an example, not a figure from your records. */
const SAMPLE_PRICE = new Intl.NumberFormat('en', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(841)

export default function PublishLookPage() {
  const { isAdmin, isManager } = useRole()
  const canManage = isAdmin || isManager
  const [look, setLook] = useState<Look | null>(null)
  const [archetype, setArchetype] = useState('modern')
  const [palette, setPalette] = useState<Palette | null>(null)
  const [fontPair, setFontPair] = useState('sleek')
  const [website, setWebsite] = useState('')
  const [legal, setLegal] = useState({ entity: '', termsUrl: '', privacyUrl: '' })
  const [about, setAbout] = useState<Record<string, string>>({})
  const [headline, setHeadline] = useState<Record<string, string>>({})
  const [foundedYear, setFoundedYear] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/publish/look').then(r => r.json()).then(j => {
      if (!j.success) throw new Error(j.error)
      setLook(j.data)
      setArchetype(j.data.archetype)
      setPalette(j.data.resolved.palette)
      setFontPair(j.data.resolved.fontPair)
      setWebsite(j.data.stored.website ?? '')
      setAbout(j.data.about ?? {})
      setHeadline(j.data.headline ?? {})
      setFoundedYear(j.data.foundedYear ? String(j.data.foundedYear) : '')
      setLegal({ entity: j.data.footer.legalEntity ?? '', termsUrl: j.data.footer.termsUrl ?? '', privacyUrl: j.data.footer.privacyUrl ?? '' })
    }).catch(e => showToast('error', e instanceof Error ? e.message : 'Could not load the look'))
  }, [])

  const issues = useMemo(() => {
    if (!palette) return []
    const out: string[] = []
    for (const k of Object.keys(COLOUR_LABEL) as Array<keyof Palette>) if (!HEX.test(palette[k])) out.push(`${COLOUR_LABEL[k]}: enter a colour as #RRGGBB.`)
    if (out.length) return out
    const text = contrastRatio(palette.ink, palette.surface)
    if (text < MIN_TEXT_CONTRAST) out.push(`Text on the background is hard to read (${text.toFixed(1)}:1, at least ${MIN_TEXT_CONTRAST}:1 needed).`)
    const ui = contrastRatio(palette.primary, palette.surface)
    if (ui < MIN_UI_CONTRAST) out.push(`The main colour barely stands out from the background (${ui.toFixed(1)}:1, at least ${MIN_UI_CONTRAST}:1 needed).`)
    return out
  }, [palette])

  if (!look || !palette) return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]" /></div>

  const font = look.choices.fontPairs.find(f => f.key === fontPair)
  const preset = look.choices.palettes.find(p => JSON.stringify(p.palette) === JSON.stringify(palette))?.key ?? 'custom'

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/publish/look', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ archetype, palette, fontPair, website, legal, about, headline, foundedYear: foundedYear.trim() || null }) })
      const j = await res.json()
      if (!j.success) throw new Error(j.error)
      showToast(j.data.warning ? 'warning' : 'success', j.data.warning ?? 'Saved — your website shows the new look now')
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Could not save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <Link href="/publish" className="inline-flex items-center gap-1 text-sm text-[#647C47]"><ArrowLeft className="h-4 w-4" />Website</Link>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-[#647C47]/10 rounded-lg flex items-center justify-center"><PaletteIcon className="h-5 w-5 text-[#647C47]" /></div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Look and feel</h1>
          <p className="text-sm text-gray-500">Your website&apos;s theme, colours and fonts. Prices and facts always come from your records.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-medium text-gray-900 mb-3">Theme</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {look.choices.archetypes.map(a => (
                <button key={a.key} type="button" disabled={!canManage} onClick={() => setArchetype(a.key)}
                  className={`text-left rounded-lg border p-3 transition ${archetype === a.key ? 'border-[#647C47] ring-2 ring-[#647C47]/20' : 'border-gray-200 hover:border-gray-300'}`}>
                  <span className="flex items-center justify-between font-medium text-gray-900">{THEME_TEXT[a.key]?.label ?? a.key}{archetype === a.key && <Check className="h-4 w-4 text-[#647C47]" />}</span>
                  <span className="mt-1 block text-xs text-gray-500">{THEME_TEXT[a.key]?.text}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-medium text-gray-900 mb-3">Colours</h2>
            <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
              {look.choices.palettes.map(p => (
                <button key={p.key} type="button" disabled={!canManage} onClick={() => setPalette(p.palette)}
                  className={`rounded-lg border p-2 text-left ${preset === p.key ? 'border-[#647C47] ring-2 ring-[#647C47]/20' : 'border-gray-200 hover:border-gray-300'}`}>
                  <span className="flex h-8 overflow-hidden rounded">
                    <span className="flex-[3]" style={{ background: p.palette.primary }} />
                    <span className="flex-1" style={{ background: p.palette.accent }} />
                  </span>
                  <span className="mt-1 block text-xs text-gray-700">{p.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-gray-500">Or your own colours{preset === 'custom' ? ' (in use)' : ''}:</p>
            <div className="mt-2 grid gap-3 grid-cols-2 md:grid-cols-4">
              {(Object.keys(COLOUR_LABEL) as Array<keyof Palette>).map(k => (
                <label key={k} className="text-xs text-gray-600">
                  {COLOUR_LABEL[k]}
                  <span className="mt-1 flex items-center gap-2">
                    <input type="color" value={HEX.test(palette[k]) ? palette[k] : '#000000'} disabled={!canManage}
                      onChange={e => setPalette({ ...palette, [k]: e.target.value })} className="h-9 w-9 rounded border border-gray-300" />
                    <input value={palette[k]} disabled={!canManage} onChange={e => setPalette({ ...palette, [k]: e.target.value.trim() })}
                      className="w-24 text-sm border border-gray-300 rounded px-2 py-1 font-mono" aria-label={`${COLOUR_LABEL[k]} as #RRGGBB`} />
                  </span>
                </label>
              ))}
            </div>
            {issues.length > 0 && (
              <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
                {issues.map(i => <p key={i} className="flex items-start gap-1"><AlertTriangle className="h-4 w-4 mt-0.5 flex-none" />{i}</p>)}
              </div>
            )}
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-medium text-gray-900 mb-3">Fonts</h2>
            <select value={fontPair} disabled={!canManage} onChange={e => setFontPair(e.target.value)} className="text-sm border border-gray-300 rounded-md px-3 py-2">
              {look.choices.fontPairs.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-medium text-gray-900 mb-1">Your main website</h2>
            <p className="text-xs text-gray-500 mb-2">If your tours live apart from your main website (for example on tours.youragency.com), the header links back to it. Leave empty if not.</p>
            <input value={website} disabled={!canManage} onChange={e => setWebsite(e.target.value)} placeholder="https://www.youragency.com"
              className="w-full max-w-md text-sm border border-gray-300 rounded-md px-3 py-2" />
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-medium text-gray-900 mb-1">Footer — who visitors are dealing with</h2>
            <p className="text-xs text-gray-500 mb-3">Every page&apos;s footer shows these. The website cannot go public until all six are filled in.</p>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="text-xs text-gray-600">Registered company name
                <input value={legal.entity} disabled={!canManage} onChange={e => setLegal({ ...legal, entity: e.target.value })} placeholder="Nile & Co Travel S.A.E."
                  className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2" />
              </label>
              <label className="text-xs text-gray-600">Booking terms (link)
                <input value={legal.termsUrl} disabled={!canManage} onChange={e => setLegal({ ...legal, termsUrl: e.target.value })} placeholder="https://…"
                  className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2" />
              </label>
              <label className="text-xs text-gray-600">Privacy notice (link)
                <input value={legal.privacyUrl} disabled={!canManage} onChange={e => setLegal({ ...legal, privacyUrl: e.target.value })} placeholder="https://…"
                  className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2" />
              </label>
            </div>
            <ul className="mt-3 grid gap-1 text-sm md:grid-cols-3">
              {([['ETAA licence number', look.footer.licenseNumber], ['Address', look.footer.address], ['WhatsApp', look.footer.whatsapp]] as const).map(([label, v]) => (
                <li key={label} className={`flex items-start gap-1 ${v ? 'text-gray-700' : 'text-amber-700'}`}>
                  {v ? <Check className="h-4 w-4 mt-0.5 flex-none text-[#647C47]" /> : <AlertTriangle className="h-4 w-4 mt-0.5 flex-none" />}
                  <span>{label}: {v ?? <>missing — <Link href="/settings/tenant" className="underline">add it in company settings</Link></>}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-medium text-gray-900 mb-1">Home page</h2>
            <p className="text-xs text-gray-500 mb-3">The big headline at the top of your home page. Leave a language empty to use &ldquo;Private tours in &lsquo;your city&rsquo; with Egyptologist guides&rdquo;. The year you started shows as &ldquo;Operating since&rdquo; under it.</p>
            <div className="space-y-3">
              {look.languages.map(l => (
                <label key={l} className="block text-xs text-gray-600">Headline · {new Intl.DisplayNames(['en'], { type: 'language' }).of(l) ?? l}
                  <input value={headline[l] ?? ''} disabled={!canManage} maxLength={120} onChange={e => setHeadline({ ...headline, [l]: e.target.value })}
                    className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2" />
                </label>
              ))}
              <label className="block text-xs text-gray-600">Year you started operating
                <input value={foundedYear} disabled={!canManage} inputMode="numeric" maxLength={4} placeholder="2008" onChange={e => setFoundedYear(e.target.value.replace(/\D/g, ''))}
                  className="mt-1 w-32 text-sm border border-gray-300 rounded-md px-3 py-2" />
              </label>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg p-4">
            <h2 className="font-medium text-gray-900 mb-1">About page</h2>
            <p className="text-xs text-gray-500 mb-3">Your own words about the company, shown on the About page above your licence and registration. Separate paragraphs with an empty line. Leave a language empty and its About page shows only your details.</p>
            <div className="space-y-3">
              {look.languages.map(l => (
                <label key={l} className="block text-xs text-gray-600">{new Intl.DisplayNames(['en'], { type: 'language' }).of(l) ?? l}
                  <textarea value={about[l] ?? ''} disabled={!canManage} rows={5} maxLength={6000} onChange={e => setAbout({ ...about, [l]: e.target.value })}
                    className="mt-1 w-full text-sm border border-gray-300 rounded-md px-3 py-2" />
                </label>
              ))}
            </div>
          </section>

          {canManage && (
            <button type="button" onClick={save} disabled={saving || issues.length > 0}
              className="inline-flex items-center gap-1 text-sm px-4 py-2 rounded-md bg-[#647C47] text-white disabled:opacity-40">
              <Check className="h-4 w-4" />{saving ? 'Saving…' : 'Save and update the website'}
            </button>
          )}
        </div>

        <aside className="lg:sticky lg:top-6 self-start">
          <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Preview</p>
          <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ background: HEX.test(palette.surface) ? palette.surface : '#fff', color: HEX.test(palette.ink) ? palette.ink : '#000' }}>
            <div className="p-5" style={{ background: HEX.test(palette.primary) ? palette.primary : '#000', color: HEX.test(palette.primary) ? readableOn(palette.primary) : '#fff' }}>
              <p className="text-[10px] uppercase tracking-[0.16em] opacity-80">{THEME_TEXT[archetype]?.label}</p>
              <p className="mt-2 text-2xl font-extrabold leading-none uppercase" style={{ fontFamily: `'${font?.display}', system-ui, sans-serif` }}>Egypt, your way</p>
              <span className="mt-4 inline-block rounded-full px-4 py-2 text-xs font-semibold"
                style={{ background: HEX.test(palette.accent) ? palette.accent : '#ccc', color: HEX.test(palette.accent) ? readableOn(palette.accent) : '#000' }}>Journeys →</span>
            </div>
            <div className="p-5 space-y-2" style={{ fontFamily: `'${font?.text}', system-ui, sans-serif` }}>
              <p className="font-semibold" style={{ fontFamily: `'${font?.display}', system-ui, sans-serif` }}>Classic Nile cruise</p>
              <p className="text-sm opacity-80">4 days · 3 nights · Luxor, Aswan</p>
              <p className="text-sm">From <strong style={{ color: HEX.test(palette.primary) ? palette.primary : undefined }}>{SAMPLE_PRICE}</strong> per person</p>
              <span className="inline-block rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ background: HEX.test(palette.primary) ? palette.primary : '#000', color: HEX.test(palette.primary) ? readableOn(palette.primary) : '#fff' }}>Send us an enquiry</span>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-500">{font?.label}. The website itself loads these fonts; this preview uses them where your computer has them.</p>
        </aside>
      </div>
    </div>
  )
}
