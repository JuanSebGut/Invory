/**
 * Genera un numero de factura unico basado en tipo y timestamp.
 * Formato: {prefijo}-{YYYYMMDD}-{random4digits}
 */
export function generarNumeroFactura(tipo) {
  const prefijos = { entrada: 'ENT', salida: 'SAL', ajuste: 'AJU', venta: 'VTA' }
  const prefijo = prefijos[tipo] || 'MOV'
  const fecha = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const random = String(Math.floor(Math.random() * 9000) + 1000)
  return `${prefijo}-${fecha}-${random}`
}
