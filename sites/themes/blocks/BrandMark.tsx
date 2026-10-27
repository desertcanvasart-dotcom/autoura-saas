import type { PagePayload } from '@/lib/publish/contract'

/** The company's logo from its records, or its name set in the display face. */
export function BrandMark({ page, className }: { page: PagePayload; className?: string }) {
  const { identity, companyName } = page.site
  return (
    <a href={`/${page.language}`} className={className} aria-label={companyName}>
      {identity.logoUrl
        // eslint-disable-next-line @next/next/no-img-element -- the logo lives on the company's storage; sized by CSS
        ? <img src={identity.logoUrl} alt={companyName} height={40} />
        : <span>{companyName}</span>}
    </a>
  )
}
