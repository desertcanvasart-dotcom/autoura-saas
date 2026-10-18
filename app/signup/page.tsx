import { Suspense } from 'react'
import SignupContent from './signup-content'

export const dynamic = 'force-dynamic'

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>}>
      <SignupContent />
    </Suspense>
  )
}
