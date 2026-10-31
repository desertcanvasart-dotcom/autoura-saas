'use client'

import { useEffect, useRef, useState } from 'react'
import { applySuggestion, currentToken, type AddressCandidate } from '@/lib/email/address-suggestions'
import { headerAddresses } from '@/lib/email/contact-name'

const SUGGEST_DELAY_MS = 200

const SOURCE_LABEL: Record<AddressCandidate['source'], string> = {
  emailed: 'Emailed',
  client: 'Client',
  team: 'Team',
}

/**
 * One recipient line of the composer (To, Cc or Bcc): comma-separated
 * addresses, "Name <address>" accepted. As an address is typed it suggests
 * people this company has emailed, its clients and its team
 * (/api/email/contacts); ↑/↓ to move, Enter or Tab to pick, Esc to close.
 */
export default function RecipientInput({
  label,
  value,
  onChange,
  placeholder,
  trailing,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Shown at the end of the line, e.g. the Cc / Bcc links. */
  trailing?: React.ReactNode
}) {
  const [suggestions, setSuggestions] = useState<AddressCandidate[]>([])
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const request = useRef(0)
  const listId = `recipient-suggestions-${label.toLowerCase()}`

  const { token } = currentToken(value)

  useEffect(() => {
    if (!open || token.length < 1 || token.includes('<')) {
      setSuggestions([])
      return
    }
    const req = ++request.current
    const t = setTimeout(async () => {
      try {
        const exclude = headerAddresses(value).join(',')
        const res = await fetch(`/api/email/contacts?q=${encodeURIComponent(token)}&exclude=${encodeURIComponent(exclude)}`)
        const data = await res.json()
        if (req !== request.current) return
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : [])
        setActive(0)
      } catch {
        if (req === request.current) setSuggestions([])
      }
    }, SUGGEST_DELAY_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, open])

  const pick = (s: AddressCandidate) => {
    onChange(applySuggestion(value, s.email))
    setSuggestions([])
    inputRef.current?.focus()
  }

  const showList = open && suggestions.length > 0

  return (
    <div className="relative flex items-center px-5 py-2.5 border-b border-gray-100">
      <label className="w-16 text-xs font-medium text-gray-400" htmlFor={`recipient-${label}`}>{label}</label>
      <input
        id={`recipient-${label}`}
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={e => {
          if (!showList) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % suggestions.length) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => (a - 1 + suggestions.length) % suggestions.length) }
          else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(suggestions[active]) }
          else if (e.key === 'Escape') { e.preventDefault(); setSuggestions([]) }
        }}
        className="flex-1 min-w-0 text-sm outline-none bg-transparent"
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
      />
      {trailing}
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-20 right-5 top-full z-30 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-64 overflow-y-auto"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.email}
              role="option"
              aria-selected={i === active}
              // mousedown, not click: picking must happen before the input blurs.
              onMouseDown={e => { e.preventDefault(); pick(s) }}
              onMouseEnter={() => setActive(i)}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer ${i === active ? 'bg-primary-50' : ''}`}
            >
              <span className="min-w-0 flex-1 truncate">
                {s.name ? <span className="text-gray-900">{s.name} </span> : null}
                <span className="text-gray-500">{s.email}</span>
              </span>
              <span className="text-xs uppercase tracking-wide text-gray-400">{SOURCE_LABEL[s.source]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
