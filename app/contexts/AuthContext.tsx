'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/app/supabase'
import { useRouter } from 'next/navigation'

interface UserProfile {
  id: string
  email: string
  full_name: string | null
  company_name: string | null
  phone: string | null
  is_active: boolean | null
  role?: string | null
  avatar_url?: string | null
}

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  isSuperAdmin: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string, companyName?: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const supabase = createClient()

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const router = useRouter()

  // SUPER_ADMIN_EMAILS lives server-side; ask the server rather than guess.
  const checkSuperAdmin = async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/me')
      const data = await res.json()
      const flag = data?.isSuperAdmin === true
      setIsSuperAdmin(flag)
      return flag
    } catch {
      setIsSuperAdmin(false)
      return false
    }
  }

  useEffect(() => {
    // Supabase re-fires auth events for the SAME person constantly — token
    // refreshes, tab focus, route-triggered session reads. Each one used to
    // replace the user object (new identity) and re-run profile/tenant
    // fetches, which rippled a loading flash through everything keyed on
    // auth (the sidebar's tenant block visibly blinked on every
    // navigation). Only a change of ACTUAL user should churn state.
    let fetchedForUserId: string | null = null

    const applySession = (session: { user?: User | null } | null) => {
      const nextUser = session?.user ?? null
      setUser(prev => (prev?.id === nextUser?.id ? prev : nextUser))
      if (nextUser) {
        if (nextUser.id !== fetchedForUserId) {
          fetchedForUserId = nextUser.id
          fetchProfile(nextUser.id)
          checkSuperAdmin()
        }
      } else {
        fetchedForUserId = null
        setProfile(null)
        setIsSuperAdmin(false)
        setLoading(false)
      }
    }

    supabase.auth.getSession().then(({ data: { session } }: { data: { session: any } }) => {
      applySession(session)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: any, session: any) => {
      applySession(session)
    })

    return () => subscription.unsubscribe()
  }, [])

  // Presence heartbeat: stamp last_seen_at once on session start and every
  // 5 minutes while a tab stays open. A beat is "focused" only when the tab
  // is visible AND the user interacted within the last interval — that is
  // what accrues activity minutes. Hidden-and-idle skips the beat entirely.
  // Fire-and-forget — presence must never affect the auth flow.
  useEffect(() => {
    if (!user) return
    let lastInput = Date.now()
    const markInput = () => { lastInput = Date.now() }
    const INPUT_EVENTS: (keyof WindowEventMap)[] = ['keydown', 'pointerdown', 'scroll']
    INPUT_EVENTS.forEach(e => window.addEventListener(e, markInput, { passive: true }))

    const beat = (force = false) => {
      const visible = document.visibilityState === 'visible'
      const recentInput = Date.now() - lastInput < 5 * 60 * 1000
      const focused = visible && recentInput
      if (!focused && !force) return
      fetch('/api/profiles/heartbeat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ focused }),
      }).catch(() => {})
    }
    beat(true) // session start: always stamp presence
    const interval = setInterval(() => beat(), 5 * 60 * 1000)
    return () => {
      clearInterval(interval)
      INPUT_EVENTS.forEach(e => window.removeEventListener(e, markInput))
    }
  }, [user?.id])

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Error fetching profile:', error)
        throw error
      }
      
      setProfile(data)
    } catch (error) {
      console.error('Profile fetch failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error

    // Platform owners land in the admin cockpit, not the agency app —
    // they may not belong to any tenant at all.
    if (await checkSuperAdmin()) {
      router.push('/super-admin')
      return
    }

    // Check if user needs onboarding
    try {
      const { data: memberData } = await supabase
        .from('tenant_members')
        .select('tenant_id')
        .eq('user_id', data.user.id)
        .single()

      if (memberData?.tenant_id) {
        const { data: featuresData } = await supabase
          .from('tenant_features')
          .select('onboarding_completed')
          .eq('tenant_id', memberData.tenant_id)
          .single()

        // Redirect to onboarding if not completed
        if (featuresData && !featuresData.onboarding_completed) {
          router.push('/onboarding')
          return
        }
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error)
    }

    router.push('/dashboard')
  }

  const signUp = async (email: string, password: string, fullName: string, companyName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          company_name: companyName || '',
        },
      },
    })
    if (error) throw error
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    router.push('/login')
  }

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }

  const value = {
    user,
    profile,
    loading,
    isSuperAdmin,
    signIn,
    signUp,
    signOut,
    resetPassword,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// No-op fallback for SSR/prerendering when AuthProvider isn't available
const noopAuthContext: AuthContextType = {
  user: null,
  profile: null,
  loading: true, // Treat as loading during SSR to prevent content flash
  isSuperAdmin: false,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
  resetPassword: async () => {},
}

export function useAuth() {
  const context = useContext(AuthContext)

  // During SSR/prerendering, context won't be available
  // Return a no-op fallback to allow initial render to complete
  if (context === undefined) {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      console.warn('useAuth: AuthProvider not found, using no-op fallback')
    }
    return noopAuthContext
  }

  return context
}