import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  createProducto,
  deleteProducto,
  getCategoriasActivas,
  getProductoById,
  getProductos,
  getUnidadesMedida,
  updateProducto,
} from '../../api/products.js'
import './products.css'

const EMPTY_FORM = {
  nombre: '',
  codigo_barras: '',
  id_categoria: '',
  id_unidad: '',
  permite_fraccion: 'false',
  precio_compra: '',
  precio_venta: '',
  stock_inicial: '',
  stock_minimo: '',
  stock_maximo: '',
  fecha_vencimiento: '',
  descripcion: '',
  estado: 'true',
}

function formatCurrency(value) {
  const n = Number(value)
  if (Number.isNaN(n)) return 'N/A'
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatUnidad(unidad) {
  if (!unidad) return 'N/A'
  if (unidad.abreviatura) return `${unidad.nombre} (${unidad.abreviatura})`
  return unidad.nombre || 'N/A'
}

function ProductDetailModal({ open, product, onClose }) {
  if (!open || !product) return null

  const rows = [
    ['Nombre', product.nombre || 'N/A'],
    ['Codigo de barras', product.codigo_barras ?? product.codigo_barras_unico ?? 'N/A'],
    ['Categoria', product.categoria || product.nombre_categoria || 'N/A'],
    ['Unidad', formatUnidad(product.unidad)],
    ['Permite fraccion', product.permite_fraccion ? 'Si' : 'No'],
    ['Precio de compra', product.precio_compra != null ? formatCurrency(product.precio_compra) : 'N/A'],
    ['Precio de venta', product.precio_venta != null ? formatCurrency(product.precio_venta) : 'N/A'],
    ['Stock actual', product.stock_actual ?? 'N/A'],
    ['Stock minimo', product.stock_minimo ?? 'N/A'],
    ['Stock maximo', product.stock_maximo ?? 'N/A'],
    ['Fecha de vencimiento', (product.fecha_vencimiento || '').toString().slice(0, 10) || 'N/A'],
    ['Descripcion', product.descripcion || 'N/A'],
    ['Estado', product.estado === false || product.estado === 'inactivo' ? 'Inactivo' : 'Activo'],
  ]

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal modal--wide">
        <div className="modal__header">
          <h3 className="modal__title">Detalle del producto</h3>
          <button className="btn-icon-only" onClick={onClose} type="button">X</button>
        </div>
        <div className="modal__body">
          <dl className="prod-detail-list">
            {rows.map(([label, value]) => (
              <div key={label} className="prod-detail-row">
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}

export default function ProductsPage() {
  const { user } = useAuth()
  const isAdmin = user?.rol === 'Administrador'

  const [productos, setProductos] = useState([])
  const [categorias, setCategorias] = useState([])
  const [unidades, setUnidades] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1, size: 10 })

  const [viewingProduct, setViewingProduct] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')
  const [formLoading, setFormLoading] = useState(false)
  const [disableProduct, setDisableProduct] = useState(null)

  useEffect(() => {
    getCategoriasActivas()
      .then((data) => setCategorias(Array.isArray(data) ? data : (data?.categorias ?? data?.data?.categorias ?? [])))
      .catch(() => {})

    getUnidadesMedida()
      .then((data) => {
        const payload = data?.data ?? data
        setUnidades(payload?.unidades ?? [])
      })
      .catch(() => {
        setUnidades([])
      })
  }, [])

  const cargar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getProductos({
        nombre: /^[0-9]+$/.test(searchQuery.trim()) ? undefined : (searchQuery || undefined),
        codigo: /^[0-9]+$/.test(searchQuery.trim()) ? (searchQuery || undefined) : undefined,
        id_categoria: filterCat || undefined,
        page,
        size: 10,
      })
      const payload = data?.data ?? data
      setProductos(payload?.productos ?? payload?.items ?? [])
      setPagination({
        total: payload?.total ?? 0,
        totalPages: payload?.totalPages ?? 1,
        size: payload?.size ?? 10,
      })
    } catch (err) {
      setError(err.message || 'No fue posible cargar los productos.')
      setProductos([])
    } finally {
      setLoading(false)
    }
  }, [searchQuery, filterCat, page])

  useEffect(() => { cargar() }, [cargar])

  const pageNumbers = useMemo(() => {
    const t = pagination.totalPages
    if (t <= 6) return Array.from({ length: t }, (_, i) => i + 1)
    if (page <= 3) return [1, 2, 3, 4, '...', t]
    if (page >= t - 2) return [1, '...', t - 3, t - 2, t - 1, t]
    return [1, '...', page - 1, page, page + 1, '...', t]
  }, [page, pagination.totalPages])

  async function handleView(product) {
    try {
      const data = await getProductoById(product.id_producto)
      const payload = data?.data ?? data
      setViewingProduct(payload?.producto ?? payload)
    } catch {
      setViewingProduct(product)
    }
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(product) {
    setEditing(product)
    setForm({
      nombre: product.nombre || '',
      codigo_barras: product.codigo_barras || '',
      id_categoria: String(product.id_categoria || ''),
      id_unidad: product.id_unidad ? String(product.id_unidad) : '',
      permite_fraccion: product.permite_fraccion ? 'true' : 'false',
      precio_compra: String(product.precio_compra ?? ''),
      precio_venta: String(product.precio_venta ?? ''),
      stock_inicial: '',
      stock_minimo: String(product.stock_minimo ?? ''),
      stock_maximo: String(product.stock_maximo ?? ''),
      fecha_vencimiento: (product.fecha_vencimiento || '').toString().slice(0, 10),
      descripcion: product.descripcion || '',
      estado: product.estado === false ? 'false' : 'true',
    })
    setFormError('')
    setModalOpen(true)
  }

  async function saveForm(e) {
    e.preventDefault()
    if (!form.nombre.trim()) return setFormError('El nombre es obligatorio.')
    if (
      !editing &&
      (!form.codigo_barras.trim() || !form.id_categoria || form.precio_compra === '' || form.precio_venta === '' || form.stock_inicial === '')
    ) {
      return setFormError('Completa todos los campos requeridos.')
    }

    setFormLoading(true)
    setFormError('')
    try {
      const payload = {
        nombre: form.nombre.trim(),
        id_categoria: Number(form.id_categoria || editing?.id_categoria),
        id_unidad: form.id_unidad ? Number(form.id_unidad) : null,
        permite_fraccion: form.permite_fraccion === 'true',
        precio_compra: form.precio_compra === '' ? undefined : Number(form.precio_compra),
        precio_venta: form.precio_venta === '' ? undefined : Number(form.precio_venta),
        stock_minimo: form.stock_minimo === '' ? undefined : Number(form.stock_minimo),
        stock_maximo: form.stock_maximo === '' ? undefined : Number(form.stock_maximo),
        fecha_vencimiento: form.fecha_vencimiento || null,
        descripcion: form.descripcion || null,
        estado: form.estado === 'true',
      }

      if (editing) {
        await updateProducto(editing.id_producto, payload)
      } else {
        await createProducto({
          ...payload,
          codigo_barras: form.codigo_barras.trim(),
          precio_compra: Number(form.precio_compra),
          precio_venta: Number(form.precio_venta),
          stock_inicial: Number(form.stock_inicial),
          fecha_vencimiento: form.fecha_vencimiento || undefined,
          descripcion: form.descripcion || undefined,
        })
      }

      setModalOpen(false)
      cargar()
    } catch (err) {
      setFormError(err.message || 'No fue posible guardar el producto.')
    } finally {
      setFormLoading(false)
    }
  }

  async function handleDisable() {
    if (!disableProduct) return
    try {
      await deleteProducto(disableProduct.id_producto)
      setDisableProduct(null)
      cargar()
    } catch (err) {
      setError(err.message || 'No fue posible deshabilitar el producto.')
    }
  }

  return (
    <div className="prod-page">
      <div className="prod-page__header">
        <div className="prod-page__heading">
          <h2 className="prod-page__title">Gestion de productos</h2>
          <p className="prod-page__subtitle">Administra el catalogo de productos del inventario</p>
        </div>
        <button className="btn btn--primary" onClick={openCreate}>Nuevo producto</button>
      </div>

      <div className="filter-row">
        <div className="search-wrap">
          <input
            type="text"
            className="search-input"
            placeholder="Buscar por nombre o codigo"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
          />
        </div>
        <div className="filter-bar">
          <span className="filter-bar__label">Categoria:</span>
          <select className="filter-select" value={filterCat} onChange={(e) => { setFilterCat(e.target.value); setPage(1) }}>
            <option value="">Todas</option>
            {categorias.map((c) => <option key={c.id || c.id_categoria} value={c.id || c.id_categoria}>{c.nombre_categoria}</option>)}
          </select>
        </div>
      </div>

      <div className="table-card">
        {error && <div className="alert-banner alert-banner--error">{error}</div>}
        <div className="table-wrapper">
          <table className="prod-table">
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Producto</th>
                <th>Categoria</th>
                <th>Unidad</th>
                <th>Precio venta</th>
                <th>Stock</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="table-empty">Cargando productos...</td></tr>}
              {!loading && productos.length === 0 && <tr><td colSpan={8} className="table-empty">No hay productos para mostrar.</td></tr>}
              {!loading && productos.map((p) => {
                const active = p.estado !== false && p.estado !== 'inactivo'
                return (
                  <tr key={p.id_producto}>
                    <td>{p.codigo_barras ?? p.codigo_barras_unico ?? 'N/A'}</td>
                    <td>{p.nombre || 'N/A'}</td>
                    <td>{p.categoria || p.nombre_categoria || 'N/A'}</td>
                    <td>{formatUnidad(p.unidad)}</td>
                    <td>{formatCurrency(p.precio_venta)}</td>
                    <td>{p.stock_actual ?? 'N/A'}</td>
                    <td>{active ? 'Activo' : 'Inactivo'}</td>
                    <td>
                      <div className="actions-group">
                        <button className="btn btn--ghost btn--sm" onClick={() => handleView(p)}>Ver</button>
                        <button className="btn btn--outline btn--sm" onClick={() => openEdit(p)}>Editar</button>
                        {isAdmin && <button className="btn btn--danger btn--sm" onClick={() => setDisableProduct(p)} disabled={!active}>Deshabilitar</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="pagination">
            <span className="pagination-info">{pagination.total} productos - pagina {page} de {pagination.totalPages}</span>
            <div className="pagination-controls">
              <button className="btn-page" onClick={() => setPage((v) => Math.max(1, v - 1))} disabled={page === 1}>{'<'}</button>
              {pageNumbers.map((n, i) => n === '...' ? <span key={i} className="page-sep">...</span> : <button key={n} className={`btn-page${page === n ? ' btn-page--active' : ''}`} onClick={() => setPage(n)}>{n}</button>)}
              <button className="btn-page" onClick={() => setPage((v) => Math.min(pagination.totalPages, v + 1))} disabled={page === pagination.totalPages}>{'>'}</button>
            </div>
          </div>
        )}
      </div>

      <ProductDetailModal open={!!viewingProduct} product={viewingProduct} onClose={() => setViewingProduct(null)} />

      {modalOpen && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false) }}>
          <div className="modal modal--wide">
            <div className="modal__header">
              <h3 className="modal__title">{editing ? 'Editar producto' : 'Nuevo producto'}</h3>
              <button className="btn-icon-only" onClick={() => setModalOpen(false)} type="button">X</button>
            </div>
            <form className="modal__body" onSubmit={saveForm}>
              <div className="form-grid">
                <div className="field field--full">
                  <label className="field__label">Nombre</label>
                  <input className="field__input" value={form.nombre} onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))} />
                </div>
                {!editing && (
                  <div className="field">
                    <label className="field__label">Codigo de barras</label>
                    <input className="field__input" value={form.codigo_barras} onChange={(e) => setForm((p) => ({ ...p, codigo_barras: e.target.value }))} />
                  </div>
                )}
                <div className="field">
                  <label className="field__label">Categoria</label>
                  <select className="field__select" value={form.id_categoria} onChange={(e) => setForm((p) => ({ ...p, id_categoria: e.target.value }))}>
                    <option value="">Selecciona</option>
                    {categorias.map((c) => <option key={c.id || c.id_categoria} value={c.id || c.id_categoria}>{c.nombre_categoria}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field__label">Unidad de medida</label>
                  <select className="field__select" value={form.id_unidad} onChange={(e) => setForm((p) => ({ ...p, id_unidad: e.target.value }))}>
                    <option value="">Sin unidad</option>
                    {unidades.map((u) => <option key={u.id_unidad} value={u.id_unidad}>{u.nombre} ({u.abreviatura})</option>)}
                  </select>
                </div>
                <div className="field">
                  <label className="field__label">Permite fraccion</label>
                  <select className="field__select" value={form.permite_fraccion} onChange={(e) => setForm((p) => ({ ...p, permite_fraccion: e.target.value }))}>
                    <option value="false">No</option>
                    <option value="true">Si</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field__label">Precio compra</label>
                  <input className="field__input" type="number" value={form.precio_compra} onChange={(e) => setForm((p) => ({ ...p, precio_compra: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field__label">Precio venta</label>
                  <input className="field__input" type="number" value={form.precio_venta} onChange={(e) => setForm((p) => ({ ...p, precio_venta: e.target.value }))} />
                </div>
                {!editing && (
                  <div className="field">
                    <label className="field__label">Stock inicial</label>
                    <input className="field__input" type="number" value={form.stock_inicial} onChange={(e) => setForm((p) => ({ ...p, stock_inicial: e.target.value }))} />
                  </div>
                )}
                <div className="field">
                  <label className="field__label">Stock minimo</label>
                  <input className="field__input" type="number" value={form.stock_minimo} onChange={(e) => setForm((p) => ({ ...p, stock_minimo: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field__label">Stock maximo</label>
                  <input className="field__input" type="number" value={form.stock_maximo} onChange={(e) => setForm((p) => ({ ...p, stock_maximo: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field__label">Fecha de vencimiento</label>
                  <input className="field__input" type="date" value={form.fecha_vencimiento} onChange={(e) => setForm((p) => ({ ...p, fecha_vencimiento: e.target.value }))} />
                </div>
                <div className="field field--full">
                  <label className="field__label">Descripcion</label>
                  <textarea className="field__textarea" value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} />
                </div>
                {formError && <div className="modal__alert modal__alert--error">{formError}</div>}
              </div>
            </form>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => setModalOpen(false)} type="button">Cancelar</button>
              <button className="btn btn--primary" onClick={saveForm} type="button" disabled={formLoading}>{formLoading ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {disableProduct && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setDisableProduct(null) }}>
          <div className="modal confirm-modal">
            <div className="confirm-modal__body">
              <h3 className="confirm-modal__title">Deshabilitar producto</h3>
              <p className="confirm-modal__text">Vas a deshabilitar <strong>{disableProduct.nombre}</strong>.</p>
            </div>
            <div className="confirm-modal__footer">
              <button className="btn btn--ghost" onClick={() => setDisableProduct(null)}>Cancelar</button>
              <button className="btn btn--danger-solid" onClick={handleDisable}>Deshabilitar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
