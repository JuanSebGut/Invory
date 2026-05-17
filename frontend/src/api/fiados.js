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

export async function createFiado(idCliente, input) {
  const payload = await apiFetch(`/clients/${idCliente}/fiados`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return payload.data
}

export async function registerPago(idFiado, input) {
  const payload = await apiFetch(`/fiados/${idFiado}/pagos`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return payload.data
}

export async function getFiadoAlertas() {
  const payload = await apiFetch('/fiados/alertas')
  return payload.data
}