import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  MOVEMENT_FILTER_OPTIONS,
  REPORT_TYPES,
  getReport,
  getReportFiltersCatalog,
} from '../../api/reports.js'
import {
  buildExportPayload,
  descargarBlob,
  exportarDatos,
} from '../../api/exports.js'
import './reports.css'

const DEFAULT_FILTERS = {
  fecha_inicio: '',
  fecha_fin: '',
  categoria: '',
  producto: '',
  tipo: '',
  fecha_desde: '',
  fecha_hasta: '',
  periodo_actual_desde: '',
  periodo_actual_hasta: '',
  periodo_anterior_desde: '',
  periodo_anterior_hasta: '',
  dias: 30,
}

function toCurrency(value) {
  return Number(value || 0).toLocaleString('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 2,
  })
}

function toNumber(value) {
  return Number(value || 0).toLocaleString('es-CO', {
    maximumFractionDigits: 3,
  })
}

function buildTable(reportType, payload) {
  if (!payload) return { columns: [], rows: [] }

  if (reportType === 'profits') {
    return {
      columns: [
        { key: 'total_ingresos', label: 'Total ingresos' },
        { key: 'costo', label: 'Costo' },
        { key: 'ganancia_bruta', label: 'Ganancia bruta' },
        { key: 'margen_porcentual', label: 'Margen %' },
      ],
      rows: [
        {
          total_ingresos: payload.total_ingresos,
          costo: payload.costo,
          ganancia_bruta: payload.ganancia_bruta,
          margen_porcentual: `${Number(payload.margen_porcentual || 0).toFixed(2)}%`,
        },
      ],
    }
  }

  if (reportType === 'comparative') {
    const indicadores = payload.indicadores || {}
    return {
      columns: [
        { key: 'indicador', label: 'Indicador' },
        { key: 'periodo_actual', label: 'Periodo actual' },
        { key: 'periodo_anterior', label: 'Periodo anterior' },
        { key: 'variacion_porcentual', label: 'Variacion %' },
      ],
      rows: Object.entries(indicadores).map(([key, value]) => ({
        indicador: key.replaceAll('_', ' '),
        periodo_actual: value?.periodo_actual,
        periodo_anterior: value?.periodo_anterior,
        variacion_porcentual: `${Number(value?.variacion_porcentual || 0).toFixed(2)}%`,
      })),
    }
  }

  if (reportType === 'no-movement') {
    return {
      columns: [
        { key: 'id_producto', label: 'ID producto' },
        { key: 'nombre', label: 'Producto' },
        { key: 'stock_actual', label: 'Stock actual' },
        { key: 'ultima_fecha_movimiento', label: 'Ultimo movimiento' },
      ],
      rows: payload.items || [],
    }
  }

  if (reportType === 'by-category') {
    return {
      columns: [
        { key: 'nombre_categoria', label: 'Categoria' },
        { key: 'cantidad_productos', label: 'Productos' },
        { key: 'valor_total_inventario', label: 'Valor inventario' },
        { key: 'cantidad_movimientos_ultimos_30_dias', label: 'Movimientos (30 dias)' },
      ],
      rows: payload.items || [],
    }
  }

  return {
    columns: payload.columns || [],
    rows: payload.items || [],
  }
}

function formatCell(key, value) {
  if (value === null || value === undefined || value === '') return 'N/A'
  if (
    [
      'valor_total',
      'precio_unitario',
      'costo_unitario',
      'costo_total',
      'monto_pagado',
      'vuelto',
      'costo',
      'ganancia_bruta',
      'total_ingresos',
      'valor_total_inventario',
    ].includes(key)
  ) {
    return toCurrency(value)
  }
  if (
    [
      'cantidad',
      'stock_anterior',
      'stock_posterior',
      'stock_actual',
      'cantidad_productos',
      'cantidad_movimientos_ultimos_30_dias',
      'periodo_actual',
      'periodo_anterior',
    ].includes(key)
  ) {
    return toNumber(value)
  }
  return String(value)
}

