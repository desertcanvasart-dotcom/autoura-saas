'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, User, CornerDownLeft } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useRole } from '@/hooks/useRole'
import {
  MAIN_NAV,
  SETTINGS_NAV,
  RATE_GROUPS,
  RATES_ROLES,
  JUMP_ONLY_PAGES,
  canSee,
  rateCategoryHref,
} from '@/lib/nav/config'
import type { PermissionRole } from '@/lib/roles'

// ⌘K jump-to: every page the person may open — the sidebar's, each rate
// category, every settings page, and the pages reached from inside another —
// plus clients by name. It makes up for the shorter sidebar.

export interface JumpEntry {
  label: string
  href: string
  icon: LucideIcon
  hint: string
  keywords: string[]
}

/** Every page a role may open, in the order ⌘K lists them when nothing is typed. */
export function jumpEntriesFor(role: PermissionRole): JumpEntry[] {
  const out: JumpEntry[] = []
  for (const section of MAIN_NAV) {
    for (const item of section.items) {
      if (!canSee(item.roles, role)) continue
      out.push({ label: item.label, href: item.href, icon: item.icon, hint: section.title ?? 'Main', keywords: item.keywords ?? [] })
    }
  }
  if (canSee(RATES_ROLES, role)) {
    for (const group of RATE_GROUPS) {
      for (const c of group.categories) {
        out.push({ label: c.label, href: rateCategoryHref(c.slug), icon: c.icon, hint: `Rates › ${group.title}`, keywords: ['rates'] })
      }
    }
  }
  for (const group of SETTINGS_NAV) {
    for (const item of group.items) {
      if (!canSee(item.roles, role)) continue
      out.push({ label: item.label, href: item.href, icon: item.icon, hint: `Settings › ${group.title}`, keywords: [...(item.keywords ?? []), 'settings'] })
    }
  }
  for (const page of JUMP_ONLY_PAGES) {
    if (!canSee(page.roles, role)) continue
    out.push({ label: page.label, href: page.href, icon: page.icon, hint: page.hint, keywords: page.keywords ?? [] })
  }
  // One entry per address (a page can be both a sidebar link and a tab).
  return out.filter((e, i) => out.findIndex(o => o.href === e.href) === i)
}

/** Label first, then words in the label, then keywords and where it lives. */
export function rankJump(entries: JumpEntry[], query: string): JumpEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return entries
  const score = (e: JumpEntry) => {
    const label = e.label.toLowerCase()
    if (label.startsWith(q)) return 0
    if (label.split(/[\s&›-]+/).some(w => w.startsWith(q))) return 1
    if (label.includes(q)) return 2
    if (e.keywords.some(k => k.toLowerCase().includes(q))) return 3
    if (e.hint.toLowerCase().includes(q)) return 4
    return -1
  }
  return entries
    .map(e => ({ e, s: score(e) }))
    .filter(x => x.s >= 0)
    .sort((a, b) => a.s - b.s)
    .map(x => x.e)
}

interface ClientHit { id: string; full_name?: string | null; email?: string | null; client_code?: string | null }

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const { role, canAccess } = useRole()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [clients, setClients] = useState<ClientHit[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const pages = useMemo(() => jumpEntriesFor(role), [role])
  const pageHits = useMemo(() => rankJump(pages, query).slice(0, query ? 12 : 40), [pages, query])

  // Records: clients by name, email, phone or code (the one list API that
  // searches). Bookings and quotes have no search endpoint yet.
  const canClients = canAccess(['admin', 'manager', 'member'])
  useEffect(() => {
    const q = query.trim()
    if (!open || !canClients || q.length < 2) { setClients([]); return }
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/clients?search=${encodeURIComponent(q)}&limit=5`, { signal: ctrl.signal })
        .then(r => r.json())
        .then(j => setClients(Array.isArray(j?.clients) ? j.clients : []))
        .catch(() => {})
    }, 200)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [query, open, canClients])

  const results = useMemo(() => [
    ...pageHits.map(p => ({ key: p.href, label: p.label, hint: p.hint, href: p.href, icon: p.icon })),
    ...clients.map(c => ({
      key: `client-${c.id}`,
      label: c.full_name || c.email || 'Client',
      hint: ['Client', c.client_code, c.email].filter(Boolean).join(' · '),
      href: `/clients/${c.id}`,
      icon: User as LucideIcon,
    })),
  ], [pageHits, clients])

  useEffect(() => { setCursor(0) }, [query])
  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${cursor}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  if (!open) return null

  const go = (href: string) => {
    onClose()
    router.push(href)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); const r = results[cursor]; if (r) go(r.href) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/30 px-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Jump to"
        className="w-full max-w-xl bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
        onMouseDown={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b border-gray-200">
          <Search size={18} strokeWidth={1.7} className="text-gray-400 shrink-0" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page, rate sheet, setting or client…"
            className="flex-1 h-12 text-[15px] outline-none bg-transparent border-0 focus:ring-0 px-0"
            role="combobox"
            aria-expanded="true"
            aria-controls="jump-results"
            aria-activedescendant={results[cursor] ? `jump-${cursor}` : undefined}
          />
          <kbd className="text-[11px] text-gray-400 border border-gray-200 rounded px-1.5 py-0.5">Esc</kbd>
        </div>
        <ul id="jump-results" ref={listRef} role="listbox" className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 && (
            <li className="px-4 py-6 text-sm text-gray-500 text-center">Nothing matches “{query}”.</li>
          )}
          {results.map((r, i) => {
            const Icon = r.icon
            return (
              <li
                key={r.key}
                id={`jump-${i}`}
                data-index={i}
                role="option"
                aria-selected={i === cursor}
                onMouseMove={() => setCursor(i)}
                onClick={() => go(r.href)}
                className={`flex items-center gap-3 px-4 py-2 cursor-pointer text-sm ${i === cursor ? 'bg-primary-50' : ''}`}
              >
                <Icon size={18} strokeWidth={1.7} className="text-gray-500 shrink-0" aria-hidden />
                <span className="text-gray-900 truncate">{r.label}</span>
                <span className="ml-auto text-xs text-gray-400 truncate">{r.hint}</span>
                {i === cursor && <CornerDownLeft size={14} strokeWidth={1.7} className="text-gray-400 shrink-0" aria-hidden />}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
