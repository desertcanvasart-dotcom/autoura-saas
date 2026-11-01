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

  // The app's input styles apply only to typed inputs, so each one says its type.
  const field = 'mt-2 block w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 focus:border-[#647C47] focus:outline-none focus:ring-2 focus:ring-[#647C47]/20'
  const primary = 'w-full rounded-lg bg-[#263A29] py-3 text-base font-medium text-white transition-colors hover:bg-[#1D2B20] disabled:cursor-not-allowed disabled:opacity-60'
  return (
    <div className="space-y-5">
      <ol className="flex items-center gap-2 text-xs font-medium" aria-label="Steps">
        <li className={step === 'phone' ? 'text-[#263A29]' : 'text-gray-400'}>1. Your number</li>
        <li aria-hidden className="text-gray-300">→</li>
        <li className={step === 'code' ? 'text-[#263A29]' : 'text-gray-400'}>2. The code</li>
      </ol>
      {step === 'phone' ? (
        <form onSubmit={e => { e.preventDefault(); if (phone.trim()) void sendCode() }} className="space-y-5">
          <label className="block text-sm font-medium text-gray-700">
            Your phone number, with the country code
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" placeholder="+20 100 123 4567" className={field} autoComplete="tel" autoFocus />
          </label>
          <p className="text-sm text-gray-600">We email a 6-digit code to the address your agency has on file for you.</p>
          <button type="submit" disabled={busy || !phone.trim()} className={primary}>{busy ? 'Sending…' : 'Send me a code'}</button>
        </form>
      ) : (
        <form onSubmit={e => { e.preventDefault(); if (code.replace(/\s/g, '').length === 6) void verify() }} className="space-y-5">
          {message && <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{message}</p>}
          <label className="block text-sm font-medium text-gray-700">
            The 6-digit code
            <input type="text" value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="123456" className={`${field} text-center text-2xl tracking-[0.5em]`} autoFocus />
          </label>
          <button type="submit" disabled={busy || code.replace(/\s/g, '').length !== 6} className={primary}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <button type="button" disabled={busy} onClick={() => { setStep('phone'); setCode(''); setMessage(null) }} className="w-full py-1 text-sm text-gray-600 hover:text-gray-900">Use another number</button>
        </form>
      )}
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      <p className="border-t border-gray-100 pt-4 text-xs text-gray-500">No email on file with an agency? Ask them to add it, or keep using the link they sent you.</p>
    </div>
  )
}
