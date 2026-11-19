import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './AuthContext.jsx'
import { NotificationsProvider } from './NotificationsContext.jsx'
import { SpoilersProvider } from './spoilers.jsx'
import './styles.css'
import { setUpNative } from './native.js'

setUpNative()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <NotificationsProvider>
          <SpoilersProvider>
            <App />
          </SpoilersProvider>
        </NotificationsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)