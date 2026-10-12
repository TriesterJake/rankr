import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recovering, setRecovering] = useState(false)
  const loadedFor = useRef(null) // whose profile is already loaded

  const loadProfile = useCallback(async (userId) => {
    loadedFor.current = userId
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfile(data ?? null)
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) await loadProfile(data.session.user.id)
      if (active) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      if (next) {
        // Only fetch the profile when a different person signs in. Supabase also fires this when the app
        // regains focus or refreshes its login token, and each refetch would be a pointless request.
        if (loadedFor.current !== next.user.id) {
          loadedFor.current = next.user.id
          // defer: calling supabase inside this callback can deadlock the auth client
          setTimeout(() => loadProfile(next.user.id), 0)
        }
      } else {
        loadedFor.current = null
        setProfile(null)
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signOut = useCallback(() => supabase.auth.signOut(), [])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    recovering,
    finishRecovery: () => setRecovering(false),
    refreshProfile: () => (session ? loadProfile(session.user.id) : Promise.resolve()),
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}