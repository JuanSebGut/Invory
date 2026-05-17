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

export async function getClients({ page = 1, size = 10, estado, q } = {}) {
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('size', String(size))
  if (estado !== undefined && estado !== null && estado !== '') {
    params.set('estado', String(estado))
  }
  if (q) params.set('q', String(q).trim())

  const payload = await apiFetch(`/clients?${params.toString()}`)
  return payload.data
}

export async function getClientById(id) {
  const payload = await apiFetch(`/clients/${id}`)
  return payload.data
}

export async function createClient(input) {
  const payload = await apiFetch('/clients', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return payload.data
}

export async function updateClient(id, input) {
  const payload = await apiFetch(`/clients/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
  return payload.data
}

export async function toggleClientStatus(id, estado) {
  const payload = await apiFetch(`/clients/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ estado }),
  })
  return payload.data
}

export async function getClientFiados(id) {
  const payload = await apiFetch(`/clients/${id}/fiados`)
  return payload.data
}