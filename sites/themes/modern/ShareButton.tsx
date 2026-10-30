'use client'
// Share this tour: the phone's own share sheet where there is one, else the
// link copied. Without script the button does nothing and hides itself.

import { useEffect, useState } from 'react'
import { t } from '../../i18n/strings'
import s from './theme.module.css'

export function ShareButton({ title, lang }: { title: string; lang: string }) {
  const [ready, setReady] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => { setReady(true) }, [])
  if (!ready) return null
  const share = async () => {
    const url = window.location.href
    try {
      if (navigator.share) { await navigator.share({ title, url }); return }
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* the visitor closed the sheet */ }
  }
  return (
    <button type="button" className={s.share} onClick={share}>
      <svg viewBox="0 0 24 24" aria-hidden="true" className={s.icon}><path d="M12 3v12M7 8l5-5 5 5M5 13v6h14v-6" /></svg>
      <span aria-live="polite">{copied ? t(lang, 'linkCopied') : t(lang, 'shareLabel')}</span>
    </button>
  )
}
