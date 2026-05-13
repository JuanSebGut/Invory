// Comunicacion con el servicio de autenticacion MS-01
// Endpoints: POST /api/auth/login | POST /api/auth/logout

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

// Clave del token JWT en localStorage na compartida con AuthContext
const TOKEN_KEY = 'invory_token'

export async function loginRequest(correo, contrasena) {
  let response
  try {
    response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ correo, contrasena }),
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor. Verifica tu conexion.')
  }

  let data
  try {
    data = await response.json()
  } catch {
    throw new Error('Error de conexion con el servidor. Intontalo de nuevo.')
  }

  if (response.ok) return data

  if (response.status === 401) throw new Error('Correo o contrasena incorrectos.')
  if (response.status === 423) throw new Error('Cuenta bloqueada. Demasiados intentos fallidos. Intontalo en 15 minutos.')
  if (response.status === 403) throw new Error('Tu cuenta esta deshabilitada. Contacta al Administrador.')

  throw new Error(data?.mensaje || 'Error inesperado. Intontalo de nuevo.')
}

// Cierra sesion contra POST /api/auth/logout
export async function logoutRequest() {
  const token = localStorage.getItem(TOKEN_KEY)
  try {
    if (token) {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
    }
  } catch {
    console.warn('No se pudo contactar el servidor para logout. Limpiando sesion local.')
  } finally {
    // Siempre limpiar el token local na independiente de la respuesta del servidor
    localStorage.removeItem(TOKEN_KEY)
  }
}

export { TOKEN_KEY }
