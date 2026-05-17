import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { cancelInvoice, getInvoiceById, getInvoices } from '../../api/invoices'
import './InvoicesPage.css'

function toMoney(value) {
  return Number(value || 0).toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 2,
  })
}

function formatDateTime(value) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('es-CO')
}

function buildPrintHtml(invoice) {
  const businessName =
    localStorage.getItem('invory_business_name') ||
    import.meta.env.VITE_BUSINESS_NAME ||
    'INVORY'

  const rows = (invoice.detalle || [])
    .map((item) => `
      <tr>
        <td>${item.producto_nombre || `Producto #${item.id_producto}`}</td>
        <td>${Number(item.cantidad || 0).toLocaleString('es-CO')}</td>
        <td>${toMoney(item.precio_unitario)}</td>
        <td>${toMoney(item.subtotal)}</td>
      </tr>
    `)
    .join('')

  let extraTotalsHtml = '';
  let cleanObservaciones = invoice.observaciones || '';
  
  if (cleanObservaciones.includes('[PAGO TOTAL]')) {
    const match = cleanObservaciones.match(/\[PAGO TOTAL\] - Recibido: \$([\d.]+), Vuelto: \$([\d.]+)\./);
    if (match) {
      extraTotalsHtml = `
        <p><span>Recibido</span><span>${toMoney(match[1])}</span></p>
        <p><span>Vuelto</span><span>${toMoney(match[2])}</span></p>
      `;
      cleanObservaciones = cleanObservaciones.replace(match[0], '').trim();
    }
  } else if (cleanObservaciones.includes('[COMPRA FIADA]')) {
    const match = cleanObservaciones.match(/\[COMPRA FIADA\] - Abono inicial: \$([\d.]+)\./);
    if (match) {
      const abono = Number(match[1]);
      const saldo = Number(invoice.total) - abono;
      extraTotalsHtml = `
        <p><span>Abono inicial</span><span>${toMoney(abono)}</span></p>
        <p><strong>Saldo pendiente</strong><strong>${toMoney(saldo)}</strong></p>
      `;
      cleanObservaciones = cleanObservaciones.replace(match[0], '').trim();
    }
  }

  return `
    <html>
      <head>
        <title>Factura ${invoice.numero_factura}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 24px; background: #f4f7fb; }
          .page { max-width: 820px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; }
          .header { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
          h1 { margin: 0; font-size: 22px; }
          .meta p { margin: 2px 0; font-size: 13px; color: #334155; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #dbe3ee; padding: 8px; font-size: 13px; }
          th { background: #f8fafc; text-align: left; }
          .totals { margin-top: 16px; display: flex; justify-content: flex-end; }
          .totals-box { min-width: 280px; border: 1px solid #dbe3ee; border-radius: 8px; padding: 10px 12px; }
          .totals-box p { display: flex; justify-content: space-between; margin: 4px 0; font-size: 13px; }
          .totals-box p strong { font-size: 15px; }

          @media print {
            body { margin: 0; padding: 0; background: #fff; }
            body * { visibility: hidden; }
            #printable, #printable * { visibility: visible; }
            #printable { position: absolute; left: 0; top: 0; width: 100%; border: none; border-radius: 0; }
          }
        </style>
      </head>
      <body>
        <div class="page" id="printable">
          <div class="header">
            <div>
              <h1>${businessName}</h1>
              <p>Factura: <strong>${invoice.numero_factura}</strong></p>
            </div>
            <div class="meta">
              <p>Fecha: ${formatDateTime(invoice.fecha_emision)}</p>
              <p>Estado: ${invoice.estado}</p>
              <p>Tipo: ${invoice.tipo}</p>
              <p>Cliente: ${invoice.cliente?.nombre || invoice.cliente_nombre || 'Consumidor final'}</p>
              ${cleanObservaciones ? `<p style="margin-top: 8px; color: #000;"><strong>Observaciones:</strong><br/> ${cleanObservaciones}</p>` : ''}
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Precio unitario</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${rows}
            </tbody>
          </table>

          <div class="totals">
            <div class="totals-box">
              <p><span>Subtotal</span><span>${toMoney(invoice.subtotal)}</span></p>
              <p><span>Descuento</span><span>${toMoney(invoice.descuento)}</span></p>
              <p><strong>Total</strong><strong>${toMoney(invoice.total)}</strong></p>
              ${extraTotalsHtml}
            </div>
          </div>
        </div>
      </body>
    </html>
  `
}

export default function InvoicesPage() {
  const { user } = useAuth()
  const isAdmin = user?.rol === 'Administrador'

  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })
  const [filters, setFilters] = useState({
    fecha_desde: '',
    fecha_hasta: '',
    estado: '',
    tipo: '',
  })

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getInvoices({ page, size: 10, ...filters })
      setInvoices(data?.items ?? [])
      setPagination({ total: data?.total ?? 0, totalPages: data?.totalPages ?? 1 })
    } catch (err) {
      setError(err.message || 'No fue posible cargar las facturas.')
      setInvoices([])
      setPagination({ total: 0, totalPages: 1 })
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => { fetchData() }, [fetchData])

  const pageNumbers = useMemo(() => {
    const total = pagination.totalPages
    if (total <= 6) return Array.from({ length: total }, (_, index) => index + 1)
    if (page <= 3) return [1, 2, 3, 4, '...', total]
    if (page >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total]
    return [1, '...', page - 1, page, page + 1, '...', total]
  }, [page, pagination.totalPages])

  async function onPrint(idFactura) {
    try {
      const invoice = await getInvoiceById(idFactura)
      const popup = window.open('', '_blank', 'width=900,height=720')
      if (!popup) {
        setError('No se pudo abrir la ventana de impresión. Revisa el bloqueador de ventanas emergentes.')
        return
      }

      popup.document.write(buildPrintHtml(invoice))
      popup.document.close()
      popup.focus()
    } catch (err) {
      setError(err.message || 'No fue posible cargar la factura para impresión.')
    }
  }

  async function onCancel(idFactura) {
    const confirmed = window.confirm('¿Seguro que deseas anular esta factura?')
    if (!confirmed) return

    try {
      await cancelInvoice(idFactura)
      await fetchData()
    } catch (err) {
      setError(err.message || 'No fue posible anular la factura.')
    }
  }

  return (
    <div className="invoices-page">
      <div className="invoices-header">
        <div>
          <h2>Facturas</h2>
          <p>Consulta, filtra e imprime facturas emitidas.</p>
        </div>
      </div>

      <div className="invoices-filters">
        <label>
          Desde
          <input
            type="date"
            value={filters.fecha_desde}
            onChange={(event) => { setFilters((state) => ({ ...state, fecha_desde: event.target.value })); setPage(1) }}
          />
        </label>

        <label>
          Hasta
          <input
            type="date"
            value={filters.fecha_hasta}
            onChange={(event) => { setFilters((state) => ({ ...state, fecha_hasta: event.target.value })); setPage(1) }}
          />
        </label>

        <label>
          Estado
          <select
            value={filters.estado}
            onChange={(event) => { setFilters((state) => ({ ...state, estado: event.target.value })); setPage(1) }}
          >
            <option value="">Todos</option>
            <option value="emitida">Emitida</option>
            <option value="anulada">Anulada</option>
          </select>
        </label>

        <label>
          Tipo
          <select
            value={filters.tipo}
            onChange={(event) => { setFilters((state) => ({ ...state, tipo: event.target.value })); setPage(1) }}
          >
            <option value="">Todos</option>
            <option value="venta">Venta</option>
            <option value="devolucion">Devolución</option>
          </select>
        </label>
      </div>

      <div className="invoices-card">
        {error && <div className="invoices-error">{error}</div>}

        <table className="invoices-table">
          <thead>
            <tr>
              <th>Número</th>
              <th>Fecha</th>
              <th>Cliente</th>
              <th>Tipo</th>
              <th>Estado</th>
              <th>Total</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="invoices-empty">Cargando facturas...</td>
              </tr>
            )}

            {!loading && invoices.length === 0 && (
              <tr>
                <td colSpan={7} className="invoices-empty">No hay facturas para los filtros seleccionados.</td>
              </tr>
            )}

            {!loading && invoices.map((invoice) => (
              <tr key={invoice.id_factura}>
                <td>{invoice.numero_factura}</td>
                <td>{formatDateTime(invoice.fecha_emision)}</td>
                <td>{invoice.cliente_nombre || 'Consumidor final'}</td>
                <td>
                  {invoice.tipo}
                  {invoice.observaciones && invoice.observaciones.includes('[COMPRA FIADA]') && (
                     <div style={{ fontSize: '0.85em', color: '#b45309', fontWeight: 600, marginTop: '4px' }}>Fiado</div>
                  )}
                </td>
                <td>
                  <span className={`invoice-badge ${invoice.estado === 'anulada' ? 'is-canceled' : 'is-issued'}`}>
                    {invoice.estado}
                  </span>
                </td>
                <td>{toMoney(invoice.total)}</td>
                <td>
                  <div className="invoices-actions">
                    <button className="invoices-btn invoices-btn--ghost" onClick={() => onPrint(invoice.id_factura)} type="button">
                      Imprimir
                    </button>
                    {isAdmin && invoice.estado !== 'anulada' && (
                      <button className="invoices-btn invoices-btn--danger" onClick={() => onCancel(invoice.id_factura)} type="button">
                        Anular
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && pagination.totalPages > 1 && (
          <div className="invoices-pagination">
            <span>{pagination.total} facturas · página {page} de {pagination.totalPages}</span>
            <div className="invoices-pagination-controls">
              <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>{'<'}</button>
              {pageNumbers.map((item, index) => (
                item === '...'
                  ? <span key={`sep-${index}`}>...</span>
                  : (
                    <button
                      key={`page-${item}`}
                      className={page === item ? 'is-current' : ''}
                      type="button"
                      onClick={() => setPage(Number(item))}
                    >
                      {item}
                    </button>
                  )
              ))}
              <button type="button" onClick={() => setPage((value) => Math.min(pagination.totalPages, value + 1))} disabled={page === pagination.totalPages}>{'>'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}