'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import BrandMark from '@/components/BrandMark'

// Any page that throws lands here instead of Next's bare default. The error
// itself is already logged (and alerted) on the server by instrumentation.ts;
// the digest lets support find that log line.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-[70vh] bg-[#F7F7F4] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        <BrandMark />
        <h1 className="mt-6 text-2xl font-bold text-gray-900">Something went wrong</h1>
        <p className="mt-2 text-gray-600">
          This page hit an error. Your saved work is safe — try again, and if it keeps happening,
          let us know.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-[#263A29] text-white font-medium hover:bg-[#1D2B20] transition-colors"
          >
            Try again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 font-medium hover:bg-white transition-colors"
          >
            Go to your dashboard
          </Link>
        </div>
        {error.digest && (
          <p className="mt-6 text-xs text-gray-400">Reference: {error.digest}</p>
        )}
      </div>
    </div>
  )
}
