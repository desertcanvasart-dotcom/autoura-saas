'use client'

import { useRouter } from 'next/navigation'

export default function SignOutButton() {
  const router = useRouter()
  return (
    <button
      onClick={async () => { await fetch('/api/supplier-auth/sign-out', { method: 'POST' }); router.push('/supplier-login') }}
      className="text-sm text-gray-300 hover:text-white underline"
    >
      Sign out
    </button>
  )
}
