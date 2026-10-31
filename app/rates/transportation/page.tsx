'use client'

import { Suspense } from 'react'
import TransportationContent from './transportation-content'

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
    </div>
  )
}

export default function TransportationPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <TransportationContent />
    </Suspense>
  )
}