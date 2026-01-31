'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/app/supabase'
import { 
  CheckCircle, 
  XCircle, 
  Loader2,
  Eye,
  EyeOff,
  User,
  Lock,
  Mail,
  Shield
} from 'lucide-react'

interface InvitationData {
  email: string
  role: string
  invited_by_name: string
  expires_at: string
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
  
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const supabase = createClient()

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

    // Validation
    if (!fullName.trim()) {
      setError('Please enter your full name')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setSubmitting(true)

    try {
      // Create Supabase auth account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: invitation!.email,
        password,
        options: {
          data: {
            full_name: fullName,
          }
        }
      })

      if (authError) {
        throw new Error(authError.message)
      }

      if (!authData.user) {
        throw new Error('Failed to create account')
      }

      // Mark invitation as accepted
      await fetch('/api/invitations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      })

      setSuccess(true)
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)

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
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Welcome to Autoura!</h1>
          <p className="text-gray-600 mb-4">Your account has been created successfully.</p>
          <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
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
          <p className="text-gray-600 mt-2">Create your account to join the team</p>
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
              Invited by <span className="font-medium">{invitation?.invited_by_name || 'Admin'}</span>
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Full Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-transparent"
                placeholder="Enter your full name"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-transparent"
                placeholder="Create a password"
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Must be at least 8 characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#647C47] focus:border-transparent"
                placeholder="Confirm your password"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-[#647C47] text-white font-medium rounded-lg hover:bg-[#4f6339] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating Account...
              </>
            ) : (
              'Create Account'
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