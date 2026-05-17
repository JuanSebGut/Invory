import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import {
  createClient,
  getClientById,
  getClientFiados,
  getClients,
  toggleClientStatus,
  updateClient,
} from '../../api/clients'
import { createFiado, registerPago } from '../../api/fiados'
import './ClientsPage.css'

const EMPTY_CLIENT_FORM = {
  nombre: '',
  telefono: '',
  direccion: '',
  correo: '',
  documento: '',
}

const EMPTY_FIADO_FORM = {
  monto_total: '',
  fecha_pago_acordada: '',
  observaciones: '',
  id_factura: '',
}

const EMPTY_PAGO_FORM = {
  monto: '',
  observaciones: '',
}

function toCurrency(value) {
  return Number(value || 0).toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 2,
  })
}

function formatDate(value) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString('es-CO')
}

function normalizeClientsPayload(payload) {
  return {
    items: payload?.items ?? [],
    total: payload?.total ?? 0,
    totalPages: payload?.totalPages ?? 1,
  }
}

export default function ClientsPage() {
  const { user } = useAuth()
  const isAdmin = user?.rol === 'Administrador'
  const location = useLocation()

  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState('todos')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 })

  const [modalOpen, setModalOpen] = useState(false)
  const [editingClient, setEditingClient] = useState(null)
  const [clientForm, setClientForm] = useState(EMPTY_CLIENT_FORM)
  const [savingClient, setSavingClient] = useState(false)
  const [formError, setFormError] = useState('')

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailClient, setDetailClient] = useState(null)
  const [detailFiados, setDetailFiados] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const [fiadoModalOpen, setFiadoModalOpen] = useState(false)
  const [fiadoForm, setFiadoForm] = useState(EMPTY_FIADO_FORM)
  const [fiadoSaving, setFiadoSaving] = useState(false)
  const [fiadoError, setFiadoError] = useState('')

  const [pagoModalOpen, setPagoModalOpen] = useState(false)
  const [selectedFiado, setSelectedFiado] = useState(null)
  const [pagoForm, setPagoForm] = useState(EMPTY_PAGO_FORM)
  const [pagoSaving, setPagoSaving] = useState(false)
  const [pagoError, setPagoError] = useState('')

  const fetchClients = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getClients({
        page,
        size: 10,
        q: search || undefined,
        estado: estado === 'todos' ? undefined : estado === 'activo',
      })
      const normalized = normalizeClientsPayload(data)
      setClients(normalized.items)
      setPagination({ total: normalized.total, totalPages: normalized.totalPages })
    } catch (err) {
      setError(err.message || 'No fue posible cargar los clientes.')
      setClients([])
      setPagination({ total: 0, totalPages: 1 })
    } finally {
      setLoading(false)
    }
  }, [page, search, estado])

  useEffect(() => { fetchClients() }, [fetchClients])

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('clienteId')
    if (!id) return
    const target = clients.find((client) => String(client.id_cliente) === String(id))
    if (target) {
      void openDetail(target.id_cliente)
    }
  }, [location.search, clients])

  const pageNumbers = useMemo(() => {
    const total = pagination.totalPages
    if (total <= 6) return Array.from({ length: total }, (_, index) => index + 1)
    if (page <= 3) return [1, 2, 3, 4, '...', total]
    if (page >= total - 2) return [1, '...', total - 3, total - 2, total - 1, total]
    return [1, '...', page - 1, page, page + 1, '...', total]
  }, [page, pagination.totalPages])

  function openCreateModal() {
    setEditingClient(null)
    setClientForm(EMPTY_CLIENT_FORM)
    setFormError('')
    setModalOpen(true)
  }

  function openEditModal(client) {
    setEditingClient(client)
    setClientForm({
      nombre: client.nombre || '',
      telefono: client.telefono || '',
      direccion: client.direccion || '',
      correo: client.correo || '',
      documento: client.documento || '',
    })
    setFormError('')
    setModalOpen(true)
  }

  async function submitClientForm(event) {
    event.preventDefault()
    
    const nombre = clientForm.nombre?.trim() || ''
    const documento = clientForm.documento?.trim() || ''
    const telefono = clientForm.telefono?.trim() || ''
    const correo = clientForm.correo?.trim() || ''

    if (!nombre) {
      setFormError('El nombre es obligatorio.')
      return
    }
    
    if (nombre.length < 3) {
      setFormError('El nombre debe tener al menos 3 caracteres.')
      return
    }

    // Opcional, pero si se provee, debe ser válido (alfanumérico y guiones)
    if (documento && !/^[a-zA-Z0-9-]{4,20}$/.test(documento)) {
      setFormError('El documento ingresado no es válido (use entre 4 y 20 caracteres, sin espacios).')
      return
    }

    // Teléfono opcional, pero solo debe contener números
    if (telefono && !/^[0-9]{7,15}$/.test(telefono)) {
      setFormError('El teléfono ingresado no es válido (solo se permiten números, entre 7 y 15 dígitos).')
      return
    }

    // Correo opcional, pero con estructura válida
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
      setFormError('El correo electrónico no es válido.')
      return
    }

    setSavingClient(true)
    setFormError('')
    try {
      const payload = {
        nombre: clientForm.nombre.trim(),
        telefono: clientForm.telefono.trim() || null,
        direccion: clientForm.direccion.trim() || null,
        correo: clientForm.correo.trim() || null,
        documento: clientForm.documento.trim() || null,
      }

      if (editingClient) {
        await updateClient(editingClient.id_cliente, payload)
      } else {
        await createClient(payload)
      }

      setModalOpen(false)
      await fetchClients()
    } catch (err) {
      setFormError(err.message || 'No fue posible guardar el cliente.')
    } finally {
      setSavingClient(false)
    }
  }

  async function onToggleStatus(client) {
    const nextEstado = client.estado === false
    try {
      await toggleClientStatus(client.id_cliente, nextEstado)
      await fetchClients()
      if (detailClient?.id_cliente === client.id_cliente) {
        await openDetail(client.id_cliente)
      }
    } catch (err) {
      setError(err.message || 'No fue posible actualizar el estado del cliente.')
    }
  }

  async function openDetail(idCliente) {
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailError('')

    try {
      const [client, fiados] = await Promise.all([
        getClientById(idCliente),
        getClientFiados(idCliente).catch((err) => {
          if (err.status === 403) {
            return { items: [], _permissionError: true }
          }
          throw err
        }),
      ])

      setDetailClient(client)
      if (Array.isArray(fiados)) {
        setDetailFiados(fiados)
      } else {
        setDetailFiados(fiados?.items ?? [])
        if (fiados?._permissionError) {
          setDetailError('No tienes permisos para ver el historial completo de fiados.')
        }
      }
    } catch (err) {
      setDetailClient(null)
      setDetailFiados([])
      setDetailError(err.message || 'No fue posible cargar el detalle del cliente.')
    } finally {
      setDetailLoading(false)
    }
  }

  function openFiadoModal() {
    setFiadoForm(EMPTY_FIADO_FORM)
    setFiadoError('')
    setFiadoModalOpen(true)
  }

  async function submitFiado(event) {
    event.preventDefault()
    const monto = Number(fiadoForm.monto_total)
    if (!Number.isFinite(monto) || monto <= 0) {
      setFiadoError('El monto total debe ser mayor a cero.')
      return
    }
    if (!fiadoForm.fecha_pago_acordada) {
      setFiadoError('La fecha de pago acordada es obligatoria.')
      return
    }

    setFiadoSaving(true)
    setFiadoError('')
    try {
      await createFiado(detailClient.id_cliente, {
        id_usuario: user.id_usuario,
        monto_total: monto,
        fecha_pago_acordada: fiadoForm.fecha_pago_acordada,
        observaciones: fiadoForm.observaciones.trim() || null,
        id_factura: fiadoForm.id_factura ? Number(fiadoForm.id_factura) : null,
      })

      setFiadoModalOpen(false)
      await openDetail(detailClient.id_cliente)
    } catch (err) {
      setFiadoError(err.message || 'No fue posible registrar el fiado.')
    } finally {
      setFiadoSaving(false)
    }
  }

  function openPagoModal(fiado) {
    setSelectedFiado(fiado)
    setPagoForm(EMPTY_PAGO_FORM)
    setPagoError('')
    setPagoModalOpen(true)
  }

  async function submitPago(event) {
    event.preventDefault()
    const monto = Number(pagoForm.monto)
    if (!Number.isFinite(monto) || monto <= 0) {
      setPagoError('El monto debe ser mayor a cero.')
      return
    }

    setPagoSaving(true)
    setPagoError('')
    try {
      await registerPago(selectedFiado.id_fiado, {
        id_usuario: user.id_usuario,
        monto,
        observaciones: pagoForm.observaciones.trim() || null,
      })

      setPagoModalOpen(false)
      await openDetail(detailClient.id_cliente)
    } catch (err) {
      setPagoError(err.message || 'No fue posible registrar el abono.')
    } finally {
      setPagoSaving(false)
    }
  }

  const saldoPendiente = useMemo(() => {
    if (detailClient?.saldo_total_pendiente !== undefined && detailClient?.saldo_total_pendiente !== null) {
      return Number(detailClient.saldo_total_pendiente)
    }

    return detailFiados.reduce((total, fiado) => total + Number(fiado.saldo_pendiente || 0), 0)
  }, [detailClient, detailFiados])

  return (
    <div className="clients-page">
      <div className="clients-header">
        <div>
          <h2>Clientes</h2>
          <p>Gestiona clientes, fiados y pagos pendientes.</p>
        </div>
        <button className="clients-btn clients-btn--primary" onClick={openCreateModal} type="button">
          Nuevo cliente
        </button>
      </div>

      <div className="clients-toolbar">
        <input
          className="clients-input"
          type="text"
          placeholder="Buscar por nombre o documento"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1) }}
        />

        <select
          className="clients-select"
          value={estado}
          onChange={(event) => { setEstado(event.target.value); setPage(1) }}
        >
          <option value="todos">Todos</option>
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
        </select>
      </div>

      <div className="clients-table-card">
        {error && <div className="clients-error-banner">{error}</div>}
        <table className="clients-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Documento</th>
              <th>Teléfono</th>
              <th>Estado</th>
              <th>Saldo pendiente</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="clients-empty">Cargando clientes...</td>
              </tr>
            )}

            {!loading && clients.length === 0 && (
              <tr>
                <td colSpan={6} className="clients-empty">No se encontraron clientes.</td>
              </tr>
            )}

            {!loading && clients.map((client) => {
              const activo = client.estado !== false
              return (
                <tr key={client.id_cliente}>
                  <td>{client.nombre}</td>
                  <td>{client.documento || 'N/A'}</td>
                  <td>{client.telefono || 'N/A'}</td>
                  <td>
                    <span className={`clients-badge ${activo ? 'is-active' : 'is-inactive'}`}>
                      {activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>{toCurrency(client.saldo_total_pendiente || 0)}</td>
                  <td>
                    <div className="clients-actions">
                      <button className="clients-btn clients-btn--ghost" onClick={() => openDetail(client.id_cliente)} type="button">
                        Ver detalle
                      </button>
                      <button className="clients-btn clients-btn--ghost" onClick={() => openEditModal(client)} type="button">
                        Editar
                      </button>
                      <button className="clients-btn clients-btn--outline" onClick={() => onToggleStatus(client)} type="button">
                        {activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {!loading && pagination.totalPages > 1 && (
          <div className="clients-pagination">
            <span>{pagination.total} clientes · página {page} de {pagination.totalPages}</span>
            <div className="clients-pagination-controls">
              <button className="clients-page-btn" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} type="button">{'<'}</button>
              {pageNumbers.map((item, index) => (
                item === '...'
                  ? <span key={`sep-${index}`}>...</span>
                  : (
                    <button
                      key={`page-${item}`}
                      className={`clients-page-btn ${page === item ? 'is-current' : ''}`}
                      onClick={() => setPage(Number(item))}
                      type="button"
                    >
                      {item}
                    </button>
                  )
              ))}
              <button className="clients-page-btn" onClick={() => setPage((value) => Math.min(pagination.totalPages, value + 1))} disabled={page === pagination.totalPages} type="button">{'>'}</button>
            </div>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="clients-modal-backdrop" onClick={(event) => event.target === event.currentTarget && setModalOpen(false)}>
          <div className="clients-modal">
            <h3>{editingClient ? 'Editar cliente' : 'Nuevo cliente'}</h3>
            <form onSubmit={submitClientForm}>
              <div className="clients-form-grid">
                <label>
                  Nombre (Obligatorio)
                  <input
                    className="clients-input"
                    value={clientForm.nombre}
                    onChange={(event) => setClientForm((state) => ({ ...state, nombre: event.target.value }))}
                  />
                </label>
                <label>
                  Teléfono (Opcional)
                  <input
                    className="clients-input"
                    type="tel"
                    value={clientForm.telefono}
                    onChange={(event) => {
                      const val = event.target.value.replace(/[^0-9]/g, '')
                      setClientForm((state) => ({ ...state, telefono: val }))
                    }}
                  />
                </label>
                <label>
                  Dirección (Opcional)
                  <textarea
                    className="clients-textarea"
                    value={clientForm.direccion}
                    onChange={(event) => setClientForm((state) => ({ ...state, direccion: event.target.value }))}
                  />
                </label>
                <label>
                  Correo electrónico (Opcional)
                  <input
                    className="clients-input"
                    type="email"
                    value={clientForm.correo}
                    onChange={(event) => setClientForm((state) => ({ ...state, correo: event.target.value }))}
                  />
                </label>
                <label>
                  Documento / NIT (Opcional)
                  <input
                    className="clients-input"
                    value={clientForm.documento}
                    onChange={(event) => setClientForm((state) => ({ ...state, documento: event.target.value }))}
                  />
                </label>
              </div>

              {formError && <p className="clients-form-error">{formError}</p>}

              <div className="clients-modal-actions">
                <button type="button" className="clients-btn clients-btn--ghost" onClick={() => setModalOpen(false)}>Cancelar</button>
                <button type="submit" className="clients-btn clients-btn--primary" disabled={savingClient}>
                  {savingClient ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {detailOpen && (
        <div className="clients-modal-backdrop" onClick={(event) => event.target === event.currentTarget && setDetailOpen(false)}>
          <div className="clients-modal clients-modal--xl">
            <div className="clients-detail-header">
              <div>
                <h3>{detailClient?.nombre || 'Detalle del cliente'}</h3>
                <p>Saldo pendiente total: <strong>{toCurrency(saldoPendiente)}</strong></p>
              </div>
              <div className="clients-actions">
                <button type="button" className="clients-btn clients-btn--ghost" onClick={() => setDetailOpen(false)}>Cerrar</button>
                <button type="button" className="clients-btn clients-btn--primary" onClick={openFiadoModal}>Registrar fiado</button>
              </div>
            </div>

            {detailLoading && <p className="clients-empty">Cargando historial...</p>}
            {!detailLoading && detailError && <div className="clients-error-banner">{detailError}</div>}

            {!detailLoading && !detailError && (
              <table className="clients-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Estado</th>
                    <th>Monto total</th>
                    <th>Monto pagado</th>
                    <th>Saldo pendiente</th>
                    <th>Fecha acordada</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {detailFiados.length === 0 && (
                    <tr>
                      <td colSpan={7} className="clients-empty">Este cliente no tiene fiados registrados.</td>
                    </tr>
                  )}

                  {detailFiados.map((fiado) => (
                    <tr key={fiado.id_fiado}>
                      <td>#{fiado.id_fiado}</td>
                      <td>
                        <span className={`clients-badge fiado-${fiado.estado || 'pendiente'}`}>
                          {fiado.estado || 'pendiente'}
                        </span>
                      </td>
                      <td>{toCurrency(fiado.monto_total)}</td>
                      <td>{toCurrency(fiado.monto_pagado)}</td>
                      <td>{toCurrency(fiado.saldo_pendiente)}</td>
                      <td>{formatDate(fiado.fecha_pago_acordada)}</td>
                      <td>
                        {fiado.estado !== 'pagado' && Number(fiado.saldo_pendiente) > 0 ? (
                          <button className="clients-btn clients-btn--outline" type="button" onClick={() => openPagoModal(fiado)}>
                            Registrar pago
                          </button>
                        ) : (
                          <span className="clients-badge fiado-pagado">Pagado</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {fiadoModalOpen && (
        <div className="clients-modal-backdrop" onClick={(event) => event.target === event.currentTarget && setFiadoModalOpen(false)}>
          <div className="clients-modal">
            <h3>Registrar fiado</h3>
            <form onSubmit={submitFiado}>
              <div className="clients-form-grid">
                <label>
                  Monto total *
                  <input
                    className="clients-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={fiadoForm.monto_total}
                    onChange={(event) => setFiadoForm((state) => ({ ...state, monto_total: event.target.value }))}
                  />
                </label>
                <label>
                  Fecha pago acordada *
                  <input
                    className="clients-input"
                    type="date"
                    value={fiadoForm.fecha_pago_acordada}
                    onChange={(event) => setFiadoForm((state) => ({ ...state, fecha_pago_acordada: event.target.value }))}
                  />
                </label>
                <label>
                  Vincular factura (opcional)
                  <input
                    className="clients-input"
                    type="number"
                    min="1"
                    value={fiadoForm.id_factura}
                    onChange={(event) => setFiadoForm((state) => ({ ...state, id_factura: event.target.value }))}
                  />
                </label>
                <label>
                  Observaciones
                  <textarea
                    className="clients-textarea"
                    value={fiadoForm.observaciones}
                    onChange={(event) => setFiadoForm((state) => ({ ...state, observaciones: event.target.value }))}
                  />
                </label>
              </div>

              {fiadoError && <p className="clients-form-error">{fiadoError}</p>}

              <div className="clients-modal-actions">
                <button type="button" className="clients-btn clients-btn--ghost" onClick={() => setFiadoModalOpen(false)}>Cancelar</button>
                <button type="submit" className="clients-btn clients-btn--primary" disabled={fiadoSaving}>
                  {fiadoSaving ? 'Guardando...' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pagoModalOpen && (
        <div className="clients-modal-backdrop" onClick={(event) => event.target === event.currentTarget && setPagoModalOpen(false)}>
          <div className="clients-modal">
            <h3>Registrar abono #{selectedFiado?.id_fiado}</h3>
            <form onSubmit={submitPago}>
              <div className="clients-form-grid">
                <label>
                  Monto *
                  <input
                    className="clients-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={pagoForm.monto}
                    onChange={(event) => setPagoForm((state) => ({ ...state, monto: event.target.value }))}
                  />
                </label>
                <label>
                  Observaciones
                  <textarea
                    className="clients-textarea"
                    value={pagoForm.observaciones}
                    onChange={(event) => setPagoForm((state) => ({ ...state, observaciones: event.target.value }))}
                  />
                </label>
              </div>

              {pagoError && <p className="clients-form-error">{pagoError}</p>}

              <div className="clients-modal-actions">
                <button type="button" className="clients-btn clients-btn--ghost" onClick={() => setPagoModalOpen(false)}>Cancelar</button>
                <button type="submit" className="clients-btn clients-btn--primary" disabled={pagoSaving}>
                  {pagoSaving ? 'Guardando...' : 'Registrar pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}