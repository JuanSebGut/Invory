import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { getMyProfile, updateMyProfile } from '../../api/users'
import './profile.css'

export default function ProfilePage() {
  const { user, updateUser } = useAuth()
  const [nombre, setNombre] = useState(user?.nombre || '')
  const [pass, setPass] = useState('')
  const [confirm, setConfirm] = useState('')
  const [correo, setCorreo] = useState(user?.correo || '')
  const [rol, setRol] = useState(user?.rol || '')
  const [loadingName, setLoadingName] = useState(false)
  const [loadingPass, setLoadingPass] = useState(false)
  const initials = (user?.nombre || '?').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()

  useEffect(() => {
    setCorreo(user?.correo || '')
    setRol(user?.rol || '')
    setNombre(user?.nombre || '')
  }, [user])

  useEffect(() => {
    let mounted = true
    getMyProfile()
      .then((data) => {
        if (!mounted) return
        setCorreo(data?.correo || data?.email || data?.nombre_usuario || user?.correo || '')
        setRol(data?.rol || user?.rol || '')
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [user?.correo, user?.rol])

  async function onSaveName(e) {
    e.preventDefault()
    setLoadingName(true)
    try {
      const updated = await updateMyProfile({ nombre })
      const nuevoNombre = updated?.nombre || nombre
      const nuevoCorreo = updated?.correo || updated?.email || correo
      setNombre(nuevoNombre)
      setCorreo(nuevoCorreo)
      updateUser({ nombre: nuevoNombre, correo: nuevoCorreo })
    } finally { setLoadingName(false) }
  }

  async function onSavePass(e) {
    e.preventDefault()
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(pass) || pass !== confirm) return
    setLoadingPass(true)
    try { await updateMyProfile({ contrasena: pass }); setPass(''); setConfirm('') } finally { setLoadingPass(false) }
  }

  return (
    <div className="profile-page">
      <div className="profile-container">
        <div className="profile-header">
          <div className="profile-avatar-lg">{initials}</div>
          <h2 className="profile-name">{user?.nombre}</h2>
          <span className="profile-role-badge">{user?.rol}</span>
        </div>
        <form className="profile-card" onSubmit={onSaveName}>
          <div className="profile-card__header">Informacion personal</div>
          <div className="profile-card__body">
            <label>Nombre</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <div className="profile-field-readonly"><label>Correo</label><span>{correo || 'No disponible'}</span></div>
            <button className="btn btn--primary" disabled={loadingName}>{loadingName ? 'Guardando...' : 'Guardar cambios'}</button>
          </div>
        </form>
        <form className="profile-card" onSubmit={onSavePass}>
          <div className="profile-card__header">Cambiar contrasena</div>
          <div className="profile-card__body">
            <label>Nueva contrasena</label>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
            <label>Confirmar contrasena</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <button className="btn btn--primary" disabled={loadingPass}>{loadingPass ? 'Actualizando...' : 'Cambiar contrasena'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
