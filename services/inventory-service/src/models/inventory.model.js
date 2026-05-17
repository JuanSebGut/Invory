'use strict';

/**
 * Modelo del inventory-service unificado.
 *
 * Este archivo concentra dos dominios complementarios del MS-05 (Inventario):
 *
 *   1. MOVIMIENTOS (rama MS-09) â€” entradas, salidas y ajustes de stock con
 *      validaciones, paginaciÃ³n y errores HTTP estandarizados.
 *
 *   2. ALERTAS DE STOCK (rama MS-06) â€” derivaciÃ³n de alertas (low-stock,
 *      high-stock, expiring-soon) a partir de filas crudas del repositorio,
 *      con filtros normalizados.
 *
 * HistÃ³ricamente cada dominio vivÃ­a en su propia rama; la integraciÃ³n
 * MS-06 + MS-09 los fusiona para que el inventory-service sea un Ãºnico punto
 * de verdad. Ambos dominios coexisten sin acoplamiento porque no comparten
 * estructuras de datos: MOVEMENT_TYPES describe transiciones de stock,
 * ALERT_TYPES describe estados derivados del stock.
 */

// ===========================================================================
// 1. MOVIMIENTOS (MS-09)
// ===========================================================================

const MOVEMENT_TYPES = Object.freeze({
  ENTRY: 'entrada',
  EXIT: 'salida',
  ADJUSTMENT: 'ajuste',
});

const INVOICE_TYPES = Object.freeze({
  SALE: 'venta',
  RETURN: 'devolucion',
});

const INVOICE_STATES = Object.freeze({
  ISSUED: 'emitida',
  CANCELED: 'anulada',
});

const EXIT_REASONS = new Set(['venta', 'merma', 'rotura', 'danado', 'vencido', 'devolucion']);
const ADJUSTMENT_TYPES = new Set(['sobrante', 'faltante']);

/**
 * Construye un Error con metadata HTTP. El handler global del Express app
 * lee `status` y `code` para responder un payload uniforme.
 */
function createHttpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function readAlias(source, aliases) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(source, alias)) {
      return source[alias];
    }
  }
  return undefined;
}

function normalizeTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : String(value || '').trim();
}

function normalizeRequiredString(value, fieldName) {
  const normalized = normalizeTrimmedString(value);
  if (!normalized) {
    throw createHttpError(400, 'VALIDATION_ERROR', `${fieldName} es obligatorio`);
  }
  return normalized;
}

function normalizeOptionalString(value) {
  const normalized = normalizeTrimmedString(value);
  return normalized || undefined;
}

function normalizePrice(value, fieldName) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw createHttpError(400, 'VALIDATION_ERROR', `${fieldName} debe ser un numero mayor o igual a 0`);
  }
  return normalized;
}

function normalizeOptionalNonNegativeNumber(value, fieldName, fallback = undefined) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return fallback;
  }

  return normalizePrice(value, fieldName);
}

function normalizePositiveInteger(value, fieldName) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createHttpError(400, 'VALIDATION_ERROR', `${fieldName} debe ser un entero positivo`);
  }
  return normalized;
}

function normalizePositiveNumber(value, fieldName) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw createHttpError(400, 'VALIDATION_ERROR', `${fieldName} debe ser un numero mayor a 0`);
  }
  return normalized;
}

function normalizePageNumber(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function normalizeIsoDate(value, fieldName) {
  const normalized = normalizeRequiredString(value, fieldName);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw createHttpError(400, 'VALIDATION_ERROR', `${fieldName} debe tener formato YYYY-MM-DD`);
  }

  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw createHttpError(400, 'VALIDATION_ERROR', `${fieldName} no es una fecha valida`);
  }

  return normalized;
}

function normalizeOptionalDate(value, fieldName) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return undefined;
  }
  return normalizeIsoDate(value, fieldName);
}

function normalizeMovementType(value) {
  const normalized = normalizeRequiredString(value, 'tipo_movimiento').toLowerCase();
  if (!Object.values(MOVEMENT_TYPES).includes(normalized)) {
    throw createHttpError(
      400,
      'VALIDATION_ERROR',
      'tipo_movimiento debe ser entrada, salida o ajuste'
    );
  }
  return normalized;
}

