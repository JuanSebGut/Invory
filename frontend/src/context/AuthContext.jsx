// Guarda y recupera el JWT de localStorage 


import { createContext, useState, useEffect, useCallback } from 'react'
import { logoutRequest } from '../api/auth.js'

export const AuthContext = createContext(null)

const TOKEN_KEY = 'invory_token'
const USER_KEY = 'invory_user'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)       // { id_usuario, rol, nombre, correo }
  const [token, setToken] = useState(null)
  const [isLoading, setIsLoading] = useState(true) // cargando sesion inicial

  // Al montar: recuperar sesion guardada en localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY)
    const savedUser = localStorage.getItem(USER_KEY)

    if (savedToken && savedUser) {
      try {
        setToken(savedToken)
        setUser(JSON.parse(savedUser))
      } catch {
        // Datos corruptos: limpiar
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
      }
    }
    setIsLoading(false)
  }, [])

  /**
   * Guardar sesion tras login exitoso
   * @param {{ token, id_usuario, rol, nombre, correo }} loginData
   */
  const login = useCallback((loginData) => {
    const {
      token: newToken,
      id_usuario,
      rol,
      nombre,
      correo,
      email,
      nombre_usuario,
    } = loginData
    const userData = {
      id_usuario,
      rol,
      nombre,
      correo: correo || email || nombre_usuario || '',
    }

    localStorage.setItem(TOKEN_KEY, newToken)
    localStorage.setItem(USER_KEY, JSON.stringify(userData))

    setToken(newToken)
    setUser(userData)
  }, [])

  /**
   * Cerrar sesion: limpia localStorage y estado
   */
const logout = useCallback(async () => {
  try {
    await logoutRequest()
  } catch (error) {
    console.warn('Error al cerrar sesion en el servidor:', error)
  } finally {
    // Siempre limpia localmente independiente de la respuesta del servidor
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }
}, [])

  const isAuthenticated = !!token && !!user

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