export default function ReportsPage() {
  const { user } = useAuth()
  const isAdmin = user?.rol === 'Administrador'

  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(true)

  const [reportType, setReportType] = useState('movements')
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [exporting, setExporting] = useState('')

  const allowedTypes = useMemo(() => {
    if (isAdmin) return REPORT_TYPES
    // Empleado solo puede ver reportes operacionales, no financieros sensibles
    return REPORT_TYPES.filter((t) => !['profits', 'comparative'].includes(t.value))
  }, [isAdmin])

  const filteredProducts = useMemo(() => {
    if (!filters.categoria) return products
    return products.filter((product) => String(product.id_categoria) === String(filters.categoria))
  }, [products, filters.categoria])

  const canExport = ['movements', 'sales', 'stock'].includes(reportType)

  useEffect(() => {
    async function loadCatalog() {
      setCatalogLoading(true)
      try {
        const catalog = await getReportFiltersCatalog()
        setCategories(catalog.categories || [])
        setProducts(catalog.products || [])
      } catch (err) {
        setCategories([])
        setProducts([])
        setError(err.message || 'No fue posible cargar el catalogo de filtros.')
      } finally {
        setCatalogLoading(false)
      }
    }

    loadCatalog()
  }, [])

  useEffect(() => {
    if (!allowedTypes.find((item) => item.value === reportType)) {
      setReportType(allowedTypes[0]?.value || 'movements')
    }
  }, [allowedTypes, reportType])

  function onChangeFilter(event) {
    const { name, value } = event.target
    setFilters((state) => ({
      ...state,
      [name]: value,
      ...(name === 'categoria' ? { producto: '' } : {}),
    }))
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS)
    setResult(null)
    setError('')
  }

  async function onGenerateReport() {
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const payload = await getReport(reportType, filters)
      setResult(payload)
    } catch (err) {
      setError(err.message || 'No fue posible generar el reporte.')
    } finally {
      setLoading(false)
    }
  }

  async function onExport(formato) {
    if (!canExport) return
    setExporting(formato)
    setError('')
    try {
      const payload = buildExportPayload({ reportType, filters, formato })
      const file = await exportarDatos(payload)
      descargarBlob(file.blob, file.filename)
    } catch (err) {
      setError(err.message || `No fue posible exportar el reporte en ${formato}.`)
    } finally {
      setExporting('')
    }
  }

  const tableModel = useMemo(() => buildTable(reportType, result), [reportType, result])

  return (
    <div className="rp-page">
      <div className="rp-page__header">
        <div>
          <h2>Reportes</h2>
          <p>Genera reportes de inventario y visualiza su resumen narrativo.</p>
        </div>
      </div>

      <div className="rp-card">
        <div className="rp-type-selector">
          <span className="rp-type-label">Tipo de reporte</span>
          <select
            className="filter-select"
            value={reportType}
            onChange={(event) => {
              setReportType(event.target.value)
              setResult(null)
              setError('')
            }}
          >
            {allowedTypes.map((type) => (
              <option key={type.value} value={type.value}>{type.label}</option>
            ))}
          </select>
        </div>

        <div className="rp-filters">
          {['movements', 'sales'].includes(reportType) && (
            <>
              <div className="filter-field">
                <label className="filter-label">Fecha inicio</label>
                <input name="fecha_inicio" type="date" className="filter-input" value={filters.fecha_inicio} onChange={onChangeFilter} />
              </div>
              <div className="filter-field">
                <label className="filter-label">Fecha fin</label>
                <input name="fecha_fin" type="date" className="filter-input" value={filters.fecha_fin} onChange={onChangeFilter} />
              </div>
            </>
          )}

          {reportType === 'profits' && (
            <>
              <div className="filter-field">
                <label className="filter-label">Fecha desde</label>
                <input name="fecha_desde" type="date" className="filter-input" value={filters.fecha_desde} onChange={onChangeFilter} />
              </div>
              <div className="filter-field">
                <label className="filter-label">Fecha hasta</label>
                <input name="fecha_hasta" type="date" className="filter-input" value={filters.fecha_hasta} onChange={onChangeFilter} />
              </div>
            </>
          )}

          {reportType === 'comparative' && (
            <>
              <div className="filter-field">
                <label className="filter-label">Actual desde</label>
                <input name="periodo_actual_desde" type="date" className="filter-input" value={filters.periodo_actual_desde} onChange={onChangeFilter} />
              </div>
              <div className="filter-field">
                <label className="filter-label">Actual hasta</label>
                <input name="periodo_actual_hasta" type="date" className="filter-input" value={filters.periodo_actual_hasta} onChange={onChangeFilter} />
              </div>
              <div className="filter-field">
                <label className="filter-label">Anterior desde</label>
                <input name="periodo_anterior_desde" type="date" className="filter-input" value={filters.periodo_anterior_desde} onChange={onChangeFilter} />
              </div>
              <div className="filter-field">
                <label className="filter-label">Anterior hasta</label>
                <input name="periodo_anterior_hasta" type="date" className="filter-input" value={filters.periodo_anterior_hasta} onChange={onChangeFilter} />
              </div>
            </>
          )}

          {['movements', 'sales', 'stock'].includes(reportType) && (
            <>
              <div className="filter-field">
                <label className="filter-label">Categoria</label>
                <select name="categoria" className="filter-select" value={filters.categoria} onChange={onChangeFilter} disabled={catalogLoading}>
                  <option value="">Todas</option>
                  {categories.map((category) => (
                    <option key={category.id_categoria} value={category.id_categoria}>{category.nombre_categoria}</option>
                  ))}
                </select>
              </div>

              <div className="filter-field">
                <label className="filter-label">Producto</label>
                <select name="producto" className="filter-select" value={filters.producto} onChange={onChangeFilter} disabled={catalogLoading}>
                  <option value="">Todos</option>
                  {filteredProducts.map((product) => (
                    <option key={product.id_producto} value={product.id_producto}>{product.nombre}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {reportType === 'movements' && (
            <div className="filter-field">
              <label className="filter-label">Tipo movimiento</label>
              <select name="tipo" className="filter-select" value={filters.tipo} onChange={onChangeFilter}>
                <option value="">Todos</option>
                {MOVEMENT_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          )}

          {reportType === 'no-movement' && (
            <div className="filter-field">
              <label className="filter-label">Dias</label>
              <input name="dias" type="number" min="1" className="filter-input" value={filters.dias} onChange={onChangeFilter} />
            </div>
          )}
        </div>

        <div className="rp-card__footer">
          <button type="button" className="btn btn--ghost" onClick={resetFilters}>Limpiar</button>
          <button type="button" className="btn btn--primary" onClick={onGenerateReport} disabled={loading}>
            {loading ? 'Generando...' : 'Generar reporte'}
          </button>

          {isAdmin && canExport && (
            <div className="rp-export-group">
              <span className="rp-export-label">Exportar:</span>
              <button type="button" className="btn btn--outline" onClick={() => onExport('PDF')} disabled={Boolean(exporting)}>
                {exporting === 'PDF' ? 'Exportando PDF...' : 'PDF'}
              </button>
              <button type="button" className="btn btn--outline" onClick={() => onExport('EXCEL')} disabled={Boolean(exporting)}>
                {exporting === 'EXCEL' ? 'Exportando Excel...' : 'Excel'}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="alert-banner alert-banner--error">{error}</div>}

      {!loading && result?.resumen_narrativo && (
        <div className="rp-card narrative-box">
          <div className="rp-card__header">
            <span className="rp-card__title">Resumen narrativo</span>
          </div>
          <div className="rp-card__info narrative-content">{result.resumen_narrativo}</div>
        </div>
      )}

      {loading && <div className="rp-loading">Generando reporte...</div>}

      {!loading && result && (
        <div className="rp-card rp-card--table">
          <div className="rp-card__header">
            <span className="rp-card__title">Resultados</span>
            <span className="rp-table-count">{tableModel.rows.length} registros</span>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="report-table">
              <thead>
                <tr>
                  {tableModel.columns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableModel.rows.length === 0 && (
                  <tr>
                    <td colSpan={tableModel.columns.length || 1} className="table-empty">No hay datos para el periodo seleccionado.</td>
                  </tr>
                )}

                {tableModel.rows.map((row, index) => (
                  <tr key={`row-${index}`}>
                    {tableModel.columns.map((column) => (
                      <td key={`${column.key}-${index}`}>{formatCell(column.key, row[column.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
