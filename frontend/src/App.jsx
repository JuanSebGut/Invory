// src/App.jsx na con ruta de Productos (MS-04)
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.js'
import Login from './pages/Login/login'
import Layout from './components/Layout'
import Categories from './pages/Categories/Categories.jsx'
import UsersPage from './pages/Users/UsersPage.jsx'
import ProductsPage from './pages/Products/ProductsPage.jsx'
import Inventory from './pages/Inventory/Inventory.jsx'
import AlertsPage from './pages/Alerts/AlertsPage'
import Audit from './pages/Audit/Audit.jsx'
import ReportsPage from './pages/Reports/ReportsPage.jsx'
import ProvidersPage from './pages/Providers/ProvidersPage.jsx'
import DashboardPage from './pages/Dashboard/DashboardPage.jsx'
import ProfilePage from './pages/Profile/ProfilePage.jsx'
import HistoryPage from './pages/History/HistoryPage.jsx'
import ClientsPage from './pages/Clients/ClientsPage.jsx'
import InvoicesPage from './pages/Invoices/InvoicesPage.jsx'

function HomeRedirect() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return null
  return isAuthenticated
    ? <Navigate to="/dashboard" replace />
    : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return null
  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />
}

function PrivateRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return null
  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const { isAuthenticated, isLoading, user } = useAuth()
  if (isLoading) return null
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (user?.rol !== 'Administrador') return <Navigate to="/dashboard" replace />
  return children
}


export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />

      <Route path="/login" element={
        <PublicRoute>
          <Login />
        </PublicRoute>
      } />

      <Route path="/dashboard" element={
        <PrivateRoute>
          <Layout>
            <DashboardPage />
          </Layout>
        </PrivateRoute>
      } />

      <Route path="/categorias" element={
        <AdminRoute>
          <Layout>
            <Categories />
          </Layout>
        </AdminRoute>
      } />

      {/* MS-02 na solo Administrador */}
      <Route path="/usuarios" element={
        <AdminRoute>
          <Layout>
            <UsersPage />
          </Layout>
        </AdminRoute>
      } />

      {/* MS-04 na Admin y Empleado (operador solo lectura) */}
      <Route path="/productos" element={
        <PrivateRoute>
          <Layout>
            <ProductsPage />
          </Layout>
        </PrivateRoute>
      } />
      
      {/* MS-05 na Administrador y Empleado (con rotacion de rol en la vista) */}
      <Route path="/inventario" element={
        <PrivateRoute>
          <Layout>
            <Inventory />
          </Layout>
        </PrivateRoute>
      } />

      <Route path="/historial" element={
        <PrivateRoute>
          <Layout>
            <HistoryPage />
          </Layout>
        </PrivateRoute>
      } />

      {/* MS-06 na Administrador y Empleado (con rotacion de rol en la vista) */}
      <Route path="/alertas" element={
        <PrivateRoute>
          <Layout>
            <AlertsPage />
          </Layout>
        </PrivateRoute>
      } />

      <Route path="/reportes" element={
        <PrivateRoute>
          <Layout>
            <ReportsPage />
          </Layout>
        </PrivateRoute>
      } />

      <Route path="/clientes" element={
        <PrivateRoute>
          <Layout>
            <ClientsPage />
          </Layout>
        </PrivateRoute>
      } />

      <Route path="/facturas" element={
        <PrivateRoute>
          <Layout>
            <InvoicesPage />
          </Layout>
        </PrivateRoute>
      } />

      {/* MS-09 na Solo Administrador */}
      <Route path="/auditoria" element={
        <AdminRoute>
          <Layout>
            <Audit />
          </Layout>
        </AdminRoute>
      } />

      {/* MS-10 na solo Administrador */}
      <Route path="/proveedores" element={
        <AdminRoute>
          <Layout>
            <ProvidersPage />
          </Layout>
        </AdminRoute>
      } />

      <Route path="/perfil" element={
        <PrivateRoute>
          <Layout>
            <ProfilePage />
          </Layout>
        </PrivateRoute>
      } />

    </Routes>
  )
}


