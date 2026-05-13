import { NavLink, Link, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import './layout.css'

const Icon = {
  Users: () => <svg className="icon-svg" viewBox="0 0 24 24"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.85"/></svg>,
  Tag: () => <svg className="icon-svg" viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none"/></svg>,
  Box: () => <svg className="icon-svg" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>,
  Receipt: () => <svg className="icon-svg" viewBox="0 0 24 24"><path d="M4 2h16v20l-4-2-4 2-4-2-4 2V2z"/><line x1="8" y1="9" x2="16" y2="9"/><line x1="8" y1="13" x2="14" y2="13"/></svg>,
  History: () => <svg className="icon-svg" viewBox="0 0 24 24"><polyline points="12 8 12 12 14 14"/><path d="M3.05 11a9 9 0 1 0 .5-4H1"/><polyline points="1 3 1 7 5 7"/></svg>,
  Chart: () => <svg className="icon-svg" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
  Logout: () => <svg className="icon-svg" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  Truck: () => <svg className="icon-svg" viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  Shield: () => <svg className="icon-svg" viewBox="0 0 24 24"><path d="M12 3l7 3v6c0 5-3.5 8.5-7 9-3.5-.5-7-4-7-9V6l7-3z"/><path d="M9 12l2 2 4-4"/></svg>,
}

const NAV_ADMIN = [
  { to: '/usuarios', icon: <Icon.Users />, label: 'Usuarios' },
  { to: '/categorias', icon: <Icon.Tag />, label: 'Categorias' },
  { to: '/proveedores', icon: <Icon.Truck />, label: 'Proveedores' },
  { to: '/productos', icon: <Icon.Box />, label: 'Productos' },
  { to: '/inventario', icon: <Icon.Receipt />, label: 'Inventario' },
  { to: '/historial', icon: <Icon.History />, label: 'Historial' },
  { to: '/auditoria', icon: <Icon.Shield />, label: 'Auditoria' },
  { to: '/reportes', icon: <Icon.Chart />, label: 'Reportes' },
]

const NAV_OPERADOR = [
  { to: '/productos', icon: <Icon.Box />, label: 'Productos' },
  { to: '/inventario', icon: <Icon.Receipt />, label: 'Inventario' },
  { to: '/historial', icon: <Icon.History />, label: 'Historial' },
  { to: '/reportes', icon: <Icon.Chart />, label: 'Reportes' },
]

function AlertBell({ hasAlerts }) {
  const navigate = useNavigate()
  return (
    <button className={`alert-bell ${hasAlerts ? 'alert-bell--active' : ''}`} onClick={() => navigate('/alertas')} title="Notificaciones" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      {hasAlerts && <span className="alert-bell__dot" />}
    </button>
  )
}

function UserAvatar({ nombre }) {
  const initials = nombre ? nombre.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() : '?'
  return <Link to="/perfil" className="user-avatar-btn" title="Mi perfil"><span className="user-avatar-initials">{initials}</span></Link>
}

export default function Layout({ children }) {
  const { user, logout, token } = useAuth()
  const [hasAlerts, setHasAlerts] = useState(false)
  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

  useEffect(() => {
    fetch(`${apiBase}/inventory/alerts`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => r.json())
      .then((d) => setHasAlerts((d?.data?.length ?? 0) > 0))
      .catch(() => {})
  }, [apiBase, token])

  const navItems = user?.rol === 'Administrador' ? NAV_ADMIN : NAV_OPERADOR

  return (
    <div className="layout-shell">
      <header className="topnav">
        <Link to="/dashboard" className="topnav-brand" title="Ir al dashboard">
          <div className="topnav-logo" aria-hidden="true">IV</div>
          <div>
            <h1>INVORY</h1>
            <p>Gestion de Entrada y Salida</p>
          </div>
        </Link>

        <nav className="topnav-menu">
          {navItems.map(({ to, icon, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `topnav-item${isActive ? ' active' : ''}`}>
              {icon}
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="topnav-actions">
          <AlertBell hasAlerts={hasAlerts} />
          <UserAvatar nombre={user?.nombre} />
          <button className="topbar-logout" onClick={logout}><Icon.Logout />Salir</button>
        </div>
      </header>

      <main className="layout-content">{children}</main>
    </div>
  )
}
