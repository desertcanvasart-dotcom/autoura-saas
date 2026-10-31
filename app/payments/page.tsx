'use client'

import { Suspense } from 'react'
import UrlTabs, { type UrlTab } from '@/components/nav/UrlTabs'
import PaymentsView from './_views/PaymentsView'
import ReceiptsView from './_views/ReceiptsView'

// Payments and receipts read the same money (itinerary payments and invoice
// payments); Receipts is the completed ones, with a PDF and a WhatsApp send.
const STAFF = ['admin', 'manager', 'member'] as const
const TABS: UrlTab[] = [
  { key: 'payments', label: 'Payments', roles: [...STAFF], render: () => <PaymentsView /> },
  { key: 'receipts', label: 'Receipts', roles: [...STAFF], render: () => <ReceiptsView /> },
]

export default function PaymentsPage() {
  return (
    <Suspense fallback={null}>
      <UrlTabs tabs={TABS} label="Payments and receipts" />
    </Suspense>
  )
}
