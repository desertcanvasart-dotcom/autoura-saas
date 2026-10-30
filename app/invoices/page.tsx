'use client'

import { Suspense } from 'react'
import UrlTabs, { type UrlTab } from '@/components/nav/UrlTabs'
import InvoicesContent from './invoices-content'
import ReceivablesView from './_views/ReceivablesView'

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#647C47]"></div>
    </div>
  )
}

// Every invoice, and the unpaid ones by client and age (what Receivables
// showed: invoices with a balance due, drafts and cancelled left out). The
// Unpaid tab keeps Receivables' gate — managers and admins, as its API.
const TABS: UrlTab[] = [
  { key: 'all', label: 'All', roles: ['admin', 'manager', 'member'], render: () => <InvoicesContent /> },
  { key: 'unpaid', label: 'Unpaid', roles: ['admin', 'manager'], render: () => <ReceivablesView /> },
]

export default function InvoicesPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <UrlTabs tabs={TABS} label="Invoices" />
    </Suspense>
  )
}
