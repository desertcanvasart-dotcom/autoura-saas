'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Sparkles, Menu, X, User, Settings, LogOut, Shield, Check } from 'lucide-react'
import { useAuth } from '@/app/contexts/AuthContext'
import { useTenant } from '@/app/contexts/TenantContext'
import { useRole } from '@/hooks/useRole'
import NotificationBell from '@/components/NotificationBell'
import CommandPalette from '@/components/nav/CommandPalette'
import CopilotPanel from '@/components/nav/CopilotPanel'

// Which build you are looking at — shown beside the tenant's name.
//
// There are two Autoura apps and they read identically in a screenshot: this
// one (getautoura.net, the SaaS) and the autoura.net "Autoura Ops" app. The
// tag exists to tell them apart while working on them.
//
// It is therefore OFF in production by default. The slot it sits next to is
// white-label — a paying agency should see their own brand, not a label
// describing our deployment topology. Set NEXT_PUBLIC_APP_LABEL to show it
// anywhere you do want it (a staging deploy, say); it is inlined at build
// time like any NEXT_PUBLIC_ value.
const APP_LABEL =
  process.env.NEXT_PUBLIC_APP_LABEL ||
  (process.env.NODE_ENV !== 'production' ? 'SaaS' : '')

/** One role, in the words people use: an owner is shown as Owner, a member as Staff. */
export function roleLabel(membershipRole: string | null | undefined): string {
  switch (membershipRole) {
    case 'owner': return 'Owner'
    case 'admin': return 'Admin'
    case 'manager': return 'Manager'
    case 'member': return 'Staff'
    case 'viewer': return 'Viewer'
    default: return 'Staff'
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?'
}

interface TopBarProps {
  /** The Settings area shows the brand and the account menu only. */
  variant?: 'app' | 'settings'
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
}

export default function TopBar({ variant = 'app', sidebarOpen, onToggleSidebar }: TopBarProps) {
  const { tenant } = useTenant()
  const { canAccess } = useRole()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const canCopilot = canAccess(['admin', 'manager', 'member'])

  // ⌘K / Ctrl+K anywhere, the Settings area included.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Read after mount: the server has no navigator, and guessing would make
  // the first client render disagree with the HTML.
  const [isMac, setIsMac] = useState(false)
  useEffect(() => { setIsMac(/Mac|iPhone|iPad/.test(navigator.platform)) }, [])

  return (
    <header className="h-14 shrink-0 bg-white border-b border-gray-200 flex items-center gap-3 px-3 sm:px-4 z-50 relative">
      {variant === 'app' && (
        <button
          type="button"
          onClick={onToggleSidebar}
          className="lg:hidden p-2 -ml-1 rounded-md text-gray-600 hover:bg-gray-100"
          aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={!!sidebarOpen}
          aria-controls="main-sidebar"
        >
          {sidebarOpen ? <X size={20} strokeWidth={1.7} /> : <Menu size={20} strokeWidth={1.7} />}
        </button>
      )}

      <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0 lg:w-[232px] lg:shrink-0">
        {/* Icon-only mark beside the tenant's own name: this slot is theirs. */}
        <img src="/get-autoura-icon.png" alt="" className="w-7 h-7 object-contain shrink-0" />
        <span className="flex items-center gap-1.5 min-w-0">
          {tenant && <span className="text-[15px] font-semibold text-gray-900 truncate">{tenant.company_name}</span>}
          {APP_LABEL && (
            <span className="hidden sm:inline text-[10px] font-semibold uppercase tracking-wide text-gray-400 shrink-0">{APP_LABEL}</span>
          )}
        </span>
      </Link>

      {variant === 'app' && (
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="hidden sm:flex items-center gap-2 flex-1 max-w-xl h-9 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-500 hover:border-gray-300"
          aria-label="Search or jump to"
        >
          <Search size={16} strokeWidth={1.7} aria-hidden />
          <span className="truncate">Search or jump to… bookings, clients, rate pages, settings</span>
          <kbd className="ml-auto text-[11px] border border-gray-200 rounded px-1.5 py-0.5 bg-white">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>
      )}

      <div className="ml-auto flex items-center gap-1 sm:gap-2 shrink-0">
        {variant === 'app' && (
          <>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="sm:hidden p-2 rounded-md text-gray-600 hover:bg-gray-100"
              aria-label="Search or jump to"
            >
              <Search size={18} strokeWidth={1.7} />
            </button>
            {canCopilot && (
              <button
                type="button"
                onClick={() => setCopilotOpen(true)}
                className="flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-lg border border-primary-200 bg-primary-50 text-primary-800 text-sm font-medium hover:bg-primary-100"
              >
                <Sparkles size={16} strokeWidth={1.7} aria-hidden />
                <span className="hidden sm:inline">Copilot</span>
              </button>
            )}
            <NotificationBell />
          </>
        )}
        <AccountMenu />
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      {canCopilot && <CopilotPanel open={copilotOpen} onClose={() => setCopilotOpen(false)} />}
    </header>
  )
}

function AccountMenu() {
  const router = useRouter()
  const { profile, user, signOut, isSuperAdmin } = useAuth()
  const { tenant, tenantMember } = useTenant()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // The companies this login works in; the switch appears only with two or
  // more. The choice is saved server-side (POST /api/me/companies), so RLS,
  // every API route and every page follow it from the next request.
  const [companies, setCompanies] = useState<Array<{ tenant_id: string; company_name: string; role: string }>>([])
  const [switching, setSwitching] = useState(false)
  const [switchError, setSwitchError] = useState<string | null>(null)
  const memberTenantId = tenantMember?.tenant_id
  useEffect(() => {
    if (!memberTenantId) return
    let alive = true
    fetch('/api/me/companies')
      .then(r => r.json())
      .then(j => { if (alive && j?.success) setCompanies(j.data.companies ?? []) })
      .catch(() => {})
    return () => { alive = false }
  }, [memberTenantId])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const switchTo = async (tenantId: string) => {
    if (!tenantId || tenantId === tenant?.id) return
    setSwitching(true)
    setSwitchError(null)
    try {
      const res = await fetch('/api/me/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.success) throw new Error(j.error || 'Could not switch company')
      // A full load: every context, cache and open page starts again in the
      // new company — nothing from the old one stays on screen.
      window.location.href = '/dashboard'
    } catch (e) {
      setSwitchError(e instanceof Error ? e.message : 'Could not switch company')
      setSwitching(false)
    }
  }

  const name = profile?.full_name || user?.email || 'You'
  // Nothing until the membership has loaded — never a guessed role.
  const role = tenantMember ? roleLabel(tenantMember.role) : ''
  const go = (href: string) => { setOpen(false); router.push(href) }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2.5 pl-1 pr-1 sm:pr-2 py-1 rounded-lg hover:bg-gray-100"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <span className="w-8 h-8 rounded-full bg-primary-100 text-primary-800 text-xs font-semibold flex items-center justify-center shrink-0">
          {initials(name)}
        </span>
        <span className="hidden md:flex flex-col items-start leading-tight text-left">
          <span className="text-[13px] font-medium text-gray-900 max-w-[160px] truncate">{name}</span>
          <span className="text-[11px] text-gray-500">{role}</span>
        </span>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-xl shadow-lg py-2 z-[60]">
          <div className="px-4 pb-2 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
            <p className="text-xs text-gray-500 flex items-center gap-1.5">
              {role}{tenant ? ` · ${tenant.company_name}` : ''}
            </p>
            {isSuperAdmin && (
              <span className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-[10px] font-semibold uppercase tracking-wide">
                <Shield size={11} strokeWidth={1.7} /> Platform staff
              </span>
            )}
          </div>

          {companies.length > 1 && (
            <div className="py-1 border-b border-gray-100">
              <p className="px-4 pt-1 pb-0.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Switch company</p>
              {companies.map(c => (
                <button
                  key={c.tenant_id}
                  type="button"
                  role="menuitem"
                  disabled={switching}
                  onClick={() => void switchTo(c.tenant_id)}
                  className="w-full flex items-center gap-2 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <span className="truncate">{c.company_name}</span>
                  <span className="text-xs text-gray-400">{roleLabel(c.role)}</span>
                  {c.tenant_id === tenant?.id && <Check size={14} strokeWidth={1.7} className="ml-auto text-primary-700" />}
                </button>
              ))}
              {switchError && <p className="px-4 pt-1 text-[11px] text-red-600">{switchError}</p>}
            </div>
          )}

          <div className="py-1">
            <MenuItem icon={User} label="Profile" onClick={() => go('/settings/profile')} />
            <MenuItem icon={Settings} label="Settings" onClick={() => go('/settings/profile')} />
            {isSuperAdmin && <MenuItem icon={Shield} label="Platform admin" onClick={() => go('/super-admin')} />}
          </div>
          <div className="pt-1 border-t border-gray-100">
            <MenuItem
              icon={LogOut}
              label="Sign out"
              onClick={async () => {
                setOpen(false)
                try { await signOut() } catch (error) { console.error('Sign out error:', error) }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon: Icon, label, onClick }: { icon: typeof User; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
    >
      <Icon size={16} strokeWidth={1.7} className="text-gray-500" aria-hidden />
      {label}
    </button>
  )
}
