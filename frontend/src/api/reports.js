const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

function pickFirstArray(candidates) {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate
  }
  return []
}

function getToken() {
  return localStorage.getItem('invory_token') ?? ''
}

function extractErrorMessage(data) {
  if (!data) return 'Ocurrio un error inesperado. Por favor intenta nuevamente.'

  const candidates = [
    data?.error?.message,
    data?.message,
    data?.mensaje,
    data?.error,
    data?.msg,
    data?.detail,
  ]

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }

  return 'Ocurrio un error inesperado. Por favor intenta nuevamente.'
}

async function apiFetch(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers ?? {}),
    },
  })

  let data = null
  try { data = await response.json() } catch { /* response without JSON body */ }

  if (!response.ok) {
    const error = new Error(extractErrorMessage(data))
    error.status = response.status
    error.data = data
    throw error
  }

  return data
}

export const REPORT_TYPES = [
  { value: 'movements', label: 'Movimientos' },
  { value: 'sales', label: 'Ventas' },
  { value: 'stock', label: 'Stock actual' },
  { value: 'profits', label: 'Rentabilidad' },
  { value: 'comparative', label: 'Comparativo' },
  { value: 'no-movement', label: 'Sin movimiento' },
  { value: 'by-category', label: 'Por categoria' },
]

export const REPORT_FILTERS = {
  movements: ['fecha_inicio', 'fecha_fin', 'categoria', 'producto', 'tipo'],
  sales: ['fecha_inicio', 'fecha_fin', 'categoria', 'producto'],
  stock: ['categoria', 'producto'],
  profits: ['fecha_desde', 'fecha_hasta'],
  comparative: [
    'periodo_actual_desde',
    'periodo_actual_hasta',
    'periodo_anterior_desde',
    'periodo_anterior_hasta',
  ],
  'no-movement': ['dias'],
  'by-category': [],
}

export const MOVEMENT_FILTER_OPTIONS = [
  { value: 'entrada', label: 'Entrada' },
  { value: 'salida', label: 'Salida' },
  { value: 'ajuste', label: 'Ajuste' },
]

export function buildReportQuery(reportType, filters = {}) {
  const params = new URLSearchParams()
  const supportedFilters = REPORT_FILTERS[reportType] ?? []

  for (const key of supportedFilters) {
    const value = filters[key]
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }

  return params.toString()
}

export async function getReport(reportType, filters = {}) {
  const query = buildReportQuery(reportType, filters)
  const payload = await apiFetch(`/inventory/reports/${reportType}${query ? `?${query}` : ''}`)
  return payload.data
}

export function normalizeCatalogResponse({ categoriesResponse, productsResponse }) {
  const rawCats = pickFirstArray([
    categoriesResponse?.data?.categorias,
    categoriesResponse?.data?.categories,
    categoriesResponse?.data,
  ])

  const rawProds = pickFirstArray([
    productsResponse?.data?.productos,
    productsResponse?.data?.items,
    productsResponse?.data,
  ])

  const categories = rawCats.map((c) => ({
    ...c,
    id_categoria: c.id_categoria ?? c.id ?? c.id_cat ?? c.categoria_id,
    nombre_categoria: c.nombre_categoria ?? c.nombre ?? c.name ?? c.categoria,
  }))

  const products = rawProds.map((p) => ({
    ...p,
    id_producto: p.id_producto ?? p.id ?? p.producto_id,
    id_categoria: p.id_categoria ?? p.categoria_id ?? p.id_cat,
    nombre: p.nombre ?? p.name ?? p.producto,
  }))

  return { categories, products }
}

export async function getReportFiltersCatalog() {
  const [categoriesResponse, productsResponse] = await Promise.all([
    apiFetch('/categories?estado=activo'),
    apiFetch('/products?page=1&size=300'),
  ])

  return normalizeCatalogResponse({ categoriesResponse, productsResponse })
}
