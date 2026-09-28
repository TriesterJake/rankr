import { NavLink, Outlet } from 'react-router-dom'

const Icon = ({ children }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

export default function Layout() {
  return (
    <div className="app-shell">
      <main className="page">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Main">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
          <Icon>
            <path d="M8 6h13M8 12h13M8 18h13" />
            <path d="M3 6h.01M3 12h.01M3 18h.01" />
          </Icon>
          <span>My lists</span>
        </NavLink>
        <NavLink to="/friends" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
          <Icon>
            <path d="M17 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2" />
            <circle cx="10" cy="8" r="4" />
            <path d="M21 20v-2a4 4 0 00-3-3.87M16 4.13a4 4 0 010 7.75" />
          </Icon>
          <span>Friends</span>
        </NavLink>
        <NavLink to="/me" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
          <Icon>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1" />
          </Icon>
          <span>Me</span>
        </NavLink>
      </nav>
    </div>
  )
}
