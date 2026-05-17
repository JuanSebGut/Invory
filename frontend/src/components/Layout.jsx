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
  Sun: () => <svg className="icon-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="4.22" x2="19.78" y2="5.64"/></svg>,
  Moon: () => <svg className="icon-svg" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  Archive: () => <svg className="icon-svg" viewBox="0 0 24 24"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>,
}

const NAV_ADMIN = [
  { to: '/dashboard', icon: <Icon.Chart />, label: 'Dashboard' },
  { to: '/usuarios', icon: <Icon.Users />, label: 'Usuarios' },
  { to: '/clientes', icon: <Icon.Users />, label: 'Clientes' },
  { to: '/categorias', icon: <Icon.Tag />, label: 'Categorías' },
  { to: '/proveedores', icon: <Icon.Truck />, label: 'Proveedores' },
  { to: '/productos', icon: <Icon.Box />, label: 'Productos' },
  { to: '/inventario', icon: <Icon.Archive />, label: 'Inventario' },
  { to: '/facturas', icon: <Icon.Receipt />, label: 'Facturas' },
  { to: '/historial', icon: <Icon.History />, label: 'Historial' },
  { to: '/auditoria', icon: <Icon.Shield />, label: 'Auditoría' },
  { to: '/reportes', icon: <Icon.Chart />, label: 'Reportes' },
]

const NAV_EMPLEADO = [
  { to: '/dashboard', icon: <Icon.Chart />, label: 'Dashboard' },
  { to: '/clientes',  icon: <Icon.Users />, label: 'Clientes' },
  { to: '/productos', icon: <Icon.Box />, label: 'Productos' },
  { to: '/inventario', icon: <Icon.Archive />, label: 'Inventario' },
  { to: '/facturas',  icon: <Icon.Receipt />, label: 'Facturas' },
  { to: '/historial', icon: <Icon.History />, label: 'Historial' },
  { to: '/reportes',  icon: <Icon.Chart />, label: 'Reportes' },
]

function AlertBell({ alertCount }) {
  const navigate = useNavigate()
  const hasAlerts = alertCount > 0
  return (
    <button className={`alert-bell ${hasAlerts ? 'alert-bell--active' : ''}`} onClick={() => navigate('/alertas')} title="Notificaciones" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
      {hasAlerts && <span className="alert-bell__dot">{alertCount > 99 ? '99+' : alertCount}</span>}
    </button>
  )
}

function UserAvatar({ nombre }) {
  const initials = nombre ? nombre.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() : '?'
  return <Link to="/perfil" className="user-avatar-btn" title="Mi perfil">{initials}</Link>
}

export default function Layout({ children }) {
  const { user, logout, token } = useAuth()
  const [alertCount, setAlertCount] = useState(0)
  const apiBase = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

  // Dark Mode Logic
  const [theme, setTheme] = useState(() => localStorage.getItem('invory_theme') || 'light')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('invory_theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  useEffect(() => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {}

    async function loadAlerts() {
      let stockAlerts = 0
      let fiadosVencidos = 0

      try {
        const stockResp = await fetch(`${apiBase}/inventory/alerts`, { headers })
        const stockPayload = await stockResp.json()
        const stockItems = Array.isArray(stockPayload?.data) ? stockPayload.data : []
        stockAlerts = stockItems.filter((item) =>
          ['low-stock', 'high-stock', 'expiring-soon'].includes(item?.type)
        ).length
      } catch {}

      try {
        const fiadoResp = await fetch(`${apiBase}/fiados/alertas`, { headers })
        if (fiadoResp.ok) {
          const fiadoPayload = await fiadoResp.json()
          const fiadoItems = Array.isArray(fiadoPayload?.data?.items)
            ? fiadoPayload.data.items
            : Array.isArray(fiadoPayload?.data)
              ? fiadoPayload.data
              : []
          fiadosVencidos = fiadoItems.filter((item) => String(item?.tipo_alerta) === 'vencido').length
        }
      } catch {}

      setAlertCount(stockAlerts + fiadosVencidos)
    }

    loadAlerts()
  }, [apiBase, token])

  const navItems = user?.rol === 'Administrador' ? NAV_ADMIN : NAV_EMPLEADO
  const businessName = localStorage.getItem('invory_business_name') || 'INVORY'

  return (
    <div className="layout-shell">
      {/* Sidebar */}
      <aside className="layout-sidebar">
        <Link to="/dashboard" className="layout-sidebar-header">
          <div className="layout-sidebar-logo">
            {businessName.substring(0, 2).toUpperCase()}
          </div>
          <div className="layout-sidebar-brand">
            <h1>{businessName}</h1>
          </div>
        </Link>
        <nav className="layout-sidebar-nav">
          {navItems.map(({ to, icon, label }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `layout-sidebar-item${isActive ? ' active' : ''}`}>
              {icon}
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="layout-main">
        {/* Topbar */}
        <header className="layout-topbar">
          <button className="theme-toggle-btn" onClick={toggleTheme} title="Cambiar tema">
            {theme === 'light' ? <Icon.Moon /> : <Icon.Sun />}
          </button>
          <AlertBell alertCount={alertCount} />
          <UserAvatar nombre={user?.nombre} />
          <button className="topbar-logout" onClick={logout}><Icon.Logout /> Salir</button>
        </header>

        {/* Page Content */}
        <main className="layout-content">
          {children}
        </main>
      </div>
    </div>
  )
}
