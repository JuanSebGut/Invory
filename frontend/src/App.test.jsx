import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

const authState = vi.hoisted(() => ({
  value: {
    isAuthenticated: true,
    isLoading: false,
    user: { nombre: 'Ana', rol: 'Empleado' },
    logout: vi.fn(),
  },
}))

vi.mock('./hooks/useAuth.js', () => ({
  useAuth: () => authState.value,
}))

vi.mock('./pages/Login/login', () => ({ default: () => <div>Login page</div> }))
vi.mock('./pages/Categories/Categories.jsx', () => ({ default: () => <div>CategorAAas</div> }))
vi.mock('./pages/Users/UsersPage.jsx', () => ({ default: () => <div>Usuarios</div> }))
vi.mock('./pages/Products/ProductsPage.jsx', () => ({ default: () => <div>Productos</div> }))
vi.mock('./pages/Inventory/Inventory.jsx', () => ({ default: () => <div>Inventario</div> }))
vi.mock('./pages/Alerts/AlertsPage', () => ({ default: () => <div>Alertas</div> }))
vi.mock('./pages/Audit/Audit.jsx', () => ({ default: () => <div>AuditorAAa</div> }))
vi.mock('./pages/Reports/ReportsPage.jsx', () => ({ default: () => <div>Contenido de reportes</div> }))

describe('App /reportes route', () => {
  beforeEach(() => {
    authState.value = {
      isAuthenticated: true,
      isLoading: false,
      user: { nombre: 'Ana', rol: 'Empleado' },
      logout: vi.fn(),
    }
  })

  it('renders /reportes for authenticated operator users inside Layout', async () => {
    render(
      <MemoryRouter initialEntries={['/reportes']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Contenido de reportes')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reportes' })).toBeInTheDocument()
    expect(screen.getByText('Hola, Ana')).toBeInTheDocument()
  })

  it('redirects unauthenticated users away from /reportes', async () => {
    authState.value = {
      isAuthenticated: false,
      isLoading: false,
      user: null,
      logout: vi.fn(),
    }

    render(
      <MemoryRouter initialEntries={['/reportes']}>
        <App />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Login page')).toBeInTheDocument()
  })
})

