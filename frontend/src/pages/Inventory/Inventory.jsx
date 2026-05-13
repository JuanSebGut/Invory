import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { registrarMovimiento, getProductos } from '../../api/inventory.js'
import { getProveedoresActivos } from '../../api/providers.js'
import { generarNumeroFactura } from '../../utils/factura.js'
import './inventory.css'

const MOTIVOS_SALIDA = [
  { val: 'venta', label: 'Venta' },
  { val: 'merma', label: 'Merma' },
  { val: 'rotura', label: 'Rotura' },
  { val: 'danado', label: 'Danado' },
  { val: 'vencido', label: 'Vencido' },
]

const INITIAL_FORM = {
  id_producto: '',
  cantidad: '',
  id_proveedor: '',
  numero_factura: '',
  motivo: '',
  monto_pagado: '',
  tipo_ajuste: 'sobrante',
  motivo_ajuste: '',
  comentario: '',
  force_minimo: false,
}

function parseProductos(resp) {
  return resp?.data?.productos ?? resp?.productos ?? resp?.data?.items ?? resp?.items ?? []
}

function parseProveedores(resp) {
  return (
    resp?.data?.items ??
    resp?.items ??
    resp?.data?.proveedores ??
    resp?.proveedores ??
    (Array.isArray(resp?.data) ? resp.data : [])
  )
}