function validateCreateMovementPayload(body) {
  if (!body || typeof body !== 'object') {
    throw createHttpError(400, 'VALIDATION_ERROR', 'El cuerpo de la solicitud es obligatorio');
  }

  const id_producto = normalizePositiveInteger(
    readAlias(body, ['id_producto', 'idProducto', 'productId']),
    'id_producto'
  );
  const id_motivo = normalizeOptionalPositiveInteger(
    readAlias(body, ['id_motivo', 'idMotivo', 'motivoId']),
    'id_motivo'
  );
  const tipo_movimiento = normalizeMovementType(
    readAlias(body, ['tipo_movimiento', 'tipoMovimiento', 'tipo'])
  );
  const cantidad = normalizePositiveNumber(body.cantidad, 'cantidad');
  const comentario = normalizeOptionalString(body.comentario);
  const id_factura = normalizeOptionalPositiveInteger(
    readAlias(body, ['id_factura', 'idFactura', 'facturaId']),
    'id_factura'
  );

  if (tipo_movimiento === MOVEMENT_TYPES.ENTRY) {
    return {
      id_producto,
      id_motivo,
      tipo_movimiento,
      cantidad,
      comentario,
      id_factura,
      fecha_vencimiento: normalizeOptionalDate(body.fecha_vencimiento, 'fecha_vencimiento'),
      id_proveedor:
        typeof body.id_proveedor === 'undefined'
          ? undefined
          : normalizePositiveInteger(body.id_proveedor, 'id_proveedor'),
      numero_factura: normalizeOptionalString(body.numero_factura),
    };
  }

  if (tipo_movimiento === MOVEMENT_TYPES.EXIT) {
    const motivoRaw = normalizeOptionalString(body.motivo);
    const motivo = motivoRaw ? motivoRaw.toLowerCase() : undefined;
    if (!id_motivo && !motivo) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'motivo es obligatorio');
    }
    if (motivo && !EXIT_REASONS.has(motivo)) {
      throw createHttpError(
        400,
        'VALIDATION_ERROR',
        'motivo debe ser Venta, Merma, Rotura, Danado, Vencido o Devolucion'
      );
    }

    return {
      id_producto,
      id_motivo,
      tipo_movimiento,
      cantidad,
      motivo,
      id_factura,
      numero_factura: normalizeOptionalString(body.numero_factura),
      monto_pagado:
        typeof body.monto_pagado !== 'undefined'
          ? normalizePrice(body.monto_pagado, 'monto_pagado')
          : undefined,
      comentario,
    };
  }

  const tipo_ajuste = normalizeRequiredString(
    readAlias(body, ['tipo_ajuste', 'tipoAjuste']),
    'tipo_ajuste'
  ).toLowerCase();

  if (!ADJUSTMENT_TYPES.has(tipo_ajuste)) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'tipo_ajuste debe ser sobrante o faltante');
  }

  return {
    id_producto,
    id_motivo,
    tipo_movimiento,
    cantidad,
    id_factura,
    tipo_ajuste,
    motivo_ajuste: normalizeRequiredString(
      readAlias(body, ['motivo_ajuste', 'motivoAjuste']),
      'motivo_ajuste'
    ),
    comentario,
  };
}

function parseMovementFilters(query = {}) {
  const page = normalizePageNumber(query.page, 1);
  const size = Math.min(100, normalizePageNumber(query.size, 10));
  const productIdRaw = readAlias(query, ['producto', 'id_producto', 'productId']);
  const typeRaw = readAlias(query, ['tipo', 'tipo_movimiento', 'movementType']);
  const exactDate = normalizeOptionalDate(readAlias(query, ['fecha', 'date']), 'fecha');
  const dateFrom = normalizeOptionalDate(
    readAlias(query, ['fecha_desde', 'dateFrom']),
    'fecha_desde'
  );
  const dateTo = normalizeOptionalDate(
    readAlias(query, ['fecha_hasta', 'dateTo']),
    'fecha_hasta'
  );

  if (!exactDate && dateFrom && dateTo && dateFrom > dateTo) {
    throw createHttpError(
      400,
      'VALIDATION_ERROR',
      'fecha_desde no puede ser mayor a fecha_hasta'
    );
  }

  return {
    page,
    size,
    productId:
      typeof productIdRaw === 'undefined' || productIdRaw === ''
        ? undefined
        : normalizePositiveInteger(productIdRaw, 'producto'),
    movementType:
      typeof typeRaw === 'undefined' || typeRaw === ''
        ? undefined
        : normalizeMovementType(typeRaw),
    exactDate,
    dateFrom: exactDate ? undefined : dateFrom,
    dateTo: exactDate ? undefined : dateTo,
    numeroFactura: normalizeOptionalString(readAlias(query, ['numero_factura', 'numeroFactura'])),
  };
}

