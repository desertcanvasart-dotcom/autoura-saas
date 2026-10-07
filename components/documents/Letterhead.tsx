// ============================================
// The agency's letterhead on an on-screen document
// ============================================
// Header and footer read from Settings → Organization (lib/company-identity),
// the same fields the PDF prints, so what you see is what the supplier gets.
// Nothing is a default brand: a field left blank is a line left off.

import { letterheadFooterLines, type CompanyIdentity } from '@/lib/company-identity'

const FALLBACK_COLOR = '#647C47'

export function brandColor(company: CompanyIdentity): string {
  return /^#?[0-9a-fA-F]{6}$/.test(company.primaryColor ?? '')
    ? (company.primaryColor!.startsWith('#') ? company.primaryColor! : `#${company.primaryColor}`)
    : FALLBACK_COLOR
}

export function DocumentLetterhead({
  company, title, number, date, status,
}: {
  company: CompanyIdentity
  title: string
  number: string
  date?: string
  status?: string
}) {
  const color = brandColor(company)
  return (
    <div>
      <div className="h-1.5" style={{ backgroundColor: color }} />
      <div className="px-8 pt-7 pb-6 flex flex-col sm:flex-row sm:items-start justify-between gap-6">
        <div className="flex items-center gap-4 min-w-0">
          {company.logoUrl && (
            // A plain <img>: the logo lives in the agency's storage bucket,
            // not a host next/image is configured for.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logoUrl} alt="" className="h-14 w-auto max-w-[140px] object-contain flex-shrink-0" />
          )}
          <div className="min-w-0">
            {company.name && (
              <p className="text-xl font-bold tracking-tight truncate" style={{ color }}>{company.name}</p>
            )}
            {company.tagline && <p className="text-sm text-gray-500 mt-0.5">{company.tagline}</p>}
          </div>
        </div>
        <div className="sm:text-right flex-shrink-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>{title}</p>
          <p className="text-lg font-semibold text-gray-900 mt-0.5">{number}</p>
          {date && <p className="text-xs text-gray-500 mt-0.5">Issued {date}</p>}
          {status && (
            <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600">
              {status}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function DocumentFooter({ company }: { company: CompanyIdentity }) {
  const lines = letterheadFooterLines(company)
  if (!lines.length && !company.footerText && !company.name) {
    return <p className="text-[11px] text-gray-400 italic">Nothing to show yet — fill in the fields above.</p>
  }
  return (
    <div className="text-center text-[11px] leading-relaxed text-gray-500 space-y-0.5">
      {company.name && <p className="font-semibold text-gray-700">{company.name}</p>}
      {lines.map(l => <p key={l}>{l}</p>)}
      {company.footerText && <p className="whitespace-pre-line text-gray-400 pt-1">{company.footerText}</p>}
    </div>
  )
}
