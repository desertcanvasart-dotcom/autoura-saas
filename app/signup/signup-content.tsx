'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import Link from 'next/link'
import BrandMark from '@/components/BrandMark'
import ResendConfirmation from '@/components/auth/ResendConfirmation'

const INPUT =
  'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#263A29] focus:border-transparent'

export default function SignupContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const { signUp } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (!acceptedTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy to continue')
      return
    }

    setLoading(true)
    try {
      await signUp(email, password, fullName, companyName, new Date().toISOString())
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error && err.message ? err.message : 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#F7F7F4] flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center border border-gray-100">
            <div className="w-16 h-16 bg-primary-500/10 text-primary-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              ✓
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h2>
            <p className="text-gray-600 mb-6">
              We&apos;ve sent a confirmation link to <strong>{email}</strong>. Open it to verify your
              account, then sign in.
            </p>
            <ResendConfirmation email={email} className="mb-6" />
            <Link
              href="/login"
              className="inline-block bg-[#263A29] text-white px-6 py-3 rounded-lg hover:bg-[#1D2B20] font-medium transition-colors"
            >
              Go to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7F7F4] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="mb-4">
            <BrandMark />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create your account</h1>
          <p className="text-gray-600">Start running your tours on Autoura</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="signup-full-name" className="block text-sm font-medium text-gray-700 mb-2">
                Full name
              </label>
              <input
                id="signup-full-name"
                type="text"
                required
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={INPUT}
                placeholder="Jane Smith"
              />
            </div>

            <div>
              <label htmlFor="signup-company" className="block text-sm font-medium text-gray-700 mb-2">
                Company name
              </label>
              <input
                id="signup-company"
                type="text"
                required
                autoComplete="organization"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className={INPUT}
                placeholder="Your Company Ltd"
              />
            </div>

            <div>
              <label htmlFor="signup-email" className="block text-sm font-medium text-gray-700 mb-2">
                Email address
              </label>
              <input
                id="signup-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={INPUT}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="signup-password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                id="signup-password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={INPUT}
                placeholder="••••••••"
                minLength={8}
                aria-describedby="signup-password-hint"
              />
              <p id="signup-password-hint" className="text-xs text-gray-500 mt-1">At least 8 characters</p>
            </div>

            <div>
              <label htmlFor="signup-confirm-password" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm password
              </label>
              <input
                id="signup-confirm-password"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={INPUT}
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-start gap-3">
              <input
                id="signup-terms"
                type="checkbox"
                required
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-[#263A29] border-gray-300 rounded focus:ring-[#263A29]"
              />
              <label htmlFor="signup-terms" className="text-sm text-gray-600">
                I agree to the{' '}
                <Link href="/terms" target="_blank" className="text-[#263A29] font-medium hover:underline">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" target="_blank" className="text-[#263A29] font-medium hover:underline">
                  Privacy Policy
                </Link>
                .
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#263A29] text-white py-3 rounded-lg hover:bg-[#1D2B20] disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{' '}
              <Link href="/login" className="text-[#263A29] hover:text-[#1D2B20] font-medium">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          © {new Date().getFullYear()} Autoura by Online Era. All rights reserved.
        </p>
      </div>
    </div>
  )
}
