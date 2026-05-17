import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getMovimientos } from '../../api/inventory.js'
import { getAlerts } from '../../api/alerts.js'
import { getReport } from '../../api/reports.js'
import './Dashboard.css'

function normalizeAlerts(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.data?.data)) return payload.data.data
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

function todayDate() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

function formatMoney(v) {
  if (v == null) return 'N/A'
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(v))
}

function formatFechaHora(isoString) {
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return { fecha: 'N/A', hora: '' }
  const opts = { timeZone: 'America/Bogota' }
  const fecha = d.toLocaleDateString('es-CO', { ...opts, day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora = d.toLocaleTimeString('es-CO', { ...opts, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  return { fecha, hora }
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const today = useMemo(() => todayDate(), [])
  const [loading, setLoading] = useState(true)
  const [kpi, setKpi] = useState({
    salesToday: null,
    lowStock: null,
    movementsToday: null,
    stockValue: null,
  })
  const [recentItems, setRecentItems] = useState([])
  const [alertsByType, setAlertsByType] = useState({})

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [sales, alerts, movementsToday, stockReport, recent] = await Promise.allSettled([
        getReport('sales', { fecha_inicio: today, fecha_fin: today }),
        getAlerts({ types: ['low-stock', 'high-stock', 'expiring-soon'] }),
        getMovimientos({ fecha: today, page: 1, size: 1 }),
        getReport('stock', {}),
        getMovimientos({ page: 1, size: 8 }),
      ])

      const alertsData = alerts.status === 'fulfilled' ? normalizeAlerts(alerts.value) : []
      const grouped = alertsData.reduce((acc, a) => {
        const key = a.type || 'otro'
        acc[key] = (acc[key] || 0) + 1
        return acc
      }, {})

      setKpi({
        salesToday: sales.status === 'fulfilled' ? (sales.value?.summary?.total_value ?? null) : null,
        lowStock: alerts.status === 'fulfilled' ? alertsData.length : null,
        movementsToday: movementsToday.status === 'fulfilled' ? (movementsToday.value?.data?.total ?? null) : null,
        stockValue: stockReport.status === 'fulfilled' ? (stockReport.value?.summary?.total_value ?? null) : null,
      })
      setRecentItems(recent.status === 'fulfilled' ? (recent.value?.data?.items ?? []) : [])
      setAlertsByType(grouped)
      setLoading(false)
    }
    load()
  }, [today])

  return (
    <div className="dashboard">
      <div className="dashboard__header">
        <h2 className="dashboard__title">Inicio</h2>
        <p className="dashboard__subtitle">Resumen rapido de operacion y movimientos recientes</p>
      </div>
      <div className="dashboard__body">
        <section className="kpi-grid">
          <article className="kpi-card kpi-card--sales">
            <p className="kpi-card__label">Ventas hoy</p>
            {loading ? <div className="kpi-card__skeleton" /> : <p className="kpi-card__value">{formatMoney(kpi.salesToday)}</p>}
          </article>
          <article className="kpi-card kpi-card--critical" onClick={() => navigate('/alertas')}>
            <p className="kpi-card__label">
              Stock Alertas
              {!loading && Number(kpi.lowStock || 0) > 0 && (
                <span className="kpi-alert-indicator" title="Hay alertas activas" />
              )}
            </p>
            {loading ? <div className="kpi-card__skeleton" /> : <p className="kpi-card__value">{kpi.lowStock ?? 'N/A'}</p>}
          </article>
          <article className="kpi-card kpi-card--moves">
            <p className="kpi-card__label">Movimientos hoy</p>
            {loading ? <div className="kpi-card__skeleton" /> : <p className="kpi-card__value">{kpi.movementsToday ?? 'N/A'}</p>}
          </article>
          <article className="kpi-card kpi-card--value">
            <p className="kpi-card__label">Valor inventario</p>
            {loading ? <div className="kpi-card__skeleton" /> : <p className="kpi-card__value">{formatMoney(kpi.stockValue)}</p>}
          </article>
        </section>

        <section className="kpi-card">
          <p className="kpi-card__label">Ultimos movimientos</p>
          <table className="db2-table">
            <thead>
              <tr><th>Tipo</th><th>Producto</th><th>Cantidad</th><th>Stock resultante</th><th>Fecha y hora</th></tr>
            </thead>
            <tbody>
              {recentItems.map((m) => {
                const f = formatFechaHora(m.fecha_hora_exacta || `${m.fecha}T${m.hora || '00:00:00'}`)
                return (
                  <tr key={m.id_movimiento}>
                    <td>{m.tipo || m.movement_type}</td>
                    <td>{m.nombre_producto || 'N/A'}</td>
                    <td>{m.cantidad}</td>
                    <td>{m.nuevo_stock ?? m.stock_posterior ?? 'N/A'}</td>
                    <td>{f.fecha} {f.hora}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
