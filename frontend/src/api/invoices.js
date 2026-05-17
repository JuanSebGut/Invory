const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

function getToken() {
  return localStorage.getItem('invory_token') ?? ''
}

function extractErrorMessage(data) {
  if (!data) return 'Ocurri� un error inesperado. Por favor intenta nuevamente.'

  const candidates = [
    data?.error?.message,
    data?.mensaje,
    data?.message,
    data?.error,
    data?.msg,
    data?.detail,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }

  return 'Ocurri� un error inesperado. Por favor intenta nuevamente.'
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
  try { data = await response.json() } catch {}

  if (!response.ok) {
    const error = new Error(extractErrorMessage(data))
    error.status = response.status
    error.data = data
    throw error
  }

  return data
}

export async function getInvoices({ page = 1, size = 10, fecha_desde, fecha_hasta, estado, tipo, id_cliente } = {}) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('size', String(size))
  if (fecha_desde) params.set('fecha_desde', fecha_desde)
  if (fecha_hasta) params.set('fecha_hasta', fecha_hasta)
  if (estado) params.set('estado', estado)
  if (tipo) params.set('tipo', tipo)
  if (id_cliente) params.set('id_cliente', String(id_cliente))

  const payload = await apiFetch(`/inventory/facturas?${params.toString()}`)
  return payload.data
}

export async function getInvoiceById(id) {
  const payload = await apiFetch(`/inventory/facturas/${id}`)
  return payload.data
}

export async function createInvoice(input) {
  const payload = await apiFetch('/inventory/facturas', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return payload.data
}

export async function cancelInvoice(id) {
  const payload = await apiFetch(`/inventory/facturas/${id}/anular`, {
    method: 'PATCH',
  })
  return payload.data
}