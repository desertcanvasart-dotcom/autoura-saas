'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, X } from 'lucide-react'

const COOKIE_NAME = 'x-impersonate-tenant'

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'))
  return match ? decodeURIComponent(match[2]) : null
}

export default function ImpersonationBanner() {
  const router = useRouter()
  const [tenantId, setTenantId] = useState<string | null>(null)
  const [tenantName, setTenantName] = useState('')

  useEffect(() => {
    const id = getCookie(COOKIE_NAME)
    if (id) {
      setTenantId(id)
      // Fetch tenant name
      fetch(`/api/super-admin/tenants/${id}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) setTenantName(data.data.tenant.company_name || 'Unknown')
        })
        .catch(() => {})
    }
  }, [])

  const handleStop = async () => {
    try {
      const res = await fetch('/api/super-admin/impersonate/stop', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setTenantId(null)
        router.push(data.redirectUrl)
      }
    } catch (err) {
      console.error(err)
    }
  }

  if (!tenantId) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-black px-4 py-1.5 flex items-center justify-center gap-3 text-sm font-medium shadow-lg">
      <Shield className="w-4 h-4" />
      <span>Impersonating: <strong>{tenantName || tenantId.slice(0, 8) + '...'}</strong></span>
      <button
        onClick={handleStop}
        className="flex items-center gap-1 px-2.5 py-0.5 bg-black/20 hover:bg-black/30 rounded-full text-xs font-bold transition-colors"
      >
        <X className="w-3 h-3" />
        Stop
      </button>
    </div>
  )
}
