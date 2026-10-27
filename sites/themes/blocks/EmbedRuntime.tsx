'use client'
// Inside a block on the agency's own website (embed mode). The block is the
// renderer's page in a frame; this keeps it working there:
//   · links to the site's pages stay inside the block (/embed/{key}/…);
//   · WhatsApp and outside links open a new tab (wa.me refuses to be framed);
//   · the enquiry form says which block it came from, and which of the
//     agency's pages (the frame's referrer) — the app records that page;
//   · the block tells the agency's page its height, so the frame fits.
// Clicks and sends are handled as they happen (one listener each), so cards
// a filter redraws behave the same as the first ones.

import { useEffect } from 'react'

export function EmbedRuntime() {
  useEffect(() => {
    const m = window.location.pathname.match(/^\/embed\/([A-Za-z0-9]{20,40})\//)
    if (!m) return
    const key = m[1]
    // The agency's page is the referrer only on the block's first load; after
    // a click inside the block it is the block itself. Remember the first.
    let agencyPage = ''
    try {
      const ref = document.referrer && new URL(document.referrer)
      if (ref && ref.origin !== window.location.origin) sessionStorage.setItem(`autoura-landing-${key}`, ref.href)
      agencyPage = sessionStorage.getItem(`autoura-landing-${key}`) ?? ''
    } catch {
      agencyPage = document.referrer // storage blocked: the first page still counts
    }

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a) return
      const href = a.getAttribute('href') ?? ''
      if (href.startsWith('#')) return
      if (href.startsWith('/api/wa')) {
        e.preventDefault()
        window.open(`${href}${href.includes('?') ? '&' : '?'}key=${key}`, '_blank', 'noopener')
      } else if (href.startsWith('/') && !href.startsWith('/embed/') && !href.startsWith('/api/')) {
        e.preventDefault()
        window.location.assign(`/embed/${key}${href}`)
      } else if (/^(https?:|mailto:|tel:)/.test(href)) {
        e.preventDefault()
        window.open(href, '_blank', 'noopener')
      }
    }
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement
      if (f.getAttribute('action') !== '/api/enquire') return
      const set = (name: string, value: string) => {
        let i = f.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`)
        if (!i) { i = document.createElement('input'); i.type = 'hidden'; i.name = name; f.appendChild(i) }
        i.value = value
      }
      set('embed_key', key)
      if (agencyPage) set('landing', agencyPage)
    }
    document.addEventListener('click', onClick)
    document.addEventListener('submit', onSubmit, true)

    const post = () => window.parent.postMessage({ autoura: 'height', height: document.documentElement.scrollHeight, frame: window.name }, '*')
    post()
    const ro = new ResizeObserver(post)
    ro.observe(document.body)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('submit', onSubmit, true)
      ro.disconnect()
    }
  }, [])
  return null
}
