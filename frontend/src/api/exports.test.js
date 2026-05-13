import { describe, expect, it } from 'vitest'
import { buildExportPayload } from './exports.js'

describe('exports api helpers', () => {
  it('buildExportPayload envia ventas con los mismos filtros del reporte', () => {
    expect(buildExportPayload({
      reportType: 'sales',
      formato: 'PDF',
      filters: {
        fecha_inicio: '2026-05-01',
        fecha_fin: '2026-05-04',
        categoria: '3',
        producto: '9',
        tipo: 'salida',
      },
    })).toEqual({
      conjunto_datos: 'ventas',
      report_type: 'sales',
      formato: 'PDF',
      fecha_inicio: '2026-05-01',
      fecha_fin: '2026-05-04',
      id_categoria: 3,
      id_producto: 9,
    })
  })

  it('buildExportPayload envia stock por producto y categoria', () => {
    expect(buildExportPayload({
      reportType: 'stock',
      formato: 'EXCEL',
      filters: {
        categoria: '4',
        producto: '12',
      },
    })).toEqual({
      conjunto_datos: 'stock',
      report_type: 'stock',
      formato: 'EXCEL',
      id_categoria: 4,
      id_producto: 12,
    })
  })

  it('buildExportPayload conserva tipo solo para movimientos', () => {
    expect(buildExportPayload({
      reportType: 'movements',
      formato: 'EXCEL',
      filters: {
        fecha_inicio: '2026-05-01',
        tipo: 'entrada',
        producto: '7',
      },
    })).toEqual({
      conjunto_datos: 'movimientos',
      report_type: 'movements',
      formato: 'EXCEL',
      fecha_inicio: '2026-05-01',
      id_producto: 7,
      tipo: 'entrada',
    })
  })

  it('lanza error si se solicita CSV', () => {
    expect(() => buildExportPayload({
      reportType: 'movements',
      formato: 'CSV',
      filters: {},
    })).toThrow()
  })
})