function normalizeInvoiceType(value, fieldName = 'tipo') {
  const normalized = normalizeRequiredString(value, fieldName).toLowerCase();
  if (!Object.values(INVOICE_TYPES).includes(normalized)) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'tipo debe ser venta o devolucion');
  }
  return normalized;
}

function normalizeInvoiceState(value, fieldName = 'estado') {
  const normalized = normalizeRequiredString(value, fieldName).toLowerCase();
  if (!Object.values(INVOICE_STATES).includes(normalized)) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'estado debe ser emitida o anulada');
  }
  return normalized;
}

function parseInvoiceId(value, fieldName = 'id_factura') {
  return normalizePositiveInteger(value, fieldName);
}

function validateCreateInvoicePayload(body) {
  if (!body || typeof body !== 'object') {
    throw createHttpError(400, 'VALIDATION_ERROR', 'El cuerpo de la solicitud es obligatorio');
  }

  if (!Array.isArray(body.detalle) || body.detalle.length === 0) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'detalle debe tener al menos un producto');
  }

  const detalle = body.detalle.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw createHttpError(400, 'VALIDATION_ERROR', `detalle[${index}] no es valido`);
    }

    const cantidad = Number(item.cantidad);
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      throw createHttpError(
        400,
        'VALIDATION_ERROR',
        `detalle[${index}].cantidad debe ser mayor que 0`
      );
    }

    const precioUnitario = Number(item.precio_unitario);
    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
      throw createHttpError(
        400,
        'VALIDATION_ERROR',
        `detalle[${index}].precio_unitario debe ser mayor o igual a 0`
      );
    }

    return {
      id_producto: normalizePositiveInteger(item.id_producto, `detalle[${index}].id_producto`),
      cantidad,
      precio_unitario: precioUnitario,
    };
  });

  return {
    id_cliente:
      typeof body.id_cliente === 'undefined' || body.id_cliente === null || body.id_cliente === ''
        ? null
        : normalizePositiveInteger(body.id_cliente, 'id_cliente'),
    tipo: normalizeInvoiceType(body.tipo),
    descuento: normalizeOptionalNonNegativeNumber(body.descuento, 'descuento', 0),
    observaciones: normalizeOptionalString(body.observaciones),
    detalle,
  };
}

function parseInvoiceFilters(query = {}) {
  const page = normalizePageNumber(query.page, 1);
  const size = Math.min(100, normalizePageNumber(query.size, 10));
  const exactDate = normalizeOptionalDate(readAlias(query, ['fecha', 'date']), 'fecha');
  const dateFrom = normalizeOptionalDate(
    readAlias(query, ['fecha_desde', 'dateFrom']),
    'fecha_desde'
  );
  const dateTo = normalizeOptionalDate(
    readAlias(query, ['fecha_hasta', 'dateTo']),
    'fecha_hasta'
  );

  if (!exactDate && dateFrom && dateTo && dateFrom > dateTo) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'fecha_desde no puede ser mayor a fecha_hasta');
  }

  return {
    page,
    size,
    id_cliente:
      typeof query.id_cliente === 'undefined' || query.id_cliente === null || query.id_cliente === ''
        ? undefined
        : normalizePositiveInteger(query.id_cliente, 'id_cliente'),
    estado:
      typeof query.estado === 'undefined' || query.estado === null || query.estado === ''
        ? undefined
        : normalizeInvoiceState(query.estado),
    tipo:
      typeof query.tipo === 'undefined' || query.tipo === null || query.tipo === ''
        ? undefined
        : normalizeInvoiceType(query.tipo),
    exactDate,
    dateFrom: exactDate ? undefined : dateFrom,
    dateTo: exactDate ? undefined : dateTo,
  };
}

// ===========================================================================
// 2. ALERTAS DE STOCK (MS-06)
// ===========================================================================

