import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { configured } from './supabase.js'
import { ToastProvider } from './toast.jsx'
import Layout from './components/Layout.jsx'
import { Spinner } from './components/ui.jsx'
import AuthPage, { ResetPassword, SetupNeeded, TermsGate } from './pages/AuthPage.jsx'
import LegalPage, { LEGAL_PATHS } from './pages/LegalPage.jsx'
import ListsPage from './pages/ListsPage.jsx'
import ListPage from './pages/ListPage.jsx'
import FriendsPage from './pages/FriendsPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import ComparePage from './pages/ComparePage.jsx'
import MultiComparePage from './pages/MultiComparePage.jsx'
import ActivityPage from './pages/ActivityPage.jsx'
import MePage from './pages/MePage.jsx'
import IdeasPage from './pages/IdeasPage.jsx'

export default function App() {
  const { session, user, profile, loading, recovering, finishRecovery, refreshProfile, signOut } = useAuth()
  const { pathname } = useLocation()
  const legal = LEGAL_PATHS[pathname.replace(/\/+$/, '')]

  if (!configured) return <SetupNeeded />
  if (loading) return <Spinner label="Loading" />

  // accounts made before the Terms existed (null only once update-17.sql has added the column)
  const needsTerms = Boolean(session && profile && profile.terms_accepted_at === null)

  return (
    <ToastProvider>
      {legal && (!session || needsTerms) ? (
        <LegalPage page={legal} standalone />
      ) : !session ? (
        <AuthPage />
      ) : needsTerms && !recovering ? (
        <TermsGate userId={user.id} onDone={refreshProfile} onSignOut={signOut} />
      ) : recovering ? (
        <ResetPassword onDone={finishRecovery} />
      ) : (
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<ListsPage />} />
            <Route path="list/:id" element={<ListPage />} />
            <Route path="friends" element={<FriendsPage />} />
            <Route path="u/:id" element={<ProfilePage />} />
            <Route path="compare/:mine/:theirs" element={<ComparePage />} />
            <Route path="compare-many" element={<MultiComparePage />} />
            <Route path="ideas" element={<IdeasPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="me" element={<MePage />} />
            <Route path="privacy" element={<LegalPage page="privacy" />} />
            <Route path="terms" element={<LegalPage page="terms" />} />
            <Route path="support" element={<LegalPage page="support" />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </ToastProvider>
  )
}