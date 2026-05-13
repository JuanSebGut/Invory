/**
 * ReportsPage.jsx Aaa Invory  |  MS-07 + MS-12 Frontend
 * Vista: Reportes de Inventario + ExportaciAAn
 *
 * Ruta:    /reportes
 * Roles:   Administrador y Operador (operador solo lectura, sin exportar)
 * Tipos:   movements | sales | stock
 *
 * MS-07 (Juan Sebastian): generaciAAn de reportes con filtros y tabla.
 * MS-12 (Juan Camilo):    descarga de archivos PDF / Excel mediante
 *                         POST /api/export, solo para Administrador.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  getReport,
  getReportFiltersCatalog,
  REPORT_TYPES,
  REPORT_FILTERS,
  MOVEMENT_FILTER_OPTIONS,
} from '../../api/reports.js'
import {
  exportarDatos,
  descargarBlob,
  buildExportPayload,
} from '../../api/exports.js'
import './reports.css'

const PERIODOS = [
  { value: 'custom', label: 'Personalizado' },
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
  { value: 'quarter', label: 'Trimestre actual' },
  { value: 'semester', label: 'Semestre actual' },
  { value: 'year', label: 'Este aAAo' },
]

function getPeriodDates(period) {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const today = fmt(now)

  switch (period) {
    case 'today':
      return { fecha_inicio: today, fecha_fin: today }
    case 'week': {
      const day = now.getDay() || 7
      const monday = new Date(now)
      monday.setDate(now.getDate() - day + 1)
      return { fecha_inicio: fmt(monday), fecha_fin: today }
    }
    case 'month':
      return { fecha_inicio: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, fecha_fin: today }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3)
      const qStart = new Date(now.getFullYear(), q * 3, 1)
      return { fecha_inicio: fmt(qStart), fecha_fin: today }
    }
    case 'semester': {
      const semStart = now.getMonth() < 6
        ? new Date(now.getFullYear(), 0, 1)
        : new Date(now.getFullYear(), 6, 1)
      return { fecha_inicio: fmt(semStart), fecha_fin: today }
    }
    case 'year':
      return { fecha_inicio: `${now.getFullYear()}-01-01`, fecha_fin: today }
    default:
      return null
  }
}

/* AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA
   AACONOS SVG
AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA */
const IconChart = () => (
  <svg className="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
)
const IconFilter = () => (
  <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
  </svg>
)
const IconClose = () => (
  <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)
const IconAlert = () => (
  <svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
)
const IconSpinner = () => (
  <svg className="spinner" viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" strokeWidth="3" stroke="currentColor" strokeOpacity="0.2"/>
    <path d="M12 2a10 10 0 0 1 10 10" strokeWidth="3" stroke="currentColor" strokeLinecap="round"/>
  </svg>
)
const IconEmpty = () => (
  <svg className="empty-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
    <line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/>
  </svg>
)
const IconDownload = () => (
  <svg className="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
)

/* AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA
   HOOK: TOASTS
AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA */
function useToast() {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})
  const add = useCallback((msg, type = 'info') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, msg, type }])
    timers.current[id] = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
      delete timers.current[id]
    }, 3500)
  }, [])
  return { toasts, addToast: add }
}

function ToastContainer({ toasts }) {
  if (!toasts.length) return null
  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          <span className={`toast-dot toast-dot--${t.type}`}/>
          {t.msg}
        </div>
      ))}
    </div>
  )
}

/* AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA
   TARJETAS DE RESUMEN
AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA */
function SummaryCards({ summary, reportType }) {
  if (!summary) return null
  const cards = reportType === 'sales'
    ? [
        { label: 'Ingresos totales', value: summary.total_value ?? 0, format: 'currency' },
        { label: 'Costo total', value: summary.total_cost ?? 0, format: 'currency' },
        {
          label: 'Ganancia neta',
          value: summary.total_profit ?? 0,
          format: 'currency',
          highlight: (summary.total_profit ?? 0) >= 0 ? 'positive' : 'negative',
        },
        { label: 'Margen de ganancia', value: summary.profit_margin ?? 0, format: 'percent' },
      ]
    : [
        { label: 'Registros', value: summary.total_items ?? 0, format: 'number' },
        { label: 'Cantidad total', value: summary.total_quantity ?? 0, format: 'number' },
        {
          label: reportType === 'stock' ? 'Valor inventario' : 'Valor total',
          value: summary.total_value ?? 0,
          format: 'currency',
        },
      ]
  return (
    <div className="summary-cards">
      {cards.map(card => (
        <div key={card.label} className={`summary-card ${card.highlight ? `summary-card--${card.highlight}` : ''}`}>
          <span className="summary-card__label">{card.label}</span>
          <span className="summary-card__value">
            {card.format === 'currency'
              ? `$${Number(card.value).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : card.format === 'percent'
                ? `${Number(card.value).toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
              : Number(card.value).toLocaleString('es-CO')}
          </span>
        </div>
      ))}
    </div>
  )
}

/* AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA
   TABLA DE RESULTADOS
AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA */
function BadgeTipo({ tipo }) {
  const label = tipo === 'entrada' ? 'Entrada' : tipo === 'salida' ? 'Salida' : tipo === 'ajuste' ? 'Ajuste' : tipo
  return (
    <span className={`badge-tipo badge-tipo--${tipo}`}>
      <span className="badge-dot"/>
      {label}
    </span>
  )
}

function ReportTable({ columns, items }) {
  if (!columns || !items) return null

  function renderCell(col, item) {
    const val = item[col.key]
    if (col.key === 'tipo') return <BadgeTipo tipo={val} />
    if (col.key === 'ganancia') {
      const amount = Number(val || 0)
      const className = amount > 0 ? 'cell-profit-positive' : amount < 0 ? 'cell-profit-negative' : 'cell-profit-zero'
      const prefix = amount > 0 ? '+$' : amount < 0 ? '-$' : '$'
      return <span className={className}>{`${prefix}${Math.abs(amount).toLocaleString('es-CO', { minimumFractionDigits: 2 })}`}</span>
    }
    if (['valor_total', 'precio_unitario', 'costo_unitario', 'costo_total', 'monto_pagado', 'vuelto'].includes(col.key)) {
      return val != null
        ? `$${Number(val).toLocaleString('es-CO', { minimumFractionDigits: 2 })}`
        : 'Aaa'
    }
    if (col.key === 'cantidad' || col.key === 'stock_anterior' || col.key === 'stock_posterior') {
      return val != null ? Number(val).toLocaleString('es-CO') : 'Aaa'
    }
    return val ?? 'Aaa'
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="report-table">
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="table-empty">
                <IconEmpty />
                <span>No hay datos para los filtros seleccionados.</span>
              </td>
            </tr>
          ) : (
            items.map((item, idx) => (
              <tr key={item.id_movimiento ?? item.id_producto ?? idx}>
                {columns.map(col => (
                  <td key={col.key} className={col.key === 'producto' ? 'td-bold' : ''}>
                    {renderCell(col, item)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

/* AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA
   COMPONENTE PRINCIPAL
AaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaAAaA */
export default function ReportsPage() {
  const { user } = useAuth()
  const isAdmin  = user?.rol === 'Administrador'

  const { toasts, addToast } = useToast()

  // Tipo de reporte seleccionado
  const [reportType, setReportType] = useState(REPORT_TYPES[0].value)

  // CatAAlogo para filtros
  const [categories, setCategories] = useState([])
  const [products, setProducts]     = useState([])
  const [catalogLoading, setCatalogLoading] = useState(true)

  // Filtros actuales
  const [filters, setFilters] = useState({
    fecha_inicio: '',
    fecha_fin: '',
    categoria: '',
    producto: '',
    tipo: '',
  })
  const [periodo, setPeriodo] = useState('custom')

  // Resultado del reporte
  const [reportData, setReportData] = useState(null)
  const [loading, setLoading]       = useState(false)
  const [generated, setGenerated]   = useState(false)
  const [bannerMsg, setBannerMsg]   = useState(null)

  // Estado de exportaciAAn: null cuando idle, 'EXCEL' | 'PDF' cuando descargando
  const [exportingFormat, setExportingFormat] = useState(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Cargar catAAlogo al montar
  useEffect(() => {
    async function loadCatalog() {
      setCatalogLoading(true)
      try {
        const { categories: cats, products: prods } = await getReportFiltersCatalog()
        setCategories(cats)
        setProducts(prods)
      } catch {
        // fallo silencioso Aaa los selects quedan vacAAos
      } finally {
        setCatalogLoading(false)
      }
    }
    loadCatalog()
  }, [])

  function handleReportTypeChange(type) {
    setReportType(type)
    setReportData(null)
    setGenerated(false)
    setBannerMsg(null)
    setFilters({ fecha_inicio: '', fecha_fin: '', categoria: '', producto: '', tipo: '' })
    setPeriodo('custom')
  }

  function handleFilterChange(e) {
    const { name, value } = e.target
    setFilters(prev => ({
      ...prev,
      [name]: value,
      ...(name === 'categoria' ? { producto: '' } : {}),
    }))
    setBannerMsg(null)
  }

  function handlePeriodoChange(e) {
    const value = e.target.value
    setPeriodo(value)
    if (value === 'custom') return
    const dates = getPeriodDates(value)
    if (!dates) return
    setFilters(prev => ({ ...prev, fecha_inicio: dates.fecha_inicio, fecha_fin: dates.fecha_fin }))
    setBannerMsg(null)
  }

  function handleClearFilters() {
    setFilters({ fecha_inicio: '', fecha_fin: '', categoria: '', producto: '', tipo: '' })
    setPeriodo('custom')
    setReportData(null)
    setGenerated(false)
    setBannerMsg(null)
  }

  async function handleGenerate() {
    setBannerMsg(null)
    setLoading(true)
    try {
      const data = await getReport(reportType, filters)
      setReportData(data)
      setGenerated(true)
    } catch (err) {
      setBannerMsg(err.message ?? 'No fue posible generar el reporte.')
      setReportData(null)
    } finally {
      setLoading(false)
    }
  }

  /* AaaAaa MS-12: ExportaciAAn al backend (solo Administrador) AaaAaaAaaAaaAaaAaaAaaAaaAaa */
  async function handleExportFormat(formato) {
    if (!reportData?.items?.length) {
      addToast('No hay datos para exportar.', 'error')
      return
    }
    setExportingFormat(formato)
    try {
      const payload = buildExportPayload({ reportType, filters, formato })
      const { blob, filename, total } = await exportarDatos(payload)
      descargarBlob(blob, filename)
      addToast(
        `Archivo ${formato} descargado AA ${total.toLocaleString('es-CO')} ${total === 1 ? 'registro' : 'registros'}.`,
        'success'
      )
    } catch (err) {
      if (err.code === 'EXPORT_DATA_NOT_FOUND' || err.status === 404) {
        addToast('No se encontraron datos con los filtros seleccionados.', 'error')
      } else if (err.code === 'EXPORT_LIMIT_EXCEEDED' || err.status === 413) {
        addToast('El volumen supera el lAAmite (100.000 registros). Aplica filtros mAAs especAAficos.', 'error')
      } else if (err.status === 403) {
        addToast('No tienes permisos para exportar datos.', 'error')
      } else {
        addToast(err.message ?? 'No fue posible exportar los datos.', 'error')
      }
    } finally {
      setExportingFormat(null)
    }
  }

  const supportedFilters = REPORT_FILTERS[reportType] ?? []
  const filteredProducts = filters.categoria
    ? products.filter(p => String(p.id_categoria) === String(filters.categoria))
    : products

  const hayDatos = (reportData?.items?.length ?? 0) > 0
  const showExportButtons = isAdmin && generated && hayDatos

  useEffect(() => {
    function onDown(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  return (
    <div className="rp-page">

      {/* Cabecera */}
      <div className="rp-page__header">
        <div className="rp-page__heading">
          <h2 className="rp-page__title">Reportes</h2>
          <p className="rp-page__subtitle">Genera y exporta reportes de movimientos, ventas y stock</p>
        </div>
      </div>

      <div className="rp-type-selector">
        <span className="rp-type-label">Tipo de reporte:</span>
        <div className="rp-type-dropdown" ref={dropdownRef}>
          <button type="button" className="rp-type-trigger" onClick={() => setDropdownOpen(v => !v)}>
            <span>{REPORT_TYPES.find(r => r.value === reportType)?.label}</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <polyline points={dropdownOpen ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
            </svg>
          </button>
          {dropdownOpen && (
            <div className="rp-type-menu">
              {REPORT_TYPES.map(rt => (
                <button key={rt.value} type="button" className={`rp-type-option ${reportType === rt.value ? 'active' : ''}`} onClick={() => { handleReportTypeChange(rt.value); setDropdownOpen(false) }}>
                  {rt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Panel de filtros */}
      <div className="rp-card">
        <div className="rp-card__header">
          <span className="rp-card__title">Filtros</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={handleClearFilters}>
            <IconClose />
            Limpiar
          </button>
        </div>

        <div className="rp-filters">
          {supportedFilters.includes('fecha_inicio') && (
            <div className="filter-field">
              <label className="filter-label">PerAAodo</label>
              <select
                className="filter-select"
                value={periodo}
                onChange={handlePeriodoChange}
              >
                {PERIODOS.map(period => (
                  <option key={period.value} value={period.value}>{period.label}</option>
                ))}
              </select>
            </div>
          )}
          {supportedFilters.includes('fecha_inicio') && (
            <div className="filter-field">
              <label className="filter-label">Fecha inicio</label>
              <input
                type="date"
                name="fecha_inicio"
                className="filter-input"
                value={filters.fecha_inicio}
                onChange={handleFilterChange}
                max={filters.fecha_fin || undefined}
                disabled={periodo !== 'custom'}
              />
            </div>
          )}
          {supportedFilters.includes('fecha_fin') && (
            <div className="filter-field">
              <label className="filter-label">Fecha fin</label>
              <input
                type="date"
                name="fecha_fin"
                className="filter-input"
                value={filters.fecha_fin}
                onChange={handleFilterChange}
                min={filters.fecha_inicio || undefined}
                disabled={periodo !== 'custom'}
              />
            </div>
          )}
          {supportedFilters.includes('categoria') && (
            <div className="filter-field">
              <label className="filter-label">CategorAAa</label>
              <select
                name="categoria"
                className="filter-select"
                value={filters.categoria}
                onChange={handleFilterChange}
                disabled={catalogLoading}
              >
                <option value="">Todas</option>
                {categories.map(c => (
                  <option key={`category-${c.id_categoria ?? c.nombre_categoria}`} value={c.id_categoria}>
                    {c.nombre_categoria}
                  </option>
                ))}
              </select>
            </div>
          )}
          {supportedFilters.includes('producto') && (
            <div className="filter-field">
              <label className="filter-label">Producto</label>
              <select
                name="producto"
                className="filter-select"
                value={filters.producto}
                onChange={handleFilterChange}
                disabled={catalogLoading}
              >
                <option value="">Todos</option>
                {filteredProducts.map(p => (
                  <option key={`product-${p.id_producto ?? p.nombre}`} value={p.id_producto}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
          {supportedFilters.includes('tipo') && (
            <div className="filter-field">
              <label className="filter-label">Tipo movimiento</label>
              <select
                name="tipo"
                className="filter-select"
                value={filters.tipo}
                onChange={handleFilterChange}
              >
                <option value="">Todos</option>
                {MOVEMENT_FILTER_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="rp-card__footer">
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? <><IconSpinner /> GenerandoAaA</> : <><IconFilter /> Generar reporte</>}
          </button>

          {/* MS-12: botones de descarga (solo Administrador) */}
          {showExportButtons && (
            <div className="rp-export-group">
              <span className="rp-export-label">Exportar:</span>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => handleExportFormat('EXCEL')}
                disabled={exportingFormat !== null}
                title="Descargar como Excel"
              >
                {exportingFormat === 'EXCEL' ? <IconSpinner /> : <IconDownload />}
                Excel
              </button>
              <button
                type="button"
                className="btn btn--outline btn--sm"
                onClick={() => handleExportFormat('PDF')}
                disabled={exportingFormat !== null}
                title="Descargar como PDF"
              >
                {exportingFormat === 'PDF' ? <IconSpinner /> : <IconDownload />}
                PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Banner error */}
      {bannerMsg && (
        <div className="alert-banner alert-banner--error" role="alert">
          <IconAlert />
          <span>{bannerMsg}</span>
          <button
            className="alert-banner__close"
            onClick={() => setBannerMsg(null)}
            type="button"
            aria-label="Cerrar"
          >
            <IconClose />
          </button>
        </div>
      )}

      {/* Resultados */}
      {loading && (
        <div className="rp-loading">
          <IconSpinner />
          <span>Generando reporteAaA</span>
        </div>
      )}

      {!loading && generated && reportData && (
        <>
          <SummaryCards summary={reportData.summary} reportType={reportType} />

          <div className="rp-card rp-card--table">
            <div className="rp-card__header">
              <span className="rp-card__title">
                {REPORT_TYPES.find(r => r.value === reportType)?.label}
              </span>
              <span className="rp-table-count">
                {reportData.items?.length ?? 0}{' '}
                {reportData.items?.length === 1 ? 'registro' : 'registros'}
              </span>
            </div>
            <ReportTable
              columns={reportData.columns}
              items={reportData.items}
            />
            {reportData.meta?.generatedAt && (
              <div className="rp-card__info">
                Generado el{' '}
                {new Date(reportData.meta.generatedAt).toLocaleString('es-CO', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </div>
            )}
          </div>
        </>
      )}

      {!loading && !generated && (
        <div className="rp-empty-state">
          <IconEmpty />
          <p>Selecciona los filtros y presiona <strong>Generar reporte</strong> para ver los resultados.</p>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