const ALERT_TYPES = Object.freeze({
  LOW_STOCK: 'low-stock',
  HIGH_STOCK: 'high-stock',
  EXPIRING_SOON: 'expiring-soon',
  FIADO_VENCIDO: 'fiado_vencido',
  FIADO_POR_VENCER: 'fiado_por_vencer',
});

const REPORT_TYPES = Object.freeze({
  MOVEMENTS: 'movements',
  SALES: 'sales',
  STOCK: 'stock',
  PROFITS: 'profits',
  COMPARATIVE: 'comparative',
  NO_MOVEMENT: 'no-movement',
  BY_CATEGORY: 'by-category',
});

const VALID_ALERT_TYPES = new Set(Object.values(ALERT_TYPES));
const EXPIRING_SOON_DAYS = 7;

/**
 * Error legacy del mÃ³dulo de alertas (MS-06). Se conserva la API original
 * (extiende Error con statusCode=400) para no romper los tests unitarios y de
 * integraciÃ³n que ya hacen `instanceof ValidationError`.
 */
class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function toDate(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoString(value) {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function normalizeAlertFilters(filters = {}) {
  const normalizedTypes = Array.isArray(filters.type)
    ? filters.type.flatMap((value) => String(value).split(','))
    : String(filters.type || '')
        .split(',')
        .filter(Boolean);

  const uniqueTypes = [...new Set(normalizedTypes.map((value) => value.trim()).filter(Boolean))];
  const invalidType = uniqueTypes.find((value) => !VALID_ALERT_TYPES.has(value));

  if (invalidType) {
    throw new ValidationError('Invalid alert type filter');
  }

  return {
    type: uniqueTypes,
    categoryId: filters.categoryId ? String(filters.categoryId) : null,
  };
}

function calculateDaysToExpire(expirationDate, now) {
  const expiration = toDate(expirationDate);
  const reference = toDate(now);

  if (!expiration || !reference) {
    return null;
  }

  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.ceil((expiration.getTime() - reference.getTime()) / millisecondsPerDay);
}

function createAlertId(type, source) {
  return `${type}:${source.productId}:${source.expirationDate || 'stock'}`;
}

function createDerivedAlert(type, source, now) {
  const daysToExpire = calculateDaysToExpire(source.expirationDate, now);

  return {
    id: createAlertId(type, source),
    type,
    productId: source.productId,
    productName: source.productName,
    categoryId: source.categoryId,
    currentStock: isFiniteNumber(source.currentStock) ? source.currentStock : null,
    minStock: isFiniteNumber(source.minStock) ? source.minStock : null,
    maxStock: isFiniteNumber(source.maxStock) ? source.maxStock : null,
    expirationDate: toIsoString(source.expirationDate),
    daysToExpire: type === ALERT_TYPES.EXPIRING_SOON ? daysToExpire : null,
  };
}

function describeInventoryAlertSourceShape() {
  return 'Minimum alert source shape: productId, productName, categoryId, currentStock, minStock, maxStock, expirationDate';
}

// ===========================================================================
// 3. REPORTES (MS-07)
// ===========================================================================

const REPORT_TYPE_ALIASES = Object.freeze({
  movement: REPORT_TYPES.MOVEMENTS,
  movements: REPORT_TYPES.MOVEMENTS,
  sales: REPORT_TYPES.SALES,
  sale: REPORT_TYPES.SALES,
  stock: REPORT_TYPES.STOCK,
  profits: REPORT_TYPES.PROFITS,
  comparative: REPORT_TYPES.COMPARATIVE,
  'no-movement': REPORT_TYPES.NO_MOVEMENT,
  no_movement: REPORT_TYPES.NO_MOVEMENT,
  by_category: REPORT_TYPES.BY_CATEGORY,
  'by-category': REPORT_TYPES.BY_CATEGORY,
});

function normalizeReportType(value) {
  const normalized = normalizeTrimmedString(value).toLowerCase();
  const reportType = REPORT_TYPE_ALIASES[normalized];

  if (!reportType) {
    throw createHttpError(404, 'REPORT_NOT_FOUND', 'Tipo de reporte no soportado');
  }

  return reportType;
}

function normalizeReportDateFilter(value, fieldName) {
  return normalizeOptionalDate(value, fieldName);
}

function normalizeOptionalPositiveInteger(value, fieldName) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return undefined;
  }

  return normalizePositiveInteger(value, fieldName);
}

