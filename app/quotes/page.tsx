'use client'

import { Suspense } from 'react'
import UrlTabs, { type UrlTab } from '@/components/nav/UrlTabs'
import B2CQuotesView from './_views/B2CQuotesView'
import B2BQuotesView from './_views/B2BQuotesView'

// One Quotes link, two lists: B2C and B2B quotes are different records
// (b2c_quotes: a client, travellers and a margin; b2b_quotes: a partner, a
// pax-range rate sheet and validity), so they stay two lists behind tabs.
// B2B is for managers and admins, as /quotes/b2b was.
const TABS: UrlTab[] = [
  { key: 'b2c', label: 'B2C quotes', roles: ['admin', 'manager', 'member'], render: () => <B2CQuotesView /> },
  { key: 'b2b', label: 'B2B quotes', roles: ['admin', 'manager'], render: () => <B2BQuotesView /> },
]

export default function QuotesPage() {
  return (
    <Suspense fallback={null}>
      <UrlTabs tabs={TABS} label="Quotes" />
    </Suspense>
  )
}
