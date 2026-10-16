'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { useTenant } from '@/app/contexts/TenantContext'

/** Across the app while the company is scheduled for deletion, so nobody on
 *  the team is surprised when it goes — and everyone knows to export first. */
export default function ClosureBanner() {
  const { tenant } = useTenant()
  const [purgeAfter, setPurgeAfter] = useState<string | null>(null)

  useEffect(() => {
    if (!tenant?.id) return
    let live = true
    fetch('/api/account/company')
      .then(r => (r.ok ? r.json() : null))
      .then(b => { if (live) setPurgeAfter(b?.data?.purge_after ?? null) })
      .catch(() => undefined)
    return () => { live = false }
  }, [tenant?.id])

  if (!purgeAfter) return null
  const date = new Date(purgeAfter).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
  return (
    <div role="status" className="bg-red-600 text-white text-sm px-4 py-2 flex flex-wrap items-center gap-x-2 gap-y-1">
      <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>This company is closing: all of its data will be deleted on {date}.</span>
      <Link href="/settings/tenant" className="underline font-medium">Export or keep it open</Link>
    </div>
  )
}
