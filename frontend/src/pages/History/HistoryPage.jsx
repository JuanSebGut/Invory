import { useEffect, useMemo, useState } from 'react'
import { getMovimientos } from '../../api/inventory'
import './history.css'

function formatFechaHora(isoLike, hora) {
  const raw = isoLike && String(isoLike).includes('T') ? isoLike : `${isoLike || ''}T${hora || '00:00:00'}`
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return { fecha: 'a', hora: '' }
  const opts = { timeZone: 'America/Bogota' }
  return {
    fecha: d.toLocaleDateString('es-CO', { ...opts, day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora: d.toLocaleTimeString('es-CO', { ...opts, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  }
}

export default function HistoryPage() {
  const [rows, setRows] = useState([])

  useEffect(() => {
    getMovimientos({ page: 1, size: 50 })
      .then((r) => setRows(r?.data?.items || []))
      .catch(() => setRows([]))
  }, [])

  const rendered = useMemo(
    () => rows.map((m) => ({ ...m, __f: formatFechaHora(m.fecha_hora_exacta || m.fecha, m.hora) })),
    [rows]
  )

  return (
    <div className="history-page">
      <div className="history-page__header">
        <h2>Historial</h2>
        <p>Trazabilidad completa de movimientos de inventario</p>
      </div>

      <div className="history-page__table-wrap">
        <table className="history-page__table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Producto</th>
              <th>Cantidad</th>
              <th>Stock resultante</th>
              <th>Fecha y hora</th>
            </tr>
          </thead>
          <tbody>
            {rendered.map((m) => (
              <tr key={m.id_movimiento}>
                <td>{m.tipo || m.movement_type}</td>
                <td>{m.nombre_producto}</td>
                <td>{m.cantidad}</td>
                <td>{m.nuevo_stock ?? m.stock_posterior}</td>
                <td>{m.__f.fecha} {m.__f.hora}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
