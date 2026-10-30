'use client'

import { Suspense } from 'react'
import UrlTabs, { type UrlTab } from '@/components/nav/UrlTabs'
import DeparturesListView from './_views/DeparturesListView'
import CapacityView from './_views/CapacityView'

// Tour departures, as a list or as the capacity calendar (how many groups a
// day the operation takes on, with the departures over it). The capacity
// view stays admin-only, as it was — its APIs refuse anyone else.
const VIEWS: UrlTab[] = [
  { key: 'list', label: 'List', roles: ['admin', 'manager'], render: () => <DeparturesListView /> },
  { key: 'capacity', label: 'Capacity', roles: ['admin'], render: () => <CapacityView /> },
]

export default function DeparturesPage() {
  return (
    <Suspense fallback={null}>
      <UrlTabs tabs={VIEWS} param="view" label="Departures view" variant="toggle" />
    </Suspense>
  )
}
