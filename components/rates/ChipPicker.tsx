'use client'

/** Toggle chips for picking several values (a guide price's cities and
 *  languages, a meal price's meals). */
export default function ChipPicker({ label, options, value, onChange }: {
  label: string
  options: Array<{ value: string; label: string }>
  value: string[]
  onChange: (v: string[]) => void
}) {
  if (options.length === 0) return null
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter(x => x !== v) : [...value, v])
  return (
    <div>
      <p className="block text-xs font-medium text-gray-600 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(o => {
          const on = value.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o.value)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${on ? 'bg-primary-600 border-primary-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'}`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
