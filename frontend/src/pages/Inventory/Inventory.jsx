import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { registrarMovimiento, getProductos } from '../../api/inventory.js'
import { getProveedoresActivos } from '../../api/providers.js'
import { getClients } from '../../api/clients.js'
import { createInvoice } from '../../api/invoices.js'
import { createFiado, registerPago } from '../../api/fiados.js'
import { generarNumeroFactura } from '../../utils/factura.js'
import './inventory.css'

const MOTIVOS_SALIDA = [
  { val: 'venta', label: 'Venta' },
  { val: 'devolucion', label: 'Devolución a proveedor' },
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
  motivo_entrada: 'compra',
  motivo: '',
  monto_pagado: '',
  id_cliente: '',
  forma_pago: 'pago_total',
  fecha_pago_acordada: '',
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

function getProductById(products, productId) {
  return products.find((item) => String(item.id_producto ?? item.id) === String(productId))
}

function allowsFraction(product) {
  if (!product) return false
  if (typeof product.permite_fraccion === 'boolean') return product.permite_fraccion
  const normalized = String(product.permite_fraccion ?? '').toLowerCase()
  return normalized === 'true' || normalized === '1'
}

function hasDecimal(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return false
  return Math.abs(parsed % 1) > Number.EPSILON
}

function getUnitLabel(product) {
  if (!product?.unidad) return null
  const nombre = product.unidad.nombre || 'Unidad'
  const abreviatura = product.unidad.abreviatura ? ` (${product.unidad.abreviatura})` : ''
  return `${nombre}${abreviatura}`
}

export default function Inventory() {
  const { user } = useAuth()
  const isAdmin = user?.rol === 'Administrador'

  const [productos, setProductos] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [clientes, setClientes] = useState([])
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

  useEffect(() => {
    async function loadClientes() {
      try {
        const resp = await getClients({ page: 1, size: 500, estado: true })
        setClientes(resp?.data?.items ?? resp?.items ?? [])
      } catch {
        setClientes([])
      }
    }
    loadClientes()
  }, [])

  const isVenta = tipoMovimiento === 'salida' && form.motivo === 'venta'
  const isDevolucionProveedor = tipoMovimiento === 'salida' && form.motivo === 'devolucion'
  const isDevolucionCliente = tipoMovimiento === 'entrada' && form.motivo_entrada === 'devolucion'
  const isMultiProduct = isVenta || isDevolucionProveedor || isDevolucionCliente

  const totalVenta = useMemo(
    () => lineasVenta.reduce((acc, l) => acc + Number(l.cantidad || 0) * Number(l.precio_venta || 0), 0),
    [lineasVenta]
  )

  const montoRecibido = Number(form.monto_pagado || 0)
  const diferencia = montoRecibido - totalVenta
  const isQtyValid = (value, product) => {
    const qty = Number(value)
    if (!Number.isFinite(qty) || qty <= 0) return false
    if (!allowsFraction(product) && hasDecimal(qty)) return false
    return true
  }

  const shouldShowForceMinimo = useMemo(() => {
    if (!isAdmin) return false

    const getStockInfo = (idProducto) => {
      const p = productos.find((x) => String(x.id_producto ?? x.id) === String(idProducto))
      if (!p) return null
      const stockActual = Number(p.stock_actual ?? p.stockActual ?? 0)
      const stockMinimo = Number(p.stock_minimo ?? p.stockMinimo ?? 0)
      if (!Number.isFinite(stockActual) || !Number.isFinite(stockMinimo)) return null
      return { stockActual, stockMinimo }
    }

    if (isMultiProduct && tipoMovimiento !== 'devolucion') {
      const stockTracker = new Map()
      for (const linea of lineasVenta) {
        const product = getProductById(productos, linea.id_producto)
        if (!linea.id_producto || !isQtyValid(linea.cantidad, product)) continue
        const info = getStockInfo(linea.id_producto)
        if (!info) continue
        const key = String(linea.id_producto)
        const remaining = stockTracker.has(key) ? stockTracker.get(key) : info.stockActual
        const next = remaining - Number(linea.cantidad)
        stockTracker.set(key, next)
        if (next < info.stockMinimo) return true
      }
      return false
    }

    const selectedProduct = getProductById(productos, form.id_producto)
    if (!form.id_producto || !isQtyValid(form.cantidad, selectedProduct)) return false
    const info = getStockInfo(form.id_producto)
    if (!info) return false

    const reducesStock =
      tipoMovimiento === 'salida' ||
      (tipoMovimiento === 'ajuste' && form.tipo_ajuste === 'faltante')

    if (!reducesStock) return false
    const projected = info.stockActual - Number(form.cantidad)
    return projected < info.stockMinimo
  }, [
    isAdmin,
    isMultiProduct,
    lineasVenta,
    productos,
    form.id_producto,
    form.cantidad,
    form.tipo_ajuste,
    tipoMovimiento,
  ])

  useEffect(() => {
    if (!shouldShowForceMinimo && form.force_minimo) {
      setForm((p) => ({ ...p, force_minimo: false }))
    }
  }, [shouldShowForceMinimo, form.force_minimo])

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
    const product = getProductById(productos, form.id_producto)
    const qty = Number(form.cantidad)
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('Cantidad inválida.')
    if (!allowsFraction(product) && hasDecimal(qty)) {
      throw new Error('Este producto no permite cantidades fraccionadas. Ingrese una cantidad entera.')
    }
    if (tipoMovimiento === 'salida' && !form.motivo) throw new Error('Selecciona motivo de salida.')
    if (tipoMovimiento === 'ajuste' && !form.motivo_ajuste.trim()) throw new Error('El motivo del ajuste es obligatorio.')
  }

  function validateMulti() {
    if (!lineasVenta.length) throw new Error('Agrega al menos una línea de venta.')
    for (let i = 0; i < lineasVenta.length; i += 1) {
      const ln = lineasVenta[i]
      if (!ln.id_producto) throw new Error(`Linea ${i + 1}: selecciona producto.`)
      const product = getProductById(productos, ln.id_producto)
      const qty = Number(ln.cantidad)
      if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Linea ${i + 1}: cantidad inválida.`)
      if (!allowsFraction(product) && hasDecimal(qty)) {
        throw new Error(`Linea ${i + 1}: este producto no permite cantidades fraccionadas.`)
      }
    }
    if (form.forma_pago === 'fiado') {
      if (!form.id_cliente) throw new Error('Debes seleccionar un cliente para registrar un fiado.')
      if (!form.fecha_pago_acordada) throw new Error('Debes especificar una fecha de pago acordada.')
    }
  }

  async function submit() {
    setLoading(true)
    setError('')
    setResultado(null)

    try {
      if (!isAdmin && tipoMovimiento === 'ajuste') {
        throw new Error('Solo el administrador puede registrar ajustes.')
      }

      if (isMultiProduct) {
        validateMulti()
        
        let facturaGenerada = null;
        let idFacturaReal = null;
        let facturaNumeroStr = form.numero_factura.trim() || generarNumeroFactura(isDevolucionCliente ? 'devolucion' : 'venta');

        // 1. Crear Factura primero (solo para Venta o Devolución Cliente)
        try {
          let finalObservacion = form.comentario || '';
          if (isVenta) {
            if (form.forma_pago === 'fiado') {
               const abono = form.monto_pagado ? Number(form.monto_pagado) : 0;
               const notaFiado = `[COMPRA FIADA] - Abono inicial: $${abono}.`;
               finalObservacion = finalObservacion ? `${notaFiado} ${finalObservacion}` : notaFiado;
            } else if (form.forma_pago === 'pago_total') {
               const pago = form.monto_pagado ? Number(form.monto_pagado) : totalVenta;
               const vuelto = pago - totalVenta;
               const notaPago = `[PAGO TOTAL] - Recibido: $${pago}, Vuelto: $${vuelto >= 0 ? vuelto : 0}.`;
               finalObservacion = finalObservacion ? `${notaPago} ${finalObservacion}` : notaPago;
            }
          } else if (isDevolucionCliente || isDevolucionProveedor) {
             finalObservacion = finalObservacion ? `[DEVOLUCION] ${finalObservacion}` : '[DEVOLUCION]';
          }

          if (isDevolucionProveedor) {
            idFacturaReal = null;
            facturaNumeroStr = form.numero_factura.trim() || generarNumeroFactura('salida');
            facturaGenerada = { numero_factura: facturaNumeroStr };
          } else {
            const detalleFactura = lineasVenta.map((l) => ({
              id_producto: Number(l.id_producto),
              cantidad: Number(l.cantidad),
              precio_unitario: Number(l.precio_venta),
            }));
            
            const invoicePayload = {
              id_cliente: form.id_cliente ? Number(form.id_cliente) : null,
              tipo: isDevolucionCliente ? 'devolucion' : 'venta',
              detalle: detalleFactura,
              observaciones: finalObservacion || null,
            };
            
            const invoiceResp = await createInvoice(invoicePayload);
            facturaGenerada = invoiceResp?.data || invoiceResp;
            idFacturaReal = facturaGenerada.id_factura;
            facturaNumeroStr = facturaGenerada.numero_factura || facturaNumeroStr;
          }
        } catch (err) {
          throw new Error('Error al crear la factura: ' + (err.message || 'Desconocido'));
        }

        const procesadas = []
        const errores = []

        // 2. Registrar Movimientos
        for (let i = 0; i < lineasVenta.length; i += 1) {
          const linea = lineasVenta[i]
          let finalObservacionMovimiento = form.comentario || '';
          
          if (isVenta) {
            if (form.forma_pago === 'fiado') {
               const abono = form.monto_pagado ? Number(form.monto_pagado) : 0;
               const notaFiado = `[COMPRA FIADA] - Abono inicial: $${abono}.`;
               finalObservacionMovimiento = finalObservacionMovimiento ? `${notaFiado} ${finalObservacionMovimiento}` : notaFiado;
            } else if (form.forma_pago === 'pago_total') {
               const pago = form.monto_pagado ? Number(form.monto_pagado) : totalVenta;
               const vuelto = pago - totalVenta;
               const notaPago = `[PAGO TOTAL] - Recibido: $${pago}, Vuelto: $${vuelto >= 0 ? vuelto : 0}.`;
               finalObservacionMovimiento = finalObservacionMovimiento ? `${notaPago} ${finalObservacionMovimiento}` : notaPago;
            }
          } else if (isDevolucionCliente || isDevolucionProveedor) {
            finalObservacionMovimiento = finalObservacionMovimiento ? `[DEVOLUCION] ${finalObservacionMovimiento}` : '[DEVOLUCION]';
          }

          const payload = {
            id_producto: Number(linea.id_producto),
            tipo_movimiento: tipoMovimiento,
            cantidad: Number(linea.cantidad),
            numero_factura: facturaNumeroStr,
            id_factura: idFacturaReal,
            comentario: finalObservacionMovimiento || null,
          }
          
          if (tipoMovimiento === 'salida') {
            payload.motivo = form.motivo
            if (form.motivo === 'venta') {
              if (form.monto_pagado) payload.monto_pagado = Number(form.monto_pagado)
              if (form.forma_pago === 'fiado' && !form.monto_pagado) payload.monto_pagado = 0
            }
          }

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
        
        // 3. Registrar Fiado si aplica
        let fiadoGenerado = null;
        if (isVenta && form.forma_pago === 'fiado' && errores.length === 0) {
          try {
            const fiadoPayload = {
              id_usuario: user.id_usuario,
              monto_total: totalVenta,
              fecha_pago_acordada: form.fecha_pago_acordada,
              observaciones: form.comentario || null,
              id_factura: idFacturaReal,
            };
            const fiadoResp = await createFiado(Number(form.id_cliente), fiadoPayload);
            fiadoGenerado = fiadoResp?.data || fiadoResp;
            
            // Si el cliente abonó algo inicialmente, registrar pago
            if (form.monto_pagado && Number(form.monto_pagado) > 0) {
              await registerPago(fiadoGenerado.id_fiado, {
                 id_usuario: user.id_usuario,
                 monto: Number(form.monto_pagado),
                 observaciones: 'Abono inicial en venta',
              });
            }
          } catch (err) {
            errores.push({ linea: 'Fiado', message: err.message || 'No se pudo crear el fiado.' });
          }
        }

        if (errores.length) {
          setResultado({
            tipo: 'venta_multiproducto_parcial',
            numero_factura: facturaNumeroStr,
            procesadas,
            errores,
            totalVenta,
            monto_pagado: form.monto_pagado ? Number(form.monto_pagado) : null,
            vuelto: form.monto_pagado ? Number(form.monto_pagado) - totalVenta : null,
          })
          setError(`Se procesaron ${procesadas.length} linea(s). Fallo: ${errores[0].message}`)
          return
        }

        setResultado({
          tipo: 'venta_multiproducto',
          numero_factura: facturaNumeroStr,
          items: procesadas.map((x) => x.data),
          totalVenta,
          monto_pagado: form.monto_pagado ? Number(form.monto_pagado) : null,
          vuelto: form.monto_pagado ? Number(form.monto_pagado) - totalVenta : null,
          fiado: fiadoGenerado,
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

  function registrarOtroMovimiento() {
    setResultado(null)
    setError('')
    setForm({ ...INITIAL_FORM, numero_factura: generarNumeroFactura(tipoMovimiento) })
    setLineasVenta([{ id_producto: '', cantidad: 1, precio_venta: 0 }])
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
          {resultado ? (
            <div className="registro-result">
              {resultado.tipo === 'venta_multiproducto' && (
                <>
                  <h3 className="registro-result__title">{isDevolucionCliente ? 'Devolución registrada' : 'Venta o salida multiproducto registrada'}</h3>
                  <p className="registro-result__detail">Factura: <strong>{resultado.numero_factura}</strong></p>
                  <p className="registro-result__detail">Total venta: <strong>{resultado.totalVenta}</strong></p>
                  {resultado.monto_pagado != null && (
                    <p className="registro-result__detail">Monto recibido/abonado: <strong>{resultado.monto_pagado}</strong> · Vuelto/Saldo: <strong>{resultado.vuelto}</strong></p>
                  )}
                  {resultado.fiado && (
                    <p className="registro-result__detail" style={{ color: 'var(--color-warning)' }}>
                      <strong>¡Fiado Registrado!</strong> (ID #{resultado.fiado.id_fiado})
                    </p>
                  )}
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
              <div style={{ marginTop: 8 }}>
                <button type="button" className="btn btn--primary" onClick={registrarOtroMovimiento}>
                  Registrar otro movimiento
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="inv-tabs" style={{ marginBottom: '22px' }}>
            <button type="button" className={`inv-tab inv-tab--entrada ${tipoMovimiento === 'entrada' ? 'active' : ''}`} onClick={() => resetByTipo('entrada')}>Entrada</button>
            <button type="button" className={`inv-tab inv-tab--salida ${tipoMovimiento === 'salida' ? 'active' : ''}`} onClick={() => resetByTipo('salida')}>Salida</button>
            {isAdmin && <button type="button" className={`inv-tab inv-tab--ajuste ${tipoMovimiento === 'ajuste' ? 'active' : ''}`} onClick={() => resetByTipo('ajuste')}>Ajuste</button>}
          </div>

          <div className="inv-form">
          {error && <div className="alert-banner alert-banner--error">{error}</div>}

          <div className="form-row">
            <div className="field">
              <label className="field__label">Numero de factura</label>
              <input className="field__input" value={form.numero_factura} onChange={(e) => setForm((p) => ({ ...p, numero_factura: e.target.value }))} />
            </div>
            {tipoMovimiento === 'entrada' && (
              <div className="field">
                <label className="field__label">Tipo de entrada</label>
                <select className="field__select" value={form.motivo_entrada} onChange={(e) => setForm((p) => ({ ...p, motivo_entrada: e.target.value }))}>
                  <option value="compra">Ingreso normal / Compra</option>
                  <option value="devolucion">Devolución de cliente</option>
                </select>
              </div>
            )}
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

          {isMultiProduct ? (
            <>
              <div className="inv-multi-table-wrap">
                <table className="inv-multi-table">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Precio unitario</th>
                      <th>Subtotal</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineasVenta.map((linea, idx) => {
                      const producto = getProductById(productos, linea.id_producto)
                      const subtotal = Number(linea.cantidad || 0) * Number(linea.precio_venta || 0)
                      const allowsFractionLine = allowsFraction(producto)
                      return (
                        <tr key={`linea-${idx}`}>
                          <td>
                            <select className="field__select" value={linea.id_producto} onChange={(e) => {
                              const selected = productos.find((x) => String(x.id_producto) === String(e.target.value))
                              updateLinea(idx, {
                                id_producto: e.target.value,
                                precio_venta: Number(selected?.precio_venta || 0),
                              })
                            }}>
                              <option value="">Selecciona</option>
                              {productos.map((p) => <option key={p.id_producto ?? p.id} value={p.id_producto ?? p.id}>{p.nombre}</option>)}
                            </select>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <input
                                className="field__input"
                                type="number"
                                min={allowsFractionLine ? '0.001' : '1'}
                                step={allowsFractionLine ? '0.001' : '1'}
                                value={linea.cantidad}
                                onChange={(e) => updateLinea(idx, { cantidad: e.target.value })}
                                style={{ width: '80px' }}
                              />
                              <span className="unit-label" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{getUnitLabel(producto) || ''}</span>
                            </div>
                          </td>
                          <td>
                            <input className="field__input" readOnly value={Number(linea.precio_venta || producto?.precio_venta || 0)} style={{ width: '100px' }} />
                          </td>
                          <td>
                            <input className="field__input" readOnly value={subtotal} style={{ width: '100px' }} />
                          </td>
                          <td>
                            <button type="button" className="btn btn--icon btn--ghost" onClick={() => removeLinea(idx)} title="Quitar línea">
                              ✕
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="venta-actions" style={{ marginTop: '12px' }}>
                <button type="button" className="btn btn--ghost" onClick={addLinea}>+ Agregar producto</button>
              </div>

              <div className="form-row" style={{ marginTop: '24px' }}>
                {!isDevolucionProveedor && (
                  <div className="field">
                    <label className="field__label">Cliente (opcional)</label>
                    <select className="field__select" value={form.id_cliente} onChange={(e) => setForm((p) => ({ ...p, id_cliente: e.target.value }))}>
                      <option value="">Consumidor Final</option>
                      {clientes.map((c) => <option key={c.id_cliente} value={c.id_cliente}>{c.nombre}</option>)}
                    </select>
                  </div>
                )}
                {isVenta && (
                  <div className="field">
                    <label className="field__label">Forma de Pago</label>
                    <select className="field__select" value={form.forma_pago} onChange={(e) => setForm((p) => ({ ...p, forma_pago: e.target.value }))}>
                      <option value="pago_total">Pago Total</option>
                      <option value="fiado">Fiado</option>
                    </select>
                  </div>
                )}
              </div>

              {isVenta && form.forma_pago === 'fiado' && (
                <div className="form-row">
                  <div className="field">
                    <label className="field__label">Fecha de pago acordada *</label>
                    <input className="field__input" type="date" value={form.fecha_pago_acordada} onChange={(e) => setForm((p) => ({ ...p, fecha_pago_acordada: e.target.value }))} />
                  </div>
                </div>
              )}

              <div className="form-row venta-resumen">
                {isVenta && (
                  <div className="field">
                    <label className="field__label">Monto recibido del cliente (opcional)</label>
                    <input className="field__input" type="number" min="0" value={form.monto_pagado} onChange={(e) => setForm((p) => ({ ...p, monto_pagado: e.target.value }))} />
                  </div>
                )}
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
              <div className="form-row inv-salida-main-row">
                <div className="field">
                  <label className="field__label">Producto</label>
                  <select className="field__select" value={form.id_producto} onChange={(e) => setForm((p) => ({ ...p, id_producto: e.target.value }))}>
                    <option value="">Selecciona</option>
                    {productos.map((p) => <option key={p.id_producto ?? p.id} value={p.id_producto ?? p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field__label">
                    Cantidad
                    {getUnitLabel(getProductById(productos, form.id_producto))
                      ? ` · ${getUnitLabel(getProductById(productos, form.id_producto))}`
                      : ''}
                  </label>
                  <input
                    className="field__input"
                    type="number"
                    min={allowsFraction(getProductById(productos, form.id_producto)) ? '0.001' : '1'}
                    step={allowsFraction(getProductById(productos, form.id_producto)) ? '0.001' : '1'}
                    value={form.cantidad}
                    onChange={(e) => setForm((p) => ({ ...p, cantidad: e.target.value }))}
                  />
                </div>
              </div>

              {tipoMovimiento === 'entrada' && (
                <div className="field inv-entrada-proveedor">
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
                <>
                  <div className="field inv-ajuste-tipo">
                    <label className="field__label">Tipo de ajuste</label>
                    <select className="field__select" value={form.tipo_ajuste} onChange={(e) => setForm((p) => ({ ...p, tipo_ajuste: e.target.value }))}>
                      <option value="sobrante">Sobrante (+)</option>
                      <option value="faltante">Faltante (-)</option>
                    </select>
                  </div>
                  <div className="field inv-ajuste-motivo">
                    <label className="field__label">Motivo del ajuste</label>
                    <input className="field__input" value={form.motivo_ajuste} onChange={(e) => setForm((p) => ({ ...p, motivo_ajuste: e.target.value }))} />
                  </div>
                </>
              )}

            </>
          )}

          <div className="field" style={{ marginTop: 8 }}>
            <label className="field__label">Comentario (opcional)</label>
            <input className="field__input" value={form.comentario} onChange={(e) => setForm((p) => ({ ...p, comentario: e.target.value }))} />
          </div>

          {isAdmin && shouldShowForceMinimo && (
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
          </div>
            </>
          )}

          <div style={{ marginTop: '18px' }}>
            <Link to="/historial" className="btn btn--ghost">Ver historial completo {'->'}</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
