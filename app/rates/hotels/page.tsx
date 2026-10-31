'use client'

import { Suspense } from 'react'
import HotelsContent from './hotels-content'

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
    </div>
  )
}

export default function HotelsPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <HotelsContent />
    </Suspense>
  )
}