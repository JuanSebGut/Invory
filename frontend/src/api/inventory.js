/**
 * inventory.js Aaa Invory  |  MS-05 API Layer
 *
 * Endpoints consumidos (API Gateway Aaa localhost:3000):
 *   POST  /api/inventory/movements
 *         entrada : { id_producto, tipo_movimiento:'entrada', cantidad, numero_factura?, comentario? }
 *         salida  : { id_producto, tipo_movimiento:'salida',  cantidad, motivo, comentario? }
 *         ajuste  : { id_producto, tipo_movimiento:'ajuste',  cantidad, tipo_ajuste, motivo_ajuste, comentario? }
 *
 *   GET   /api/inventory/movements?page&size&producto&tipo&fecha&fecha_desde&fecha_hasta
 *
 *   GET   /api/products?page=1&size=100   (para cargar lista de productos en selectores)
 */

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

function getToken() {
  return localStorage.getItem('invory_token') ?? ''
}

function extractErrorMessage(data) {
  if (!data) return 'OcurriAA un error inesperado. Por favor intenta nuevamente.'

  const candidatos = [
    data.mensaje,
    data.message,
    data.error,
    data.msg,
    data.detail,
    data.descripcion,
    data.errorMessage,
  ]

  for (const c of candidatos) {
    if (c && typeof c === 'string' && c.trim()) return c.trim()
  }

  if (data.data) return extractErrorMessage(data.data)

  if (data.error && typeof data.error === 'object') {
    return data.error.message || data.error.msg || 'OcurriAA un error inesperado.'
  }

  if (Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors[0]
    if (typeof first === 'string') return first
    if (first?.message) return first.message
    if (first?.msg) return first.msg
  }

  return 'OcurriAA un error inesperado. Por favor intenta nuevamente.'
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers ?? {}),
    },
  })

  let data = null
  try { data = await res.json() } catch { /* sin body */ }

  if (!res.ok) {
    const err = new Error(extractErrorMessage(data))
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

/** Registrar movimiento (entrada, salida o ajuste) */
export function registrarMovimiento(payload, { force = false } = {}) {
  const suffix = force ? '?force=true' : ''
  return apiFetch(`/inventory/movements${suffix}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

/** Listar movimientos con filtros opcionales */
export function getMovimientos({ page = 1, size = 10, producto, tipo, fecha, fecha_desde, fecha_hasta, numero_factura } = {}) {
  const params = new URLSearchParams()
  params.append('page', page)
  params.append('size', size)
  if (producto) params.append('producto', producto)
  if (tipo) params.append('tipo', tipo)
  if (fecha) params.append('fecha', fecha)
  if (fecha_desde) params.append('fecha_desde', fecha_desde)
  if (fecha_hasta) params.append('fecha_hasta', fecha_hasta)
  if (numero_factura) params.append('numero_factura', numero_factura)
  return apiFetch(`/inventory/movements?${params.toString()}`)
}

/** Cargar lista de productos para selectores del formulario */
export function getProductos(pageOrOptions = 1, size = 100) {
  const opts = typeof pageOrOptions === 'object'
    ? pageOrOptions
    : { page: pageOrOptions, size }
  const pageValue = opts.page ?? 1
  const sizeValue = opts.size ?? 100
  return apiFetch(`/products?page=${pageValue}&size=${sizeValue}`)
}
