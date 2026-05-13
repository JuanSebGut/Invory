import { useEffect, useMemo, useState } from 'react'
import { getMovimientos, getProductos } from '../../api/inventory'
import './history.css'

function formatFechaHora(isoLike, hora) {
  const raw = isoLike && String(isoLike).includes('T') ? isoLike : `${isoLike || ''}T${hora || '00:00:00'}`
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return { fecha: '-', hora: '' }
  const opts = { timeZone: 'America/Bogota' }
  return {
    fecha: d.toLocaleDateString('es-CO', { ...opts, day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora: d.toLocaleTimeString('es-CO', { ...opts, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  }
}

function getMovimientoCantidad(m) {
  const cantidad = Number(m.cantidad || 0)
  const motivo = String(m.motivo || '').toLowerCase()
  const tipo = String(m.tipo || m.movement_type || '').toLowerCase()

  if (tipo === 'entrada') return { text: `+${cantidad}`, cls: 'mov-pos' }
  if (tipo === 'salida') return { text: `-${cantidad}`, cls: 'mov-neg' }
  if (tipo === 'ajuste') {
    if (motivo.includes('sobrante')) return { text: `+${cantidad}`, cls: 'mov-warn' }
    return { text: `-${cantidad}`, cls: 'mov-orange' }
  }
  return { text: `${cantidad}`, cls: '' }
}

export default function HistoryPage() {
  const [rows, setRows] = useState([])
  const [productos, setProductos] = useState([])
  const [filtros, setFiltros] = useState({ fecha_desde: '', fecha_hasta: '', tipo: '', producto: '', numero_factura: '' })

  useEffect(() => {
    getProductos({ page: 1, size: 500 })
      .then((r) => setProductos(r?.data?.productos || r?.productos || r?.data?.items || []))
      .catch(() => setProductos([]))
  }, [])

  useEffect(() => {
    getMovimientos({ page: 1, size: 200, ...filtros })
      .then((r) => setRows(r?.data?.items || []))
      .catch(() => setRows([]))
  }, [filtros])

  const rendered = useMemo(
    () => rows.map((m) => ({ ...m, __f: formatFechaHora(m.fecha_hora_exacta || m.fecha, m.hora), __mov: getMovimientoCantidad(m) })),
    [rows]
  )

  return (
    <div className="history-page">
      <div className="history-page__header">
        <h2>Historial</h2>
        <p>Trazabilidad completa de movimientos de inventario</p>
      </div>

      <div className="history-page__table-wrap">
        <div className="history-filters">
          <input type="date" value={filtros.fecha_desde} onChange={(e) => setFiltros((p) => ({ ...p, fecha_desde: e.target.value }))} />
          <input type="date" value={filtros.fecha_hasta} onChange={(e) => setFiltros((p) => ({ ...p, fecha_hasta: e.target.value }))} />
          <select value={filtros.tipo} onChange={(e) => setFiltros((p) => ({ ...p, tipo: e.target.value }))}>
            <option value="">Todos</option>
            <option value="entrada">Entrada</option>
            <option value="salida">Salida</option>
            <option value="ajuste">Ajuste</option>
          </select>
          <select value={filtros.producto} onChange={(e) => setFiltros((p) => ({ ...p, producto: e.target.value }))}>
            <option value="">Todos los productos</option>
            {productos.map((p) => <option key={p.id_producto} value={p.id_producto}>{p.nombre}</option>)}
          </select>
          <input type="text" placeholder="Factura" value={filtros.numero_factura} onChange={(e) => setFiltros((p) => ({ ...p, numero_factura: e.target.value }))} />
          <button onClick={() => setFiltros({ fecha_desde: '', fecha_hasta: '', tipo: '', producto: '', numero_factura: '' })}>Limpiar filtros</button>
        </div>

        <table className="history-page__table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Producto</th>
              <th>Factura</th>
              <th>Movimiento</th>
              <th>Stock resultante</th>
              <th>Fecha y hora</th>
            </tr>
          </thead>
          <tbody>
            {rendered.map((m) => (
              <tr key={m.id_movimiento}>
                <td>{m.tipo || m.movement_type}</td>
                <td>{m.nombre_producto}</td>
                <td>{m.numero_factura || '-'}</td>
                <td><span className={m.__mov.cls}>{m.__mov.text}</span></td>
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
