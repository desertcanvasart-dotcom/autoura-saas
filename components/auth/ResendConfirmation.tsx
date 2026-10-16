'use client'

import { useState } from 'react'
import { createClient } from '@/app/supabase'

/** Where a confirmation link lands: the sign-in page, told the email is confirmed. */
export const confirmationRedirect = () => `${window.location.origin}/login?confirmed=1`

/**
 * "Resend the confirmation email" — for a lost or expired link. Without it a
 * person whose email never arrived was stuck at "Email not confirmed".
 */
export default function ResendConfirmation({ email, className }: { email: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const resend = async () => {
    if (!email) {
      setState('error')
      setMessage('Enter your email address above first.')
      return
    }
    setState('sending')
    const { error } = await createClient().auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: confirmationRedirect() },
    })
    if (error) {
      setState('error')
      setMessage(error.message || 'The email could not be sent. Please try again in a minute.')
    } else {
      setState('sent')
      setMessage(`A new confirmation link is on its way to ${email}.`)
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={resend}
        disabled={state === 'sending'}
        className="text-sm font-medium text-[#263A29] underline disabled:opacity-50"
      >
        {state === 'sending' ? 'Sending…' : 'Resend the confirmation email'}
      </button>
      {message && (
        <p role="status" className={`text-sm mt-1 ${state === 'error' ? 'text-red-700' : 'text-gray-600'}`}>{message}</p>
      )}
    </div>
  )
}
