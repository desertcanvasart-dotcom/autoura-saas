'use client'

import { usePathname } from 'next/navigation'
import RatesMenu, { RatesSummaryProvider } from '@/components/rates/RatesMenu'

// Every rate sheet sits beside the Rates menu. Rates check and Extras live
// under /rates too but are their own sidebar links, so they get no menu.
const OWN_PAGES = ['/rates/check', '/rates/extras']

export default function RatesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  if (OWN_PAGES.some(p => pathname === p || pathname.startsWith(p + '/'))) return <>{children}</>
  return (
    <RatesSummaryProvider>
      <div className="lg:flex min-h-full">
        <RatesMenu />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </RatesSummaryProvider>
  )
}
