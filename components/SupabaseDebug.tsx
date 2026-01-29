'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/app/supabase'

export default function SupabaseDebug() {
  const [info, setInfo] = useState<any>(null)

  useEffect(() => {
    // Check environment variables
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const hasKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const keyLength = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length || 0

    // Try to create Supabase client
    let clientStatus = 'Not created'
    let clientError = null
    try {
      const supabase = createClient()
      clientStatus = supabase ? '✅ Created' : '❌ Failed'

      // Test a simple query
      supabase.from('tenants').select('count', { count: 'exact', head: true })
        .then(({ error }: { error: { message: string } | null }) => {
          if (error) {
            setInfo(prev => ({ ...prev, queryError: error.message }))
          } else {
            setInfo(prev => ({ ...prev, queryStatus: '✅ Can query' }))
          }
        })
    } catch (err: any) {
      clientError = err.message
      clientStatus = '❌ Error'
    }

    setInfo({
      url,
      hasKey,
      keyLength,
      urlPrefix: url?.substring(0, 35),
      clientStatus,
      clientError,
      queryStatus: 'Testing...',
    })

    // Make available globally for debugging
    if (typeof window !== 'undefined') {
      (window as any).supabaseDebug = {
        url,
        hasKey,
        keyLength,
        testClient: () => {
          try {
            const supabase = createClient()
            console.log('✅ Supabase client created:', supabase)
            return supabase
          } catch (err) {
            console.error('❌ Failed to create Supabase client:', err)
            return null
          }
        }
      }
      console.log('💡 Run window.supabaseDebug.testClient() to test Supabase client')
    }
  }, [])

  if (!info) return null

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white p-4 rounded-lg text-xs font-mono max-w-sm z-50 shadow-2xl">
      <div className="font-bold mb-2 text-blue-400">🔍 Supabase Debug Panel</div>

      <div className="space-y-1 mb-2">
        <div className="flex justify-between">
          <span className="text-gray-400">URL:</span>
          <span>{info.url ? '✅ Set' : '❌ Missing'}</span>
        </div>
        {info.urlPrefix && (
          <div className="text-gray-500 text-[10px] truncate">{info.urlPrefix}...</div>
        )}

        <div className="flex justify-between">
          <span className="text-gray-400">Anon Key:</span>
          <span>{info.hasKey ? '✅ Set' : '❌ Missing'}</span>
        </div>
        <div className="text-gray-500 text-[10px]">Length: {info.keyLength} chars</div>

        <div className="flex justify-between">
          <span className="text-gray-400">Client:</span>
          <span>{info.clientStatus}</span>
        </div>

        {info.clientError && (
          <div className="text-red-400 text-[10px] mt-1">Error: {info.clientError}</div>
        )}

        {info.queryStatus && (
          <div className="flex justify-between">
            <span className="text-gray-400">DB Query:</span>
            <span>{info.queryStatus}</span>
          </div>
        )}

        {info.queryError && (
          <div className="text-red-400 text-[10px] mt-1">Query Error: {info.queryError}</div>
        )}
      </div>

      <div className="text-[10px] text-gray-500 mt-2 pt-2 border-t border-gray-700">
        Console: window.supabaseDebug
      </div>
    </div>
  )
}
