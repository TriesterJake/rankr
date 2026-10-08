import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { configured } from './supabase.js'
import { ToastProvider } from './toast.jsx'
import Layout from './components/Layout.jsx'
import { Spinner } from './components/ui.jsx'
import AuthPage, { ResetPassword, SetupNeeded } from './pages/AuthPage.jsx'
import ListsPage from './pages/ListsPage.jsx'
import ListPage from './pages/ListPage.jsx'
import FriendsPage from './pages/FriendsPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import ComparePage from './pages/ComparePage.jsx'
import ActivityPage from './pages/ActivityPage.jsx'
import MePage from './pages/MePage.jsx'

export default function App() {
  const { session, loading, recovering, finishRecovery } = useAuth()

  if (!configured) return <SetupNeeded />
  if (loading) return <Spinner label="Loading" />

  return (
    <ToastProvider>
      {!session ? (
        <AuthPage />
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
            <Route path="activity" element={<ActivityPage />} />
            <Route path="me" element={<MePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      )}
    </ToastProvider>
  )
}