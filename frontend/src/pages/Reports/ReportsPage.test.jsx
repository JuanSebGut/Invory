import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReportsPage from './ReportsPage.jsx'

const mockApi = vi.hoisted(() => ({
  buildReportQuery: vi.fn((reportType, filters = {}) => JSON.stringify({ reportType, filters })),
  getReport: vi.fn(),
  getReportFiltersCatalog: vi.fn(),
}))

vi.mock('../../api/reports.js', async () => {
  const actual = await vi.importActual('../../api/reports.js')
  return {
    ...actual,
    buildReportQuery: mockApi.buildReportQuery,
    getReport: mockApi.getReport,
    getReportFiltersCatalog: mockApi.getReportFiltersCatalog,
  }
})

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi.getReportFiltersCatalog.mockResolvedValue({
      categories: [{ id_categoria: 3, nombre_categoria: 'Bebidas' }],
      products: [{ id_producto: 9, nombre: 'CafAA' }],
    })
    mockApi.getReport
      .mockResolvedValueOnce({
        meta: { reportType: 'movements', generatedAt: '2026-05-03T10:00:00.000Z' },
        summary: { total_items: 1, total_quantity: 4, total_value: 12000 },
        columns: [
          { key: 'producto', label: 'Producto' },
          { key: 'valor_total', label: 'Valor total' },
        ],
        items: [{ id_movimiento: 1, producto: 'CafAA', valor_total: 12000 }],
      })
      .mockResolvedValueOnce({
        meta: { reportType: 'stock', generatedAt: '2026-05-03T11:00:00.000Z' },
        summary: { total_items: 1, total_quantity: 12, total_value: 36000 },
        columns: [
          { key: 'producto', label: 'Producto' },
          { key: 'stock_actual', label: 'Stock actual' },
        ],
        items: [{ id_producto: 9, producto: 'CafAA', stock_actual: 12 }],
      })
  })

  it('loads the default report and shows summary plus table data', async () => {
    render(<ReportsPage />)

    expect(await screen.findByText('CatAAlogos listos')).toBeInTheDocument()
    expect(await screen.findByRole('cell', { name: 'CafAA' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Producto' })).toBeInTheDocument()
    expect(screen.getAllByText((content) => content.includes('12.000'))).toHaveLength(2)
    expect(mockApi.getReport).toHaveBeenCalledWith('movements', expect.objectContaining({ tipo: '' }))
  })

  it('switches filters by report type and queries the selected report from the UI', async () => {
    render(<ReportsPage />)

    await screen.findByText('CatAAlogos listos')
    await screen.findByRole('cell', { name: 'CafAA' })

    fireEvent.change(screen.getByRole('combobox', { name: 'Reporte' }), { target: { value: 'stock' } })

    await waitFor(() => {
      expect(mockApi.getReport).toHaveBeenLastCalledWith('stock', expect.objectContaining({
        categoria: '',
        producto: '',
      }))
    })

    expect(screen.queryByLabelText('Tipo')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'CategorAAa' }), { target: { value: '3' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Producto' }), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Consultar' }))

    await waitFor(() => {
      expect(mockApi.getReport).toHaveBeenLastCalledWith('stock', expect.objectContaining({
        categoria: '3',
        producto: '9',
      }))
    })

    expect(await screen.findByRole('columnheader', { name: 'Stock actual' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '12' })).toBeInTheDocument()
  })
})
