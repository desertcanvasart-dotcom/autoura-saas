'use client'

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import UrlTabs, { type UrlTab } from '@/components/nav/UrlTabs'
import SuppliersContent from './suppliers-content'
import NetworkSuppliersView from './_views/NetworkSuppliersView'

// Your own suppliers, and the shared Autoura network to find more in. A
// supplier deep link (?supplier=<id>&tab=documents) still opens on "My
// suppliers": an unknown tab key falls back to the first tab.
const TABS: UrlTab[] = [
  { key: 'mine', label: 'My suppliers', roles: ['admin', 'manager'], render: () => <SuppliersContent /> },
  { key: 'network', label: 'Network', roles: ['admin', 'manager'], render: () => <NetworkSuppliersView /> },
]

export default function SuppliersPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-primary-600 animate-spin" />
        </div>
      }
    >
      <UrlTabs tabs={TABS} label="Suppliers" />
    </Suspense>
  )
}
