import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAlerts } from '../../api/alerts.js'
import { getFiadoAlertas } from '../../api/fiados.js'
import './alerts.css'

const STOCK_TYPES = ['low-stock', 'high-stock', 'expiring-soon']
const FIADO_TYPES = ['fiado_vencido', 'fiado_por_vencer']

function formatDate(value) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('es-CO')
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 2,
  })
}

function mapStockTypeLabel(type) {
  if (type === 'low-stock') return 'Stock bajo'
  if (type === 'high-stock') return 'Stock alto'
  if (type === 'expiring-soon') return 'Proximo a vencer'
  return type
}

export default function AlertsPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [inventoryAlerts, setInventoryAlerts] = useState([])
  const [fiadoAlerts, setFiadoAlerts] = useState([])

  const loadAlerts = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const inventoryResponse = await getAlerts()
      const allAlerts = Array.isArray(inventoryResponse?.data) ? inventoryResponse.data : []
      const stockAlerts = allAlerts.filter((alert) => STOCK_TYPES.includes(alert.type))
      const fiadosFromInventory = allAlerts
        .filter((alert) => FIADO_TYPES.includes(alert.type))
        .map((alert) => ({
          id_fiado: alert.id_fiado,
          id_cliente: alert.id_cliente || null,
          cliente_nombre: alert.nombre_cliente,
          saldo_pendiente: alert.monto_pendiente,
          fecha_pago_acordada: alert.fecha_pago_acordada,
          tipo_alerta: alert.type === 'fiado_vencido' ? 'vencido' : 'por_vencer',
        }))

      setInventoryAlerts(stockAlerts)

      try {
        const fiadoResponse = await getFiadoAlertas()
        const fiadoItems = Array.isArray(fiadoResponse?.items)
          ? fiadoResponse.items
          : Array.isArray(fiadoResponse)
            ? fiadoResponse
            : []
        setFiadoAlerts(fiadoItems)
      } catch {
        setFiadoAlerts(fiadosFromInventory)
      }
    } catch (err) {
      setError(err.message || 'No fue posible cargar las alertas.')
      setInventoryAlerts([])
      setFiadoAlerts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAlerts()
  }, [loadAlerts])

  const groupedFiados = useMemo(() => {
    const vencidos = fiadoAlerts.filter((item) => String(item.tipo_alerta) === 'vencido')
    const porVencer = fiadoAlerts.filter((item) => String(item.tipo_alerta) !== 'vencido')
    return { vencidos, porVencer }
  }, [fiadoAlerts])

  return (
    <div className="al-page">
      <div className="al-page__header">
        <div>
          <h2 className="al-page__title">Alertas</h2>
          <p className="al-page__subtitle">Inventario y cartera de fiados por vencer.</p>
        </div>
        <button className="btn btn--ghost" onClick={loadAlerts} type="button">Actualizar</button>
      </div>

      {error && <div className="alert-banner alert-banner--error">{error}</div>}

      <div className="al-table-card">
        <div className="al-table-card__toolbar">
          <span className="al-table-card__info">Alertas de inventario: {inventoryAlerts.length}</span>
        </div>

        <table className="al-table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Producto</th>
              <th>Stock actual</th>
              <th>Minimo</th>
              <th>Maximo</th>
              <th>Fecha vencimiento</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="al-empty">Cargando alertas...</td>
              </tr>
            )}

            {!loading && inventoryAlerts.length === 0 && (
              <tr>
                <td colSpan={6} className="al-empty">No hay alertas de inventario activas.</td>
              </tr>
            )}

            {!loading && inventoryAlerts.map((alert) => (
              <tr key={alert.id}>
                <td>{mapStockTypeLabel(alert.type)}</td>
                <td>{alert.productName || 'N/A'}</td>
                <td>{alert.currentStock ?? 'N/A'}</td>
                <td>{alert.minStock ?? 'N/A'}</td>
                <td>{alert.maxStock ?? 'N/A'}</td>
                <td>{formatDate(alert.expirationDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="al-table-card">
        <div className="al-table-card__toolbar fiado-toolbar">
          <span className="al-table-card__info">Alertas de fiados</span>
          <span className="fiado-summary">
            Vencidos: {groupedFiados.vencidos.length} Por vencer: {groupedFiados.porVencer.length}
          </span>
        </div>

        {loading && <div className="al-empty">Cargando alertas de fiados...</div>}

        {!loading && fiadoAlerts.length === 0 && (
          <div className="al-empty">No hay alertas de fiados pendientes.</div>
        )}

        {!loading && fiadoAlerts.length > 0 && (
          <div className="fiado-list">
            {fiadoAlerts.map((alert) => {
              const isVencido = String(alert.tipo_alerta) === 'vencido'
              return (
                <div key={`fiado-${alert.id_fiado}`} className={`fiado-card ${isVencido ? 'is-vencido' : 'is-warning'}`}>
                  <div>
                    <p className="fiado-card__title">{alert.cliente_nombre || 'Cliente'}</p>
                    <p className="fiado-card__meta">
                      Fiado #{alert.id_fiado}  {isVencido ? 'Vencido' : 'Por vencer'}
                    </p>
                    <p className="fiado-card__meta">Fecha acordada: {formatDate(alert.fecha_pago_acordada)}</p>
                    <p className="fiado-card__amount">Saldo pendiente: {formatCurrency(alert.saldo_pendiente)}</p>
                  </div>
                  <button
                    className="btn btn--outline btn--sm"
                    type="button"
                    disabled={!alert.id_cliente}
                    onClick={() => navigate(`/clientes?clienteId=${alert.id_cliente}`)}
                  >
                    Ver fiado
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}