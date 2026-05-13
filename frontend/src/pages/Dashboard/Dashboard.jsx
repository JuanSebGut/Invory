// src/pages/Dashboard/Dashboard.jsx
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { getAlerts } from '../../api/alerts.js'
import { getMovimientos } from '../../api/inventory.js'
import { getProductos } from '../../api/products.js'
import Layout from '../../components/Layout'
import './Dashboard.css'

/* AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA
   AACONOS SVG
AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA */
const IconArrowDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12l7 7 7-7" />
  </svg>
)

const IconClock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
)

const IconCart = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="21" r="1" />
    <circle cx="20" cy="21" r="1" />
    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </svg>
)

const IconDollar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
)

const IconTrendDown = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
    <polyline points="17 18 23 18 23 12" />
  </svg>
)

const IconBox = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
)

const IconUsers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="7" r="4" />
    <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    <path d="M21 21v-2a4 4 0 0 0-3-3.85" />
  </svg>
)

const IconSearch = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

const IconPlus = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const IconReceipt = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2h16v20l-4-2-4 2-4-2-4 2V2z" />
    <line x1="8" y1="9" x2="16" y2="9" />
    <line x1="8" y1="13" x2="14" y2="13" />
  </svg>
)

const IconArrowRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13, flexShrink: 0 }}>
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
)

const IconSpinner = () => (
  <svg className="db-spinner" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" strokeWidth="3" stroke="currentColor" strokeOpacity="0.2" />
    <path d="M12 2a10 10 0 0 1 10 10" strokeWidth="3" stroke="currentColor" strokeLinecap="round" />
  </svg>
)

/* AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA
   HELPERS
AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA */
function formatCurrency(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value ?? 0)
}

