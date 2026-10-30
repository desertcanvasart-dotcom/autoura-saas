'use client'

import { Suspense } from 'react'
import UrlTabs, { type UrlTab } from '@/components/nav/UrlTabs'
import AnalyticsView from './_views/AnalyticsView'
import FinanceView from './_views/FinanceView'
import CopilotView from './_views/CopilotView'

// One Reports page, three tabs — each keeps the gate its old page had:
// sales and operations analytics for everyone, the accounting reports and
// the Copilot's numbers for managers and admins (their APIs refuse others).
const TABS: UrlTab[] = [
  { key: 'analytics', label: 'Analytics', roles: ['admin', 'manager', 'member', 'viewer'], render: () => <AnalyticsView /> },
  { key: 'finance', label: 'Finance', roles: ['admin', 'manager'], render: () => <FinanceView /> },
  { key: 'copilot', label: 'Copilot', roles: ['admin', 'manager'], render: () => <CopilotView /> },
]

export default function ReportsPage() {
  return (
    <Suspense fallback={null}>
      <UrlTabs tabs={TABS} label="Reports" />
    </Suspense>
  )
}
