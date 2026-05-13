import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { getUsers, createUser, updateUser, disableUser } from '../../api/users'
import './users.css'

const EMPTY_FORM = { nombre: '', correo: '', contrasena: '', id_rol: 2, estado: 'activo' }

function getInitials(nombre = '') {
  return nombre.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '?'
}

export default function UsersPage() {
  const { user: authUser } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState('')
  const [search, setSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState('activo')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, size: 10 })

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)

  const [confirmUser, setConfirmUser] = useState(null)
  const [confirmLoading, setConfirmLoading] = useState(false)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    setTableError('')
    try {
      const data = await getUsers({ page, size: 10, estado: filterEstado })
      setUsers(data.items || [])
      setPagination({ total: data.total ?? 0, totalPages: data.totalPages ?? 1, size: data.size ?? 10 })
    } catch (err) {
      setTableError(err.message || 'No fue posible cargar los usuarios.')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }, [page, filterEstado])

  useEffect(() => { fetchUsers() }, [fetchUsers])

  const visible = useMemo(() => users.filter((u) => (
    u.nombre?.toLowerCase().includes(search.toLowerCase()) ||
    u.correo?.toLowerCase().includes(search.toLowerCase())
  )), [users, search])

  const pageNumbers = useMemo(() => {
    const t = pagination.totalPages
    if (t <= 6) return Array.from({ length: t }, (_, i) => i + 1)
    if (page <= 3) return [1, 2, 3, 4, '...', t]
    if (page >= t - 2) return [1, '...', t - 3, t - 2, t - 1, t]
    return [1, '...', page - 1, page, page + 1, '...', t]
  }, [page, pagination.totalPages])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(u) {
    setEditing(u)
    setForm({ nombre: u.nombre || '', correo: u.correo || '', contrasena: '', id_rol: u.id_rol || 2, estado: u.estado === false ? 'inactivo' : 'activo' })
    setFormError('')
    setModalOpen(true)
  }

  async function handleSave(e) {
    e.preventDefault()
    if (!form.nombre.trim()) return setFormError('El nombre es obligatorio.')
    if (!editing && !form.correo.trim()) return setFormError('El correo es obligatorio.')
    if (!editing && form.contrasena.length < 8) return setFormError('La contrasena debe tener minimo 8 caracteres.')

    setFormLoading(true)
    setFormError('')
    try {
      if (editing) {
        const payload = { nombre: form.nombre.trim(), id_rol: Number(form.id_rol), estado: form.estado }
        if (form.contrasena.trim()) payload.contrasena = form.contrasena.trim()
        await updateUser(editing.id_usuario, payload)
      } else {
        await createUser({ nombre: form.nombre.trim(), correo: form.correo.trim(), contrasena: form.contrasena.trim(), id_rol: Number(form.id_rol), estado: form.estado })
      }
      setModalOpen(false)
      fetchUsers()
    } catch (err) {
      setFormError(err.message || 'No fue posible guardar el usuario.')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleDisable() {
    if (!confirmUser) return
    setConfirmLoading(true)
    try {
      await disableUser(confirmUser.id_usuario, authUser)
      setConfirmUser(null)
      fetchUsers()
    } catch (err) {
      setFormError(err.message || 'No fue posible deshabilitar el usuario.')
    } finally {
      setConfirmLoading(false)
    }
  }

  return (
    <>
      <div className="u-page-header">
        <div className="u-page-heading">
          <h2 className="u-page-title">Gestion de usuarios</h2>
          <p className="u-page-subtitle">Administra las cuentas de acceso al sistema</p>
        </div>
        <button className="u-btn u-btn--primary" onClick={openCreate}>Nuevo usuario</button>
      </div>

      <div className="u-toolbar">
        <div className="u-search-box">
          <input className="u-search-input" type="text" placeholder="Buscar por nombre o correo" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="u-filter-bar">
          <span className="u-filter-label">Estado:</span>
          <select className="u-filter-select" value={filterEstado} onChange={(e) => { setFilterEstado(e.target.value); setPage(1) }}>
            <option value="activo">Activos</option>
            <option value="inactivo">Inactivos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
      </div>

      <div className="u-table-card">
        {loading && <div className="u-table-state"><p>Cargando usuarios...</p></div>}
        {!loading && tableError && <div className="u-table-state"><p>{tableError}</p></div>}

        {!loading && !tableError && (
          <div style={{ padding: '0 14px 14px' }}>
            <table className="u-table">
              <thead>
                <tr><th>Usuario</th><th>Correo</th><th>Rol</th><th>Estado</th><th>Creado</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {visible.map((u) => {
                  const activo = u.estado !== false
                  return (
                    <tr key={u.id_usuario}>
                      <td><div className="u-user-cell"><div className="u-avatar">{getInitials(u.nombre)}</div><span className="u-user-name">{u.nombre}</span></div></td>
                      <td className="u-td-muted">{u.correo || 'N/A'}</td>
                      <td>{u.id_rol === 1 ? 'Administrador' : 'Operador'}</td>
                      <td>{activo ? 'Activo' : 'Inactivo'}</td>
                      <td className="u-td-muted">{u.fecha_creacion ? new Date(u.fecha_creacion).toLocaleDateString('es-CO') : 'N/A'}</td>
                      <td>
                        <div className="u-actions-group">
                          <button className="u-btn u-btn--outline u-btn--sm" onClick={() => openEdit(u)}>Editar</button>
                          <button className="u-btn u-btn--danger u-btn--sm" onClick={() => setConfirmUser(u)} disabled={!activo}>Deshabilitar</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && !tableError && pagination.totalPages > 1 && (
          <div className="u-pagination">
            <span className="u-pagination-info">{pagination.total} usuarios - pagina {page} de {pagination.totalPages}</span>
            <div className="u-pagination-controls">
              <button className="u-btn-page" onClick={() => setPage((v) => Math.max(1, v - 1))} disabled={page === 1}>{'<'}</button>
              {pageNumbers.map((n, i) => n === '...' ? <span key={i} className="u-page-sep">...</span> : <button key={n} className={`u-btn-page${page === n ? ' u-btn-page--active' : ''}`} onClick={() => setPage(n)}>{n}</button>)}
              <button className="u-btn-page" onClick={() => setPage((v) => Math.min(pagination.totalPages, v + 1))} disabled={page === pagination.totalPages}>{'>'}</button>
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="u-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="u-modal">
            <div className="u-modal__header">
              <h3 className="u-modal__title">{editing ? 'Editar usuario' : 'Nuevo usuario'}</h3>
              <button className="u-modal__close" onClick={() => setModalOpen(false)} type="button">X</button>
            </div>
            <form onSubmit={handleSave}>
              <div className="u-modal__body">
                <div className="u-form-grid">
                  <div className="u-form-field"><label>Nombre</label><input value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} /></div>
                  <div className="u-form-field"><label>Correo</label><input value={form.correo} onChange={(e) => setForm((p) => ({ ...p, correo: e.target.value }))} disabled={!!editing} /></div>
                  <div className="u-form-field"><label>Contrasena {editing ? '(opcional)' : ''}</label><input type="password" value={form.contrasena} onChange={(e) => setForm((p) => ({ ...p, contrasena: e.target.value }))} /></div>
                  <div className="u-form-field"><label>Rol</label><select value={form.id_rol} onChange={(e) => setForm((p) => ({ ...p, id_rol: Number(e.target.value) }))}><option value={1}>Administrador</option><option value={2}>Operador</option></select></div>
                  <div className="u-form-field"><label>Estado</label><select value={form.estado} onChange={(e) => setForm((p) => ({ ...p, estado: e.target.value }))}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></div>
                  {formError && <div className="u-form-error-banner">{formError}</div>}
                </div>
              </div>
              <div className="u-modal__footer">
                <button type="button" className="u-btn u-btn--ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
                <button type="submit" className="u-btn u-btn--primary" disabled={formLoading}>{formLoading ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmUser && (
        <div className="u-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setConfirmUser(null) }}>
          <div className="u-modal u-confirm-modal">
            <div className="u-confirm-body">
              <h3 className="u-confirm-title">Deshabilitar usuario</h3>
              <p className="u-confirm-text">Vas a deshabilitar a <strong>{confirmUser.nombre}</strong>.</p>
            </div>
            <div className="u-confirm-footer">
              <button className="u-btn u-btn--ghost" onClick={() => setConfirmUser(null)}>Cancelar</button>
              <button className="u-btn u-btn--danger-solid" onClick={handleDisable} disabled={confirmLoading}>{confirmLoading ? 'Procesando...' : 'Deshabilitar'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
