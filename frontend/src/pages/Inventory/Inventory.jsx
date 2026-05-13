
/**
 * Inventory.jsx | MS-05 Frontend
 * Vista: Movimientos de Inventario
 *
 * Ruta:       /inventario
 * Roles:
 *   Administrador → Entrada, Salida, Ajuste + Historial completo
 *   Operador      → Entrada, Salida          + Historial (solo lectura de ajustes)
 *
 * MS-08: Los movimientos de ENTRADA ahora permiten asociar un proveedor
 *        (id_proveedor opcional). Se carga el listado de proveedores activos
 *        al montar el componente y se muestra como selector en el formulario.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  registrarMovimiento,
  getProductos,
} from '../../api/inventory.js'
import { getProveedoresActivos } from '../../api/providers.js'
import './inventory.css'

/* ─────────────────────────────────────────────
   ICONOS SVG
───────────────────────────────────────────── */

const IconEntrada = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M12 3v12M8 11l4 4 4-4"/>
    <path d="M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/>
  </svg>
)
const IconSalida = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M12 21V9M8 13l4-4 4 4"/>
    <path d="M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/>
  </svg>
)
const IconAjuste = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
    <path d="M21 3v5h-5"/>
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
    <path d="M3 21v-5h5"/>
  </svg>
)
const IconCheck = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
const IconAlert = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)
const IconClose = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
const IconLock = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)
const IconProveedor = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)
const IconSpinner = () => (
  <svg className="spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10" strokeWidth="3" stroke="currentColor" strokeOpacity="0.2" />
    <path d="M12 2a10 10 0 0 1 10 10" strokeWidth="3" stroke="currentColor" strokeLinecap="round" />
  </svg>
)

/* ─────────────────────────────────────────────
   HOOK: TOASTS
───────────────────────────────────────────── */
function useToast() {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})
  const add = useCallback((msg, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, msg, type }])
    timers.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
      delete timers.current[id]
    }, 4000)
  }, [])
  return { toasts, addToast: add }
}

function ToastContainer({ toasts }) {
  if (!toasts.length) return null
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          <span className={`toast-dot toast-dot--${t.type}`} />
          {t.msg}
        </div>
      ))}
    </div>
  )
}

/* ─────────────────────────────────────────────
   FORMULARIO DE REGISTRO
───────────────────────────────────────────── */
const MOTIVOS_SALIDA = [
  { val: 'venta',   label: 'Venta' },
  { val: 'merma',   label: 'Merma' },
  { val: 'rotura',  label: 'Rotura' },
  { val: 'danado',  label: 'Dañado' },
  { val: 'vencido', label: 'Vencido' },
]

const INITIAL_FORM = {
  id_producto:    '',
  cantidad:       '',
  // entrada
  id_proveedor:   '',
  numero_factura: '',
  // salida
  motivo:         '',
  monto_pagado:   '',
  // ajuste
  tipo_ajuste:    'sobrante',
  motivo_ajuste:  '',
  // común
  comentario:     '',
}

