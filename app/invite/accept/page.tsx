'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { 
  CheckCircle, 
  XCircle, 
  Loader2,
  User,
  Mail,
  Shield
} from 'lucide-react'

interface InvitationData {
  email: string
  role: string
  inviter: { full_name?: string; email?: string } | null
  expires_at: string
  /** A working login already exists: accepting keeps its password. */
  has_account?: boolean
}

function AcceptInvitationContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [needsSignIn, setNeedsSignIn] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)

  const [fullName, setFullName] = useState('')
  // A new account agrees to the Terms here, as on /signup.
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  useEffect(() => {
    if (token) {
      verifyToken()
    } else {
      setError('Invalid invitation link')
      setLoading(false)
    }
  }, [token])

  const verifyToken = async () => {
    try {
      const response = await fetch(`/api/invitations/verify?token=${token}`)
      const data = await response.json()

      if (data.success) {
        setInvitation(data.data)
      } else {
        setError(data.error || 'Invalid or expired invitation')
      }
    } catch (err) {
      setError('Failed to verify invitation')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation — none for an existing login: nothing is created, and
    // their name and password stay as they are.
    if (!invitation?.has_account && !fullName.trim()) {
      setError('Please enter your full name')
      return
    }
    if (!invitation?.has_account && !acceptedTerms) {
      setError('Please agree to the Terms of Service and Privacy Policy to continue')
      return
    }

    setSubmitting(true)

    try {
      // No password is chosen here. Whoever opens this link may not be the
      // invitee (the inviter has the same link), so the password is set from
      // a one-time link the accept route emails to the invited address.
      const res = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invitation?.has_account ? { token } : { token, full_name: fullName, accepted_terms: acceptedTerms })
      })
      const payload = await res.json()

      if (!res.ok || !payload.success) {
        throw new Error(payload.error || 'Could not accept the invitation')
      }

      setCompanyName(payload.data?.company_name ?? null)

      if (payload.data?.check_email) {
        setCheckEmail(true)
        setSuccess(true)
        return
      }

      // An existing login keeps its own password: sign in with it.
      setNeedsSignIn(true)
      setSuccess(true)
      setTimeout(() => router.push('/login'), 3000)
    } catch (err: any) {
      setError(err.message || 'Failed to create account')
    } finally {
      setSubmitting(false)
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-[#647C47] animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">Verifying invitation...</p>
        </div>
      </div>
    )
  }

  // Error state (invalid/expired token)
  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Invalid Invitation</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <a
            href="/login"
            className="inline-flex items-center justify-center px-4 py-2 bg-[#647C47] text-white rounded-lg hover:bg-[#4f6339] transition-colors"
          >
            Go to Login
          </a>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            {checkEmail ? <Mail className="w-8 h-8 text-green-600" /> : <CheckCircle className="w-8 h-8 text-green-600" />}
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            {companyName ? `You've joined ${companyName}` : 'Welcome to Autoura!'}
          </h1>
          {checkEmail ? (
            <>
              <p className="text-gray-600 mb-4">
                Your place on the team is ready. We&apos;ve emailed{' '}
                <span className="font-medium text-gray-900">{invitation?.email}</span> a link to set your password.
              </p>
              <p className="text-sm text-gray-500">
                Open it from your inbox to finish. No email? Check spam, or use{' '}
                <a href="/forgot-password" className="text-[#647C47] hover:underline font-medium">Forgot password</a>.
              </p>
            </>
          ) : (
            <>
              <p className="text-gray-600 mb-4">
                {needsSignIn
                  ? 'Your place on the team is set up. Please sign in with your existing password to continue.'
                  : 'Your place on the team is set up.'}
              </p>
              <p className="text-sm text-gray-500">Redirecting to sign in...</p>
            </>
          )}
        </div>
      </div>
    )
  }

  // Form state
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#647C47]/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-[#647C47]" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Accept Invitation</h1>
          <p className="text-gray-600 mt-2">
            {invitation?.has_account
              ? 'You already have an Autoura login — accept to join this team'
              : 'Create your account to join the team'}
          </p>
        </div>

        {/* Invitation Info Card */}
        <div className="bg-[#647C47]/5 border border-[#647C47]/20 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3 mb-3">
            <Mail className="w-5 h-5 text-[#647C47]" />
            <span className="text-sm text-gray-700">{invitation?.email}</span>
          </div>
          <div className="flex items-center gap-3 mb-3">
            <User className="w-5 h-5 text-[#647C47]" />
            <span className="text-sm text-gray-700">
              Invited by <span className="font-medium">{invitation?.inviter?.full_name || invitation?.inviter?.email || 'Admin'}</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Shield className="w-5 h-5 text-[#647C47]" />
            <span className="text-sm text-gray-700">
              Role: <span className="font-medium capitalize">{invitation?.role}</span>
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-lg p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          {invitation?.has_account ? (
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{invitation.email}</span> already has an
              Autoura login. Accepting adds you to this team; afterwards, sign in with your
              <span className="font-medium"> existing password</span>. Forgot it?{' '}
              <a href="/forgot-password" className="text-[#647C47] hover:underline font-medium">Reset it</a>.
            </p>
          ) : (<>
          <div>
            <label htmlFor="invite-full-name" className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <div className="relative">
              <input
                id="invite-full-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-transparent"
                placeholder="Enter your full name"
                required
              />
            </div>
          </div>

          <div className="flex items-start gap-3">
            <input
              id="invite-terms"
              type="checkbox"
              required
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 w-4 h-4 border-gray-300 rounded focus:ring-[#647C47]"
            />
            <label htmlFor="invite-terms" className="text-sm text-gray-600">
              I agree to the{' '}
              <a href="/terms" target="_blank" className="text-[#647C47] font-medium hover:underline">Terms of Service</a>{' '}
              and{' '}
              <a href="/privacy" target="_blank" className="text-[#647C47] font-medium hover:underline">Privacy Policy</a>.
            </label>
          </div>

          <p className="text-xs text-gray-500">
            Next, we&apos;ll email you a link to set your password.
          </p>
          </>)}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-[#647C47] text-white font-medium rounded-lg hover:bg-[#4f6339] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                {invitation?.has_account ? 'Joining...' : 'Setting up...'}
              </>
            ) : (
              invitation?.has_account ? 'Accept & Join Team' : 'Accept invitation'
            )}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-6">
          Already have an account?{' '}
          <a href="/login" className="text-[#647C47] hover:underline font-medium">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 text-[#647C47] animate-spin" />
      </div>
    }>
      <AcceptInvitationContent />
    </Suspense>
  )
}