export default function Inventory() {
  const { user } = useAuth()
  const isAdmin = user?.rol === 'Administrador'

  const [productos, setProductos] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [productosLoad, setProductosLoad] = useState(true)

  const [tipoMovimiento, setTipoMovimiento] = useState('entrada')
  const [form, setForm] = useState({ ...INITIAL_FORM, numero_factura: generarNumeroFactura('entrada') })
  const [lineasVenta, setLineasVenta] = useState([{ id_producto: '', cantidad: 1, precio_venta: 0 }])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState(null)

  useEffect(() => {
    async function loadProductos() {
      setProductosLoad(true)
      try {
        const resp = await getProductos({ page: 1, size: 500 })
        setProductos(parseProductos(resp))
      } catch {
        setProductos([])
      } finally {
        setProductosLoad(false)
      }
    }
    loadProductos()
  }, [])

  useEffect(() => {
    async function loadProveedores() {
      try {
        const resp = await getProveedoresActivos()
        setProveedores(parseProveedores(resp))
      } catch {
        setProveedores([])
      }
    }
    loadProveedores()
  }, [])

  const isVentaMulti = tipoMovimiento === 'salida' && form.motivo === 'venta'

  const totalVenta = useMemo(
    () => lineasVenta.reduce((acc, l) => acc + Number(l.cantidad || 0) * Number(l.precio_venta || 0), 0),
    [lineasVenta]
  )

  const montoRecibido = Number(form.monto_pagado || 0)
  const diferencia = montoRecibido - totalVenta

  function resetByTipo(tipo) {
    setTipoMovimiento(tipo)
    setError('')
    setResultado(null)
    setForm({ ...INITIAL_FORM, numero_factura: generarNumeroFactura(tipo) })
    setLineasVenta([{ id_producto: '', cantidad: 1, precio_venta: 0 }])
  }

  function updateLinea(index, patch) {
    setLineasVenta((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function addLinea() {
    setLineasVenta((prev) => [...prev, { id_producto: '', cantidad: 1, precio_venta: 0 }])
  }

  function removeLinea(index) {
    setLineasVenta((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  function validateSingle() {
    if (!form.id_producto) throw new Error('Selecciona un producto.')
    const qty = Number(form.cantidad)
    if (!Number.isInteger(qty) || qty <= 0) throw new Error('Cantidad inválida.')
    if (tipoMovimiento === 'salida' && !form.motivo) throw new Error('Selecciona motivo de salida.')
    if (tipoMovimiento === 'ajuste' && !form.motivo_ajuste.trim()) throw new Error('El motivo del ajuste es obligatorio.')
  }

  function validateMulti() {
    if (!lineasVenta.length) throw new Error('Agrega al menos una línea de venta.')
    for (let i = 0; i < lineasVenta.length; i += 1) {
      const ln = lineasVenta[i]
      if (!ln.id_producto) throw new Error(`Linea ${i + 1}: selecciona producto.`)
      const qty = Number(ln.cantidad)
      if (!Number.isInteger(qty) || qty <= 0) throw new Error(`Linea ${i + 1}: cantidad inválida.`)
    }
  }

  async function submit() {
    setLoading(true)
    setError('')
    setResultado(null)

    try {
      if (isVentaMulti) {
        validateMulti()
        const factura = form.numero_factura.trim() || generarNumeroFactura('venta')
        const procesadas = []
        const errores = []

        for (let i = 0; i < lineasVenta.length; i += 1) {
          const linea = lineasVenta[i]
          const payload = {
            id_producto: Number(linea.id_producto),
            tipo_movimiento: 'salida',
            cantidad: Number(linea.cantidad),
            motivo: 'venta',
            numero_factura: factura,
          }
          if (form.monto_pagado) payload.monto_pagado = Number(form.monto_pagado)

          try {
            const resp = await registrarMovimiento(payload, {
              force: Boolean(isAdmin && form.force_minimo),
            })
            procesadas.push({ linea: i + 1, data: resp?.data })
          } catch (lineError) {
            errores.push({ linea: i + 1, message: lineError?.message || 'Error desconocido' })
            break
          }
        }

        if (errores.length) {
          setResultado({
            tipo: 'venta_multiproducto_parcial',
            numero_factura: factura,
            procesadas,
            errores,
            totalVenta,
            monto_pagado: form.monto_pagado ? Number(form.monto_pagado) : null,
            vuelto: form.monto_pagado ? Number(form.monto_pagado) - totalVenta : null,
          })
          setError(`Se procesaron ${procesadas.length} linea(s). Fallo en linea ${errores[0].linea}: ${errores[0].message}`)
          return
        }

        setResultado({
          tipo: 'venta_multiproducto',
          numero_factura: factura,
          items: procesadas.map((x) => x.data),
          totalVenta,
          monto_pagado: form.monto_pagado ? Number(form.monto_pagado) : null,
          vuelto: form.monto_pagado ? Number(form.monto_pagado) - totalVenta : null,
        })
        return
      }

      validateSingle()

      const payload = {
        id_producto: Number(form.id_producto),
        tipo_movimiento: tipoMovimiento,
        cantidad: Number(form.cantidad),
        numero_factura: form.numero_factura.trim() || generarNumeroFactura(tipoMovimiento),
      }

      if (tipoMovimiento === 'entrada') {
        if (form.id_proveedor) payload.id_proveedor = Number(form.id_proveedor)
      }

      if (tipoMovimiento === 'salida') {
        payload.motivo = form.motivo
        if (form.motivo === 'venta' && form.monto_pagado) payload.monto_pagado = Number(form.monto_pagado)
      }

      if (tipoMovimiento === 'ajuste') {
        payload.tipo_ajuste = form.tipo_ajuste
        payload.motivo_ajuste = form.motivo_ajuste.trim()
      }

      if (form.comentario.trim()) payload.comentario = form.comentario.trim()

      const resp = await registrarMovimiento(payload, {
        force: Boolean(isAdmin && form.force_minimo),
      })

      setResultado({ ...resp.data, tipo: tipoMovimiento })
    } catch (e) {
      setError(e.message || 'No fue posible registrar el movimiento.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="inv-page">
      <div className="inv-page__header">
        <div className="inv-page__heading">
          <h2 className="inv-page__title">Movimientos de inventario</h2>
          <p className="inv-page__subtitle">Registra entradas, salidas{isAdmin ? ' y ajustes' : ''}</p>
        </div>
      </div>

      <div className="inv-card">
        <div className="inv-card__body">
          <div className="tipo-selector">
            <button type="button" className={`tipo-btn ${tipoMovimiento === 'entrada' ? 'active--entrada' : ''}`} onClick={() => resetByTipo('entrada')}>Entrada</button>
            <button type="button" className={`tipo-btn ${tipoMovimiento === 'salida' ? 'active--salida' : ''}`} onClick={() => resetByTipo('salida')}>Salida</button>
            {isAdmin && <button type="button" className={`tipo-btn ${tipoMovimiento === 'ajuste' ? 'active--ajuste' : ''}`} onClick={() => resetByTipo('ajuste')}>Ajuste</button>}
          </div>

          {error && <div className="alert-banner alert-banner--error">{error}</div>}

          <div className="form-row">
            <div className="field">
              <label className="field__label">Numero de factura</label>
              <input className="field__input" value={form.numero_factura} onChange={(e) => setForm((p) => ({ ...p, numero_factura: e.target.value }))} />
            </div>
            {tipoMovimiento === 'salida' && (
              <div className="field">
                <label className="field__label">Motivo de salida</label>
                <select className="field__select" value={form.motivo} onChange={(e) => setForm((p) => ({ ...p, motivo: e.target.value }))}>
                  <option value="">Selecciona</option>
                  {MOTIVOS_SALIDA.map((m) => <option key={m.val} value={m.val}>{m.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {isVentaMulti ? (
            <>
              {lineasVenta.map((linea, idx) => {
                const producto = productos.find((p) => String(p.id_producto) === String(linea.id_producto))
                const subtotal = Number(linea.cantidad || 0) * Number(linea.precio_venta || 0)
                return (
                  <div className="venta-linea" key={`linea-${idx}`}>
                    <div className="venta-linea__header">Linea {idx + 1}</div>
                    <div className="form-row venta-linea__grid">
                    <div className="field">
                      <label className="field__label">Producto</label>
                      <select className="field__select" value={linea.id_producto} onChange={(e) => {
                        const selected = productos.find((x) => String(x.id_producto) === String(e.target.value))
                        updateLinea(idx, {
                          id_producto: e.target.value,
                          precio_venta: Number(selected?.precio_venta || 0),
                        })
                      }}>
                        <option value="">Selecciona</option>
                        {productos.map((p) => <option key={p.id_producto} value={p.id_producto}>{p.nombre}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label className="field__label">Cantidad</label>
                      <input className="field__input" type="number" min="1" value={linea.cantidad} onChange={(e) => updateLinea(idx, { cantidad: Number(e.target.value || 1) })} />
                    </div>
                    <div className="field">
                      <label className="field__label">Precio unitario</label>
                      <input className="field__input" readOnly value={Number(linea.precio_venta || producto?.precio_venta || 0)} />
                    </div>
                    <div className="field">
                      <label className="field__label">Subtotal</label>
                      <input className="field__input" readOnly value={subtotal} />
                    </div>
                    <div className="field venta-linea__remove">
                      <button type="button" className="btn btn--ghost" onClick={() => removeLinea(idx)}>Quitar</button>
                    </div>
                  </div>
                  </div>
                )
              })}

              <div className="venta-actions">
                <button type="button" className="btn btn--ghost" onClick={addLinea}>+ Agregar producto</button>
              </div>

              <div className="form-row venta-resumen">
                <div className="field">
                  <label className="field__label">Monto recibido del cliente (opcional)</label>
                  <input className="field__input" type="number" min="0" value={form.monto_pagado} onChange={(e) => setForm((p) => ({ ...p, monto_pagado: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field__label">Resumen</label>
                  <div className="field__hint">
                    Total venta: <strong>{totalVenta}</strong>{' · '}
                    {form.monto_pagado ? (
                      <>
                        Monto recibido: <strong>{montoRecibido}</strong>{' · '}
                        {diferencia >= 0 ? 'Vuelto' : 'Falta'}: <strong>{Math.abs(diferencia)}</strong>
                      </>
                    ) : 'Sin monto recibido'}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="form-row">
                <div className="field">
                  <label className="field__label">Producto</label>
                  <select className="field__select" value={form.id_producto} onChange={(e) => setForm((p) => ({ ...p, id_producto: e.target.value }))}>
                    <option value="">Selecciona</option>
                    {productos.map((p) => <option key={p.id_producto} value={p.id_producto}>{p.nombre}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field__label">Cantidad</label>
                  <input className="field__input" type="number" min="1" value={form.cantidad} onChange={(e) => setForm((p) => ({ ...p, cantidad: e.target.value }))} />
                </div>
              </div>

              {tipoMovimiento === 'entrada' && (
                <div className="field">
                  <label className="field__label">Proveedor (opcional)</label>
                  <select className="field__select" value={form.id_proveedor} onChange={(e) => setForm((p) => ({ ...p, id_proveedor: e.target.value }))}>
                    <option value="">Sin proveedor</option>
                    {proveedores.map((p) => {
                      const id = p.id_proveedor ?? p.id
                      const name = p.razon_social ?? p.nombre ?? `Proveedor #${id}`
                      return <option key={id} value={id}>{name}</option>
                    })}
                  </select>
                </div>
              )}

              {tipoMovimiento === 'ajuste' && (
                <div className="form-row">
                  <div className="field">
                    <label className="field__label">Tipo de ajuste</label>
                    <select className="field__select" value={form.tipo_ajuste} onChange={(e) => setForm((p) => ({ ...p, tipo_ajuste: e.target.value }))}>
                      <option value="sobrante">Sobrante (+)</option>
                      <option value="faltante">Faltante (-)</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="field__label">Motivo del ajuste</label>
                    <input className="field__input" value={form.motivo_ajuste} onChange={(e) => setForm((p) => ({ ...p, motivo_ajuste: e.target.value }))} />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="field" style={{ marginTop: 8 }}>
            <label className="field__label">Comentario (opcional)</label>
            <input className="field__input" value={form.comentario} onChange={(e) => setForm((p) => ({ ...p, comentario: e.target.value }))} />
          </div>

          {isAdmin && (
            <div className="field" style={{ marginTop: 8 }}>
              <label className="field__label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.force_minimo}
                  onChange={(e) => setForm((p) => ({ ...p, force_minimo: e.target.checked }))}
                />
                Forzar salida por debajo del stock minimo (Admin)
              </label>
            </div>
          )}

          <div className="form-footer">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => setForm((p) => ({ ...INITIAL_FORM, numero_factura: generarNumeroFactura(tipoMovimiento) }))}
              disabled={loading}
            >
              Limpiar
            </button>
            <button type="button" className={`btn btn--${tipoMovimiento}`} onClick={submit} disabled={loading || productosLoad}>
              {loading ? 'Registrando...' : 'Registrar'}
            </button>
          </div>

          {resultado && (
            <div className="registro-result">
              {resultado.tipo === 'venta_multiproducto' && (
                <>
                  <h3 className="registro-result__title">Venta multiproducto registrada</h3>
                  <p className="registro-result__detail">Factura: <strong>{resultado.numero_factura}</strong></p>
                  <p className="registro-result__detail">Total venta: <strong>{resultado.totalVenta}</strong></p>
                </>
              )}
              {resultado.tipo === 'venta_multiproducto_parcial' && (
                <>
                  <h3 className="registro-result__title">Venta multiproducto parcial</h3>
                  <p className="registro-result__detail">Factura: <strong>{resultado.numero_factura}</strong></p>
                  <p className="registro-result__detail">Procesadas: <strong>{resultado.procesadas?.length || 0}</strong> · Fallidas: <strong>{resultado.errores?.length || 0}</strong></p>
                </>
              )}
              {!['venta_multiproducto', 'venta_multiproducto_parcial'].includes(resultado.tipo) && (
                <>
                  <h3 className="registro-result__title">Movimiento registrado</h3>
                  <p className="registro-result__detail">
                    <strong>{resultado.nombre_producto}</strong> · {Number(resultado.cantidad)} unidades
                    {resultado.numero_factura ? ` · Factura: ${resultado.numero_factura}` : ''}
                  </p>
                </>
              )}
            </div>
          )}

          <div style={{ marginTop: '18px' }}>
            <Link to="/historial" className="btn btn--ghost">Ver historial completo {'->'}</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
