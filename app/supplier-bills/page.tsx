'use client'

import { Suspense } from 'react'
import UrlTabs, { type UrlTab } from '@/components/nav/UrlTabs'
import SupplierInvoicesView from './_views/SupplierInvoicesView'
import PayablesView from './_views/PayablesView'

// What suppliers bill you, and what you owe them. Two different lists:
// Bills are the supplier invoices you received (matched to your costs);
// Payables are your recorded costs not yet paid (expenses pending or
// approved), by supplier and age — whether or not an invoice came in.
const AM = ['admin', 'manager'] as const
const TABS: UrlTab[] = [
  { key: 'bills', label: 'Bills', roles: [...AM], render: () => <SupplierInvoicesView /> },
  { key: 'payables', label: 'Payables', roles: [...AM], render: () => <PayablesView /> },
]

export default function SupplierBillsPage() {
  return (
    <Suspense fallback={null}>
      <UrlTabs tabs={TABS} label="Supplier bills" />
    </Suspense>
  )
}