function FormRegistro({ isAdmin, productos, productosCargando, proveedores, proveedoresCargando, onRegistrado, addToast }) {
  const [tipoMovimiento, setTipoMovimiento] = useState('entrada')
  const [form, setForm]         = useState(INITIAL_FORM)
  const [errors, setErrors]     = useState({})
  const [apiError, setApiError] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [resultado, setResultado] = useState(null)

  const productoSeleccionado = productos.find(
    p => String(p.id_producto) === String(form.id_producto)
  )

  const proveedorSeleccionado = proveedores.find(
    p => String(p.id_proveedor ?? p.id) === String(form.id_proveedor)
  )

  function handleTipo(tipo) {
    setTipoMovimiento(tipo)
    setForm(INITIAL_FORM)
    setErrors({})
    setApiError(null)
    setResultado(null)
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }))
    setApiError(null)
  }

  function validate() {
    const errs = {}
    if (!form.id_producto) errs.id_producto = 'Selecciona un producto.'
    const cant = Number(form.cantidad)
    if (!form.cantidad || !Number.isInteger(cant) || cant <= 0)
      errs.cantidad = 'Ingresa una cantidad entera mayor a 0.'
    if (tipoMovimiento === 'salida' && !form.motivo)
      errs.motivo = 'Selecciona un motivo de salida.'
    if (tipoMovimiento === 'ajuste' && !form.motivo_ajuste.trim())
      errs.motivo_ajuste = 'El motivo del ajuste es obligatorio.'
    return errs
  }

  async function handleSubmit() {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})
    setApiError(null)
    setLoading(true)

    let payload = {
      id_producto:     Number(form.id_producto),
      tipo_movimiento: tipoMovimiento,
      cantidad:        Number(form.cantidad),
    }

    if (tipoMovimiento === 'entrada') {
      if (form.id_proveedor) {
        payload.id_proveedor = Number(form.id_proveedor)
      }
      if (form.numero_factura.trim()) payload.numero_factura = form.numero_factura.trim()
      if (form.comentario.trim())     payload.comentario     = form.comentario.trim()
    } else if (tipoMovimiento === 'salida') {
      payload.motivo = form.motivo
      if (form.motivo === 'venta' && form.monto_pagado) payload.monto_pagado = Number(form.monto_pagado)
      if (form.comentario.trim()) payload.comentario = form.comentario.trim()
    } else {
      payload.tipo_ajuste   = form.tipo_ajuste
      payload.motivo_ajuste = form.motivo_ajuste.trim()
      if (form.comentario.trim()) payload.comentario = form.comentario.trim()
    }

    try {
      const resp = await registrarMovimiento(payload)
      setResultado({ ...resp.data, tipo: tipoMovimiento })
      onRegistrado()
    } catch (err) {
      setApiError(err.message ?? 'No fue posible registrar el movimiento.')
      if (err.status === 422) addToast('Stock insuficiente para registrar la salida.', 'error')
    } finally {
      setLoading(false)
    }
  }

  function handleNuevo() {
    setResultado(null)
    setForm(INITIAL_FORM)
    setErrors({})
    setApiError(null)
  }

  if (resultado) {
    return (
      <div className="registro-result">
        <div className={`registro-result__icon registro-result__icon--${tipoMovimiento}`}>
          <IconCheck />
        </div>
        <h3 className="registro-result__title">
          {tipoMovimiento === 'entrada' && 'Entrada registrada'}
          {tipoMovimiento === 'salida'  && 'Salida registrada'}
          {tipoMovimiento === 'ajuste'  && 'Ajuste registrado'}
        </h3>
        <p className="registro-result__detail">
          <strong>{resultado.nombre_producto}</strong> — {Number(resultado.cantidad)} unidades
          {resultado.numero_factura ? ` · Factura: ${resultado.numero_factura}` : ''}
          {resultado.id_proveedor && proveedorSeleccionado
            ? ` · Proveedor: ${proveedorSeleccionado.razon_social ?? proveedorSeleccionado.nombre}`
            : ''}
        </p>
        {tipoMovimiento === 'salida' && resultado.monto_pagado != null && (
          <p className="registro-result__detail">
            Monto pagado: <strong>${Number(resultado.monto_pagado).toLocaleString('es-CO')}</strong>
            {' · '}
            Vuelto: <strong>${(Number(resultado.monto_pagado) - (Number(resultado.cantidad || 0) * Number(productoSeleccionado?.precio_venta || 0))).toLocaleString('es-CO')}</strong>
          </p>
        )}
        <div className="registro-result__stock">
          <div className="stock-item">
            <span className="stock-item__val stock-item__val--before">{resultado.stock_anterior}</span>
            <span className="stock-item__lbl">Stock anterior</span>
          </div>
          <div className="stock-arrow">→</div>
          <div className="stock-item">
            <span className={`stock-item__val ${tipoMovimiento === 'salida' && resultado.nuevo_stock <= 0 ? 'stock-item__val--after-danger' : 'stock-item__val--after'}`}>
              {resultado.nuevo_stock}
            </span>
            <span className="stock-item__lbl">Nuevo stock</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
          <button className="btn btn--ghost" onClick={handleNuevo}>Registrar otro</button>
        </div>
      </div>
    )
  }

  return (
    <div className="inv-form">
      {/* Selector tipo */}
      <div className="tipo-selector">
        <button
          type="button"
          className={`tipo-btn ${tipoMovimiento === 'entrada' ? 'active--entrada' : ''}`}
          onClick={() => handleTipo('entrada')}
        >
          <IconEntrada />
          Entrada
        </button>
        <button
          type="button"
          className={`tipo-btn ${tipoMovimiento === 'salida' ? 'active--salida' : ''}`}
          onClick={() => handleTipo('salida')}
        >
          <IconSalida />
          Salida
        </button>
        {isAdmin && (
          <button
            type="button"
            className={`tipo-btn ${tipoMovimiento === 'ajuste' ? 'active--ajuste' : ''}`}
            onClick={() => handleTipo('ajuste')}
          >
            <IconAjuste />
            Ajuste
          </button>
        )}
      </div>

      {/* Error banner */}
      {apiError && (
        <div className="alert-banner alert-banner--error" role="alert">
          <IconAlert />
          <span>{apiError}</span>
          <button className="alert-banner__close" onClick={() => setApiError(null)} type="button">
            <IconClose />
          </button>
        </div>
      )}

      {/* Producto */}
      <div className={`field ${errors.id_producto ? 'field--error' : ''}`}>
        <label className="field__label">
          Producto <span className="required">*</span>
        </label>
        {productosCargando ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--inv-text-muted)', fontSize: 13 }}>
            <IconSpinner />
            Cargando productos...
          </div>
        ) : (
          <select
            name="id_producto"
            className="field__select"
            value={form.id_producto}
            onChange={handleChange}
          >
            <option value="">— Selecciona un producto —</option>
            {productos.map(p => (
              <option key={p.id_producto} value={p.id_producto}>
                {p.nombre} {p.codigo_barras ? `(${p.codigo_barras})` : ''}
              </option>
            ))}
          </select>
        )}
        {errors.id_producto && <span className="field__error-msg">{errors.id_producto}</span>}
        {productoSeleccionado && (
          <span className={`field__stock-badge ${productoSeleccionado.stock_actual <= (productoSeleccionado.stock_minimo ?? 0) ? 'field__stock-badge--low' : 'field__stock-badge--ok'}`}>
            Stock disponible: <strong>{productoSeleccionado.stock_actual}</strong> unidades
          </span>
        )}
      </div>

      {/* Fila principal: Cantidad + campo condicional */}
      <div className="form-row">
        <div className={`field ${errors.cantidad ? 'field--error' : ''}`}>
          <label className="field__label">
            Cantidad <span className="required">*</span>
          </label>
          <input
            type="number"
            name="cantidad"
            className="field__input"
            placeholder="Ej: 10"
            min="1"
            step="1"
            value={form.cantidad}
            onChange={handleChange}
          />
          {errors.cantidad && <span className="field__error-msg">{errors.cantidad}</span>}
        </div>

        {tipoMovimiento === 'entrada' && (
          <div className="field">
            <label className="field__label">
              Nº Factura <span className="field__optional">(opcional)</span>
            </label>
            <input
              type="text"
              name="numero_factura"
              className="field__input"
              placeholder="Ej: FAC-001"
              maxLength={50}
              value={form.numero_factura}
              onChange={handleChange}
            />
          </div>
        )}

        {tipoMovimiento === 'salida' && (
          <div className={`field ${errors.motivo ? 'field--error' : ''}`}>
            <label className="field__label">
              Motivo de salida <span className="required">*</span>
            </label>
            <select
              name="motivo"
              className="field__select"
              value={form.motivo}
              onChange={handleChange}
            >
              <option value="">— Selecciona —</option>
              {MOTIVOS_SALIDA.map(m => (
                <option key={m.val} value={m.val}>{m.label}</option>
              ))}
            </select>
            {errors.motivo && <span className="field__error-msg">{errors.motivo}</span>}
          </div>
        )}
        {tipoMovimiento === 'salida' && form.motivo === 'venta' && (
          <div className="field">
            <label className="field__label">
              Monto recibido del cliente <span className="field__optional">(opcional)</span>
            </label>
            <input
              type="number"
              name="monto_pagado"
              className="field__input"
              placeholder="Ej: 15000"
              min="0"
              step="1"
              value={form.monto_pagado}
              onChange={handleChange}
            />
          </div>
        )}

        {tipoMovimiento === 'ajuste' && (
          <div className="field">
            <label className="field__label">
              Tipo de ajuste <span className="required">*</span>
            </label>
            <select
              name="tipo_ajuste"
              className="field__select"
              value={form.tipo_ajuste}
              onChange={handleChange}
            >
              <option value="sobrante">Sobrante (+)</option>
              <option value="faltante">Faltante (−)</option>
            </select>
          </div>
        )}
      </div>

      {/* Proveedor (solo ENTRADA) */}
      {tipoMovimiento === 'entrada' && (
        <div className="field">
          <label className="field__label">
            Proveedor <span className="field__optional">(opcional)</span>
          </label>
          {proveedoresCargando ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--inv-text-muted)', fontSize: 13 }}>
              <IconSpinner />
              Cargando proveedores...
            </div>
          ) : (
            <select
              name="id_proveedor"
              className="field__select"
              value={form.id_proveedor}
              onChange={handleChange}
            >
              <option value="">— Sin proveedor —</option>
              {proveedores.map(p => {
                const id = p.id_proveedor ?? p.id
                const nombre = p.razon_social ?? p.nombre_razon_social ?? p.nombre ?? `Proveedor #${id}`
                return (
                  <option key={id} value={id}>
                    {nombre}{p.nit_identificacion ? ` · NIT: ${p.nit_identificacion}` : p.nit ? ` · NIT: ${p.nit}` : ''}
                  </option>
                )
              })}
            </select>
          )}
        </div>
      )}

      {/* Motivo ajuste */}
      {tipoMovimiento === 'ajuste' && (
        <div className={`field ${errors.motivo_ajuste ? 'field--error' : ''}`}>
          <label className="field__label">
            Motivo del ajuste <span className="required">*</span>
          </label>
          <input
            type="text"
            name="motivo_ajuste"
            className="field__input"
            placeholder="Ej: Conteo cíclico, error de ingreso..."
            maxLength={120}
            value={form.motivo_ajuste}
            onChange={handleChange}
          />
          {errors.motivo_ajuste && <span className="field__error-msg">{errors.motivo_ajuste}</span>}
        </div>
      )}

      {/* Comentario */}
      <div className="field">
        <label className="field__label">
          Comentario <span className="field__optional">(opcional)</span>
        </label>
        <input
          type="text"
          name="comentario"
          className="field__input"
          placeholder="Observaciones adicionales..."
          maxLength={200}
          value={form.comentario}
          onChange={handleChange}
        />
      </div>

      {/* Footer */}
      <div className="form-footer">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => { setForm(INITIAL_FORM); setErrors({}); setApiError(null) }}
          disabled={loading}
        >
          Limpiar
        </button>
        <button
          type="button"
          className={`btn btn--${tipoMovimiento} btn--lg`}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading
            ? <><IconSpinner /> Registrando...</>
            : tipoMovimiento === 'entrada' ? 'Registrar entrada'
            : tipoMovimiento === 'salida'  ? 'Registrar salida'
            : 'Registrar ajuste'
          }
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   PÁGINA PRINCIPAL
───────────────────────────────────────────── */
export default function Inventory() {
  const { user } = useAuth()
  const isAdmin  = user?.rol === 'Administrador'

  const [productos,       setProductos]       = useState([])
  const [productosLoad,   setProductosLoad]   = useState(true)
  const [proveedores,     setProveedores]     = useState([])
  const [proveedoresLoad, setProveedoresLoad] = useState(true)
  const { toasts, addToast } = useToast()

  useEffect(() => {
    async function cargarProductos() {
      setProductosLoad(true)
      try {
        const resp = await getProductos()
        const lista = resp?.data?.productos ?? resp?.productos ?? []
        setProductos(lista)
      } catch {
        // fallo silencioso
      } finally {
        setProductosLoad(false)
      }
    }
    cargarProductos()
  }, [])

  useEffect(() => {
    async function cargarProveedores() {
      setProveedoresLoad(true)
      try {
        const resp = await getProveedoresActivos()
        const lista =
          resp?.data?.items ??
          resp?.data?.proveedores ??
          (Array.isArray(resp?.data) ? resp.data : null) ??
          resp?.items ??
          resp?.proveedores ??
          (Array.isArray(resp) ? resp : [])
        setProveedores(lista)
      } catch {
        setProveedores([])
      } finally {
        setProveedoresLoad(false)
      }
    }
    cargarProveedores()
  }, [])

  function handleRegistrado() {
    addToast('Movimiento registrado correctamente.', 'success')
  }

  return (
    <div className="inv-page">
      <div className="inv-page__header">
        <div className="inv-page__heading">
          <h2 className="inv-page__title">Movimientos de inventario</h2>
          <p className="inv-page__subtitle">
            Registra entradas, salidas{isAdmin ? ' y ajustes' : ''} · Consulta el historial
          </p>
        </div>
      </div>

      <div className="inv-card">
        <div className="inv-card__header">
          <div className="inv-card__icon-wrap inv-card__icon-wrap--neutral">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <h3 className="inv-card__title">Registrar movimiento</h3>
        </div>
        <div className="inv-card__body">
          <FormRegistro
            isAdmin={isAdmin}
            productos={productos}
            productosCargando={productosLoad}
            proveedores={proveedores}
            proveedoresCargando={proveedoresLoad}
            onRegistrado={handleRegistrado}
            addToast={addToast}
          />
          <div style={{ marginTop: '18px' }}>
            <Link to="/historial" className="btn btn--ghost">
              Ver historial completo →
            </Link>
          </div>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  )
}