'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SignInForm() {
  const router = useRouter()
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'phone' | 'code'>('phone')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const post = async (path: string, body: Record<string, unknown>) => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) { setError(data.error || 'Something went wrong — please try again'); return null }
      return data
    } finally { setBusy(false) }
  }

  const sendCode = async () => {
    const data = await post('/api/supplier-auth/code', { phone })
    if (data) { setMessage(data.message); setStep('code') }
  }
  const verify = async () => {
    const data = await post('/api/supplier-auth/verify', { phone, code })
    if (data) router.push('/supplier-home')
  }

  const big = 'w-full rounded-xl py-4 text-base font-semibold disabled:opacity-50'
  return (
    <div className="space-y-4">
      {step === 'phone' ? (
        <>
          <label className="block text-sm text-gray-700">Your phone number, with the country code
            <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="+20 100 123 4567" className="mt-1 w-full" autoComplete="tel" />
          </label>
          <button disabled={busy || !phone.trim()} onClick={sendCode} className={`${big} bg-gray-900 text-white`}>Send me a code</button>
        </>
      ) : (
        <>
          {message && <p className="rounded-xl bg-blue-50 text-blue-900 px-4 py-3 text-sm">{message}</p>}
          <label className="block text-sm text-gray-700">The 6-digit code
            <input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} className="mt-1 w-full tracking-widest text-lg" />
          </label>
          <button disabled={busy || code.replace(/\s/g, '').length !== 6} onClick={verify} className={`${big} bg-green-600 text-white`}>Sign in</button>
          <button disabled={busy} onClick={() => { setStep('phone'); setCode(''); setMessage(null) }} className="w-full py-2 text-sm text-gray-600">Use another number</button>
        </>
      )}
      {error && <p className="rounded-xl bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</p>}
      <p className="text-xs text-gray-500">No email on file with an agency? Ask them to add it, or keep using the link they sent you.</p>
    </div>
  )
}
