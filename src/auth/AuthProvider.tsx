import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { LEGAL_DOCUMENT_VERSION } from '../lib/legal'

type SignupConsent = {
  acceptedTerms: boolean
  confirmedOver18: boolean
}

type AuthContextValue = {
  user: User | null
  loading: boolean
  configured: boolean
  passwordRecovery: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, consent: SignupConsent) => Promise<boolean>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(supabaseConfigured)
  const [passwordRecovery, setPasswordRecovery] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (active) {
        setUser(session?.user ?? null)
        if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true)
        else if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') setPasswordRecovery(false)
        setLoading(false)
      }
    })

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setUser(data.session?.user ?? null)
      setLoading(false)
    }).catch(() => {
      if (active) setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    configured: supabaseConfigured,
    passwordRecovery,
    async signIn(email, password) {
      if (!supabase) throw new Error('Supabase sign-in is not configured.')
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    },
    async signUp(email, password, consent) {
      if (!supabase) throw new Error('Supabase sign-up is not configured.')
      if (!consent.acceptedTerms || !consent.confirmedOver18) {
        throw new Error('Accept the Terms and confirm that you are 18 or older to create an account.')
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            kinetelle_terms_version: LEGAL_DOCUMENT_VERSION,
            kinetelle_privacy_version: LEGAL_DOCUMENT_VERSION,
            kinetelle_age_over_18: true,
          },
        },
      })
      if (error) throw error
      return !data.session
    },
    async requestPasswordReset(email) {
      if (!supabase) throw new Error('Supabase password recovery is not configured.')
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/account',
      })
      if (error) throw error
    },
    async updatePassword(password) {
      if (!supabase) throw new Error('Supabase password updates are not configured.')
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setPasswordRecovery(false)
    },
    async signOut() {
      if (!supabase) return
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    },
  }), [user, loading, passwordRecovery])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider.')
  return context
}
