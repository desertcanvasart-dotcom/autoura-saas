'use client'

/**
 * One recipient line of the composer (To, Cc or Bcc): comma-separated
 * addresses, "Name <address>" accepted. The send route checks every address
 * and names any it cannot read.
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
  return (
    <div className="flex items-center px-5 py-2.5 border-b border-gray-100">
      <label className="w-16 text-xs font-medium text-gray-400">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 min-w-0 text-sm outline-none bg-transparent"
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        spellCheck={false}
      />
      {trailing}
    </div>
  )
}