function normalizeOptionalMovementReportType(value) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return undefined;
  }

  return normalizeMovementType(value);
}

function parseReportFilters(reportTypeInput, query = {}) {
  const reportType = normalizeReportType(reportTypeInput);
  const baseFilters = { reportType };

  if (reportType === REPORT_TYPES.PROFITS) {
    const fecha_desde = normalizeIsoDate(query.fecha_desde, 'fecha_desde');
    const fecha_hasta = normalizeIsoDate(query.fecha_hasta, 'fecha_hasta');
    if (fecha_desde > fecha_hasta) {
      throw createHttpError(
        400,
        'VALIDATION_ERROR',
        'fecha_desde no puede ser mayor a fecha_hasta'
      );
    }
    return {
      ...baseFilters,
      fecha_desde,
      fecha_hasta,
    };
  }

  if (reportType === REPORT_TYPES.COMPARATIVE) {
    const periodo_actual_desde = normalizeIsoDate(
      query.periodo_actual_desde,
      'periodo_actual_desde'
    );
    const periodo_actual_hasta = normalizeIsoDate(
      query.periodo_actual_hasta,
      'periodo_actual_hasta'
    );
    const periodo_anterior_desde = normalizeIsoDate(
      query.periodo_anterior_desde,
      'periodo_anterior_desde'
    );
    const periodo_anterior_hasta = normalizeIsoDate(
      query.periodo_anterior_hasta,
      'periodo_anterior_hasta'
    );

    if (periodo_actual_desde > periodo_actual_hasta) {
      throw createHttpError(
        400,
        'VALIDATION_ERROR',
        'periodo_actual_desde no puede ser mayor a periodo_actual_hasta'
      );
    }
    if (periodo_anterior_desde > periodo_anterior_hasta) {
      throw createHttpError(
        400,
        'VALIDATION_ERROR',
        'periodo_anterior_desde no puede ser mayor a periodo_anterior_hasta'
      );
    }

    return {
      ...baseFilters,
      periodo_actual_desde,
      periodo_actual_hasta,
      periodo_anterior_desde,
      periodo_anterior_hasta,
    };
  }

  if (reportType === REPORT_TYPES.NO_MOVEMENT) {
    return {
      ...baseFilters,
      dias: normalizeOptionalPositiveInteger(query.dias, 'dias') || 30,
    };
  }

  if (reportType === REPORT_TYPES.BY_CATEGORY) {
    return baseFilters;
  }

  const fecha_inicio = normalizeReportDateFilter(query.fecha_inicio, 'fecha_inicio');
  const fecha_fin = normalizeReportDateFilter(query.fecha_fin, 'fecha_fin');

  if (fecha_inicio && fecha_fin && fecha_inicio > fecha_fin) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'fecha_inicio no puede ser mayor a fecha_fin');
  }

  const scopedFilters = {
    ...baseFilters,
    categoria: normalizeOptionalPositiveInteger(query.categoria, 'categoria'),
    producto: normalizeOptionalPositiveInteger(query.producto, 'producto'),
  };

  if (reportType === REPORT_TYPES.MOVEMENTS) {
    return {
      ...scopedFilters,
      fecha_inicio,
      fecha_fin,
      tipo: normalizeOptionalMovementReportType(query.tipo),
    };
  }

  if (reportType === REPORT_TYPES.SALES) {
    return {
      ...scopedFilters,
      fecha_inicio,
      fecha_fin,
    };
  }

  return scopedFilters;
}

// ===========================================================================
// EXPORTS
// ===========================================================================

module.exports = {
  // Movements (MS-09)
  MOVEMENT_TYPES,
  INVOICE_TYPES,
  INVOICE_STATES,
  createHttpError,
  validateCreateMovementPayload,
  parseMovementFilters,
  validateCreateInvoicePayload,
  parseInvoiceFilters,
  parseInvoiceId,

  // Alerts (MS-06)
  ALERT_TYPES,
  EXPIRING_SOON_DAYS,
  VALID_ALERT_TYPES,
  ValidationError,
  calculateDaysToExpire,
  createDerivedAlert,
  describeInventoryAlertSourceShape,
  isFiniteNumber,
  parseReportFilters,
  REPORT_TYPES,
  normalizeReportType,
  normalizeAlertFilters,
  toDate,
  toIsoString,
};