function isToday(isoString) {
  if (!isoString) return false
  // Compara directo los primeros 10 caracteres (YYYY-MM-DD) con la fecha local
  const today = new Date()
  const pad = n => String(n).padStart(2, '0')
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`
  return String(isoString).slice(0, 10) === todayStr
}
/* AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA
   SUB-COMPONENTES
AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA */

/** Tarjeta de KPI principal */
function KpiCard({ icon, iconVariant, label, primary, secondary, secondaryLabel, action, onAction, loading }) {
  return (
    <div className="db-kpi-card">
      <div className={`db-kpi-icon db-kpi-icon--${iconVariant}`}>
        {icon}
      </div>
      <div className="db-kpi-body">
        <span className="db-kpi-label">{label}</span>
        {loading
          ? <span className="db-kpi-value db-kpi-value--loading"><IconSpinner /></span>
          : <span className="db-kpi-value">{primary}</span>
        }
        {(secondary !== undefined || secondaryLabel) && !loading && (
          <span className="db-kpi-secondary">
            {secondary !== undefined ? secondary : ''} {secondaryLabel}
          </span>
        )}
      </div>
      {action && (
        <button className="db-kpi-action" onClick={onAction} type="button">
          {action} <IconArrowRight />
        </button>
      )}
    </div>
  )
}

/** Tarjeta de acceso rAApido */
function QuickCard({ icon, iconVariant, label, sublabel, onClick }) {
  return (
    <button className={`db-quick-card db-quick-card--${iconVariant}`} onClick={onClick} type="button">
      <div className={`db-quick-icon db-quick-icon--${iconVariant}`}>{icon}</div>
      <div className="db-quick-text">
        <span className="db-quick-label">{label}</span>
        {sublabel && <span className="db-quick-sub">{sublabel}</span>}
      </div>
      <IconArrowRight />
    </button>
  )
}

/** Fila de actividad reciente */
function ActivityRow({ tipo, producto, cantidad, hora }) {
  const variants = { entrada: 'entrada', salida: 'salida', ajuste: 'ajuste' }
  const labels   = { entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste' }
  const v = variants[tipo] ?? 'entrada'
  return (
    <div className="db-activity-row">
      <span className={`db-activity-badge db-activity-badge--${v}`}>
        <span className="db-activity-dot" />
        {labels[tipo] ?? tipo}
      </span>
      <span className="db-activity-product">{producto ?? 'Aaa'}</span>
      <span className="db-activity-qty">{cantidad} u.</span>
      <span className="db-activity-time">{hora}</span>
    </div>
  )
}

/* AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA
   COMPONENTE PRINCIPAL
AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA */
export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin  = user?.rol === 'Administrador'

  /* AaaAaa Estado AaaAaa */
  const [loading, setLoading] = useState(true)

  // Alertas
  const [stockBajo,     setStockBajo]     = useState(0)
  const [proximosVencer,setProximosVencer]= useState(0)

  // Movimientos
  const [ventasHoy,     setVentasHoy]     = useState(0)
  const [ventasTotal,   setVentasTotal]   = useState(0)
  const [valorVendidoHoy, setValorVendidoHoy] = useState(0)
  const [costoIngresadoHoy, setCostoIngresadoHoy] = useState(0)
  const [actividad,     setActividad]     = useState([])

  // Productos
  const [totalProductos, setTotalProductos] = useState(0)
  const [registradosHoy, setRegistradosHoy] = useState(0)

  /* AaaAaa Carga de datos AaaAaa */
  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const [alertsResp, movsResp, prodsResp] = await Promise.allSettled([
        getAlerts({ types: ['low-stock', 'expiring-soon'] }),
        getMovimientos({ size: 100 }),
        getProductos({ size: 100 }),
      ])

      // Aaa Alertas Aaa
      if (alertsResp.status === 'fulfilled') {
        const alerts = alertsResp.value?.data ?? []
        setStockBajo(alerts.filter(a => a.type === 'low-stock').length)
        setProximosVencer(alerts.filter(a =>
          a.type === 'expiring-soon' &&
          a.daysToExpire != null &&
          a.daysToExpire <= 30
        ).length)
      }

      // Aaa Movimientos Aaa
      if (movsResp.status === 'fulfilled') {
        const data  = movsResp.value?.data ?? movsResp.value ?? {}
        const items = data.items ?? []

        const esVenta = m =>
          m.tipo === 'salida' &&
          typeof m.motivo === 'string' &&
          m.motivo.toLowerCase() === 'venta'

        const ventasH   = items.filter(m => esVenta(m) && isToday(m.fecha))
        const ventasAll = items.filter(m => esVenta(m))

        setVentasHoy(ventasH.length)
        setVentasTotal(ventasAll.length)

        // Valor vendido hoy = suma (precio_venta * cantidad) de salidas por venta de hoy
        const valorH = ventasH.reduce((acc, m) => {
          return acc + (Number(m.precio_venta ?? 0) * Number(m.cantidad ?? 0))
        }, 0)
        setValorVendidoHoy(valorH)

        // Costo ingresado hoy = suma (precio_compra * cantidad) de entradas de hoy
        const entradasHoy = items.filter(m => m.tipo === 'entrada' && isToday(m.fecha))
        const costoH = entradasHoy.reduce((acc, m) => {
          return acc + (Number(m.precio_compra ?? 0) * Number(m.cantidad ?? 0))
        }, 0)
        setCostoIngresadoHoy(costoH)

        // Actividad reciente (AAltimos 5)
        const recientes = [...items]
          .sort((a, b) => new Date(b.fecha + 'T' + (b.hora ?? '00:00')) - new Date(a.fecha + 'T' + (a.hora ?? '00:00')))
          .slice(0, 5)
        setActividad(recientes)
      }

      // Aaa Productos Aaa
      if (prodsResp.status === 'fulfilled') {
        const payload  = prodsResp.value?.data ?? prodsResp.value ?? {}
        const productos = payload?.productos ?? payload?.items ?? []
        setTotalProductos(payload?.total ?? productos.length)

        const hoy = productos.filter(p => isToday(p.createdAt ?? p.fecha_creacion ?? p.created_at))
        setRegistradosHoy(hoy.length)
      }
    } catch {
      /* errores silenciosos: cada KPI queda en 0 */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  /* AaaAaa Accesos rAApidos segAAn rol AaaAaa */
  const quickActions = [
    {
      icon: <IconSearch />,
      iconVariant: 'primary',
      label: 'Buscar producto',
      sublabel: 'CatAAlogo completo',
      onClick: () => navigate('/productos'),
    },
    ...(isAdmin ? [{
      icon: <IconPlus />,
      iconVariant: 'success',
      label: 'Registrar producto',
      sublabel: 'Alta en catAAlogo',
      onClick: () => navigate('/productos'),
    }] : []),
    {
      icon: <IconReceipt />,
      iconVariant: 'warning',
      label: 'Registrar venta',
      sublabel: 'Salida por venta',
      onClick: () => navigate('/inventario'),
    },
    ...(isAdmin ? [{
      icon: <IconUsers />,
      iconVariant: 'purple',
      label: 'Usuarios',
      sublabel: 'GestiAAn de accesos',
      onClick: () => navigate('/usuarios'),
    }] : []),
  ]

  const today = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <Layout>
      <div className="db-page">

        {/* AaaAaa Saludo AaaAaa */}
        <div className="db-hero">
          <div>
            <h2 className="db-hero__title">
              Bienvenido, {user?.nombre?.split(' ')[0]}
            </h2>
            <p className="db-hero__date">{today}</p>
          </div>
          <span className="db-hero__role">{user?.rol}</span>
        </div>

        {/* AaaAaa KPI: Alertas AaaAaa */}
        <section className="db-section">
          <h3 className="db-section__title">Alertas de inventario</h3>
          <div className="db-kpi-grid db-kpi-grid--alerts">

            <KpiCard
              icon={<IconArrowDown />}
              iconVariant="danger"
              label="Stock bajo"
              primary={loading ? 'AaA' : stockBajo}
              secondaryLabel="Productos en/bajo mAAnimo."
              action="Ver alertas"
              onAction={() => navigate('/alertas')}
              loading={loading}
            />

            <KpiCard
              icon={<IconClock />}
              iconVariant="warning"
              label="PrAAximos a vencer"
              primary={loading ? 'AaA' : proximosVencer}
              secondaryLabel="Vencen en AaA 30 dAAas."
              action="Ver alertas"
              onAction={() => navigate('/alertas')}
              loading={loading}
            />

          </div>
        </section>

        {/* AaaAaa KPI: Ventas y costos AaaAaa */}
        <section className="db-section">
          <h3 className="db-section__title">Actividad</h3>
          <div className="db-kpi-grid db-kpi-grid--sales">

            <KpiCard
              icon={<IconCart />}
              iconVariant="primary"
              label="Ventas registradas"
              primary={loading ? 'AaA' : `${ventasTotal}`}
              secondaryLabel="Total (salidas por venta)."
              action="Ver historial"
              onAction={() => navigate('/inventario')}
              loading={loading}
            />

            <KpiCard
              icon={<IconDollar />}
              iconVariant="success"
              label="Valor total vendido"
              primary={loading ? 'AaA' : formatCurrency(valorVendidoHoy)}
              secondaryLabel="Total vendido hoy."
              loading={loading}
            />

            <KpiCard
              icon={<IconTrendDown />}
              iconVariant="orange"
              label="Valor total gastado"
              primary={loading ? 'AaA' : formatCurrency(costoIngresadoHoy)}
              secondaryLabel="Costo de productos ingresados hoy."
              loading={loading}
            />

          </div>
        </section>

        {/* AaaAaa KPI: CatAAlogo AaaAaa */}
        <section className="db-section">
          <h3 className="db-section__title">CatAAlogo AA Productos registrados</h3>
          <div className="db-kpi-grid db-kpi-grid--catalog">

            <KpiCard
              icon={<IconBox />}
              iconVariant="slate"
              label="Total en el sistema"
              primary={loading ? 'AaA' : totalProductos}
              secondaryLabel="NAAmero de productos registrados."
              action="Ver catAAlogo"
              onAction={() => navigate('/productos')}
              loading={loading}
            />

            <KpiCard
              icon={<IconPlus />}
              iconVariant="teal"
              label="Registrados hoy"
              primary={loading ? 'AaA' : registradosHoy}
              secondaryLabel="Altas realizadas hoy."
              loading={loading}
            />

          </div>
          <p className="db-catalog-note">
            CatAAlogo (productos registrados) AaA Ventas (salidas).
          </p>
        </section>

        {/* AaaAaa Layout inferior: Accesos rAApidos + Actividad reciente AaaAaa */}
        <div className="db-bottom-grid">

          {/* Accesos rAApidos */}
          <section className="db-section db-section--card">
            <h3 className="db-section__title">Accesos rAApidos</h3>
            <p className="db-section__sub">SegAAn rol AA {user?.rol}</p>
            <div className="db-quick-list">
              {quickActions.map((qa, i) => (
                <QuickCard key={i} {...qa} />
              ))}
            </div>
          </section>

          {/* Actividad reciente */}
          <section className="db-section db-section--card">
            <h3 className="db-section__title">Actividad reciente</h3>
            <p className="db-section__sub">AAltimos 5 movimientos</p>
            {loading ? (
              <div className="db-activity-loading">
                <IconSpinner />
                <span>Cargando actividadAaA</span>
              </div>
            ) : actividad.length === 0 ? (
              <p className="db-activity-empty">Sin movimientos registrados.</p>
            ) : (
              <div className="db-activity-list">
                {actividad.map((m, i) => (
                  <ActivityRow
                    key={m.id_movimiento ?? i}
                    tipo={m.tipo ?? m.movement_type}
                    producto={m.nombre_producto}
                    cantidad={m.cantidad}
                    hora={m.hora ? m.hora.slice(0, 5) : (m.fecha ?? 'Aaa')}
                  />
                ))}
              </div>
            )}
            <button
              className="db-activity-more"
              onClick={() => navigate('/inventario')}
              type="button"
            >
              Ver historial completo <IconArrowRight />
            </button>
          </section>

        </div>
      </div>
    </Layout>
  )
}