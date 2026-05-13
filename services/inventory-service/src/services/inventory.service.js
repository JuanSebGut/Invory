'use strict';

/**
 * Servicio de dominio del inventory-service unificado.
 *
 * Ofrece dos capacidades complementarias:
 *
 *   - MS-09 (movimientos): clase InventoryService con registerMovement /
 *     listMovements. Aplica reglas de permisos por rol (ajustes solo para
 *     Administrador), valida stock, persiste en una transacciÃ³n y dispara
 *     un webhook al audit-service para registrar la acciÃ³n.
 *
 *   - MS-06 (alertas): factory createInventoryService que expone
 *     getActiveAlerts. Lee filas crudas vÃ­a repository.getAlertSourceRows
 *     y deriva alertas low-stock / high-stock / expiring-soon.
 *
 * Las dos APIs no se solapan ni comparten estado interno; se exponen juntas
 * solo porque MS-05 las consume desde el mismo proceso.
 */

const { ADMINISTRADOR, OPERADOR } = require('../../../../shared/constants/roles');
const {
  ALERT_TYPES,
  EXPIRING_SOON_DAYS,
  MOVEMENT_TYPES,
  REPORT_TYPES,
  ValidationError,
  calculateDaysToExpire,
  createDerivedAlert,
  createHttpError,
  describeInventoryAlertSourceShape,
  isFiniteNumber,
  normalizeAlertFilters,
  toIsoString,
} = require('../models/inventory.model');

function normalizeSalesReason(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (!normalized) {
    return '';
  }

  return normalized.includes('venta') ? 'venta' : normalized;
}

function toReportNumber(value) {
  const normalized = Number(value || 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function roundCurrency(value) {
  return Number(value.toFixed(2));
}

function formatDateInTimeZone(date = new Date(), timeZone = 'America/Bogota') {
  const normalizedDate = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(normalizedDate.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  })
    .formatToParts(normalizedDate)
    .reduce((accumulator, part) => {
      accumulator[part.type] = part.value;
      return accumulator;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function getColombiaTimestamp(date = new Date()) {
  return formatDateInTimeZone(date, 'America/Bogota');
}

function formatColombiaDateTime(date) {
  const formatted = formatDateInTimeZone(date, 'America/Bogota');
  if (!formatted) {
    return { fecha: null, hora: null };
  }

  const [fecha, hora = ''] = formatted.split(' ');
  return { fecha, hora };
}

function buildReportSummary(items = []) {
  return items.reduce(
    (summary, item) => ({
      total_items: summary.total_items + 1,
      total_quantity: summary.total_quantity + toReportNumber(item.cantidad),
      total_value: roundCurrency(summary.total_value + toReportNumber(item.valor_total)),
    }),
    {
      total_items: 0,
      total_quantity: 0,
      total_value: 0,
    }
  );
}

function buildSalesSummary(items = []) {
  const summary = items.reduce(
    (accumulator, item) => ({
      total_items: accumulator.total_items + 1,
      total_quantity: accumulator.total_quantity + toReportNumber(item.cantidad),
      total_value: roundCurrency(accumulator.total_value + toReportNumber(item.valor_total)),
      total_cost: roundCurrency(accumulator.total_cost + toReportNumber(item.costo_total || 0)),
      total_profit: roundCurrency(accumulator.total_profit + toReportNumber(item.ganancia || 0)),
    }),
    { total_items: 0, total_quantity: 0, total_value: 0, total_cost: 0, total_profit: 0 }
  );

  return {
    ...summary,
    profit_margin:
      summary.total_value > 0
        ? Number(((summary.total_profit / summary.total_value) * 100).toFixed(1))
        : 0,
  };
}

const REPORT_COLUMNS = Object.freeze({
  [REPORT_TYPES.MOVEMENTS]: [
    { key: 'fecha', label: 'Fecha' },
    { key: 'producto', label: 'Producto' },
    { key: 'categoria', label: 'CategorÃ­a' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'motivo', label: 'Motivo' },
    { key: 'cantidad', label: 'Cantidad' },
    { key: 'stock_anterior', label: 'Stock anterior' },
    { key: 'stock_posterior', label: 'Stock posterior' },
    { key: 'usuario', label: 'Usuario' },
  ],
  [REPORT_TYPES.SALES]: [
    { key: 'fecha', label: 'Fecha' },
    { key: 'producto', label: 'Producto' },
    { key: 'categoria', label: 'CategorÃ­a' },
    { key: 'cantidad', label: 'Cantidad' },
    { key: 'precio_unitario', label: 'Precio venta' },
    { key: 'costo_unitario', label: 'Costo unitario' },
    { key: 'valor_total', label: 'Ingresos' },
    { key: 'costo_total', label: 'Costo total' },
    { key: 'ganancia', label: 'Ganancia' },
    { key: 'monto_pagado', label: 'Monto pagado' },
    { key: 'vuelto', label: 'Vuelto' },
  ],
  [REPORT_TYPES.STOCK]: [
    { key: 'producto', label: 'Producto' },
    { key: 'categoria', label: 'CategorÃ­a' },
    { key: 'cantidad', label: 'Stock actual' },
    { key: 'precio_unitario', label: 'Precio unitario' },
    { key: 'valor_total', label: 'Valor inventario' },
  ],
});

function buildReportPayload(reportType, filters, items) {
  return {
    meta: {
      reportType,
      generatedAt: new Date().toISOString(),
      filters,
    },
    summary: reportType === REPORT_TYPES.SALES ? buildSalesSummary(items) : buildReportSummary(items),
    columns: REPORT_COLUMNS[reportType] || [],
    items,
  };
}

// ===========================================================================
// MS-09 â€” Servicio de movimientos
// ===========================================================================

function isActiveProduct(product) {
  if (!product) {
    return false;
  }
  if (typeof product.estado === 'boolean') {
    return product.estado;
  }
  const normalized = String(product.estado || '').trim().toLowerCase();
  return normalized === 'activo' || normalized === 'true' || normalized === '1';
}

function isActiveProvider(provider) {
  if (!provider) {
    return false;
  }
  if (typeof provider.estado === 'boolean') {
    return provider.estado;
  }
  const normalized = String(provider.estado || '').trim().toLowerCase();
  return normalized === 'activo' || normalized === 'true' || normalized === '1';
}

/**
 * Da forma a un movimiento persistido para la respuesta HTTP. AÃ­sla a los
 * controllers de las particularidades del repositorio (snake_case de DB,
 * fechas ISO completas vs. fecha+hora separadas, etc.).
 */
function formatMovementResponse(movement, actorRoleOverride) {
  const timestamp = movement.fecha_hora_exacta || movement.fecha_movimiento;
  const iso = timestamp ? new Date(timestamp).toISOString() : null;
  return {
    id_movimiento: movement.id_movimiento,
    tipo: movement.movement_type || movement.tipo_movimiento,
    fecha_hora_exacta: iso,
    fecha: iso ? iso.slice(0, 10) : null,
    hora: iso ? iso.slice(11, 19) : null,
    id_producto: movement.id_producto,
    nombre_producto: movement.nombre_producto,
    cantidad: Number(movement.cantidad),
    stock_anterior: Number(movement.stock_anterior),
    nuevo_stock: Number(movement.stock_posterior),
    usuario: {
      id_usuario: movement.id_usuario,
      nombre: movement.nombre_usuario || movement.usuario_nombre,
      rol: actorRoleOverride || movement.rol_usuario || null,
    },
    motivo: movement.nombre_motivo || movement.motivo || movement.motivo_ajuste || null,
    comentario: movement.comentarios || movement.comentario || null,
    tipo_ajuste: movement.tipo_ajuste || null,
    fecha_vencimiento: movement.fecha_vencimiento || null,
    id_proveedor: movement.id_proveedor || null,
    numero_factura: movement.numero_factura || null,
    monto_pagado: movement.monto_pagado ?? null,
  };
}

class InventoryService {
  constructor({
    repository,
    notifier = { notifyMovementRegistered: async () => {} },
    nowProvider = () => new Date(),
  }) {
    this.repository = repository;
    this.notifier = notifier;
    this.nowProvider = nowProvider;
  }

  /**
   * Aplica el contrato de roles de R02 + R14:
   *   - Cualquier movimiento exige actor autenticado.
   *   - Ajustes son exclusivos de Administrador.
   *   - Entradas y salidas las puede registrar Administrador u Operador.
   */
  assertPermissions(tipoMovimiento, actor) {
    if (!actor?.id_usuario) {
      throw createHttpError(401, 'AUTH_TOKEN_INVALID', 'Token invalido');
    }

    const role = actor.rol;

    if (tipoMovimiento === MOVEMENT_TYPES.ADJUSTMENT && role !== ADMINISTRADOR) {
      throw createHttpError(
        403,
        'INVENTORY_ADJUSTMENT_FORBIDDEN',
        'No tiene permisos para registrar ajustes de inventario'
      );
    }

    if (![ADMINISTRADOR, OPERADOR].includes(role)) {
      throw createHttpError(
        403,
        'INVENTORY_MOVEMENT_FORBIDDEN',
        'No tiene permisos para registrar movimientos de inventario'
      );
    }
  }

  /**
   * Calcula el stock posterior aplicando la regla del tipo de movimiento.
   * Reglas:
   *   - Entrada: suma cantidad.
   *   - Salida: resta cantidad. Lanza 422 si:
   *       * dejarÃ­a stock negativo (INSUFFICIENT_STOCK), o
   *       * dejarÃ­a stock por debajo de stock_minimo del producto
   *         (BELOW_MINIMUM_STOCK), salvo que `force=true` (override Admin).
   *   - Ajuste: suma o resta segÃºn tipo. Lanza 422 si dejarÃ­a negativo.
   *     Los ajustes NO validan stock_minimo: son correcciones de
   *     inventario real (faltantes legÃ­timos pueden quedar bajo mÃ­nimo).
   *
   * @param {object} payload    Payload del movimiento ya validado.
   * @param {number} stockAnterior
   * @param {object} [options]
   * @param {number} [options.stockMinimo]   Stock mÃ­nimo del producto (puede
   *   ser null/undefined si el producto no lo define).
   * @param {boolean} [options.force=false]  Si true, salta la validaciÃ³n de
   *   stock_minimo. Solo usado por Administrador vÃ­a query ?force=true.
   * @param {string}  [options.actorRole]    Rol del actor (para permitir
   *   force solo si es Administrador).
   */
  buildNextStock(payload, stockAnterior, options = {}) {
    if (payload.tipo_movimiento === MOVEMENT_TYPES.ENTRY) {
      return stockAnterior + payload.cantidad;
    }

    if (payload.tipo_movimiento === MOVEMENT_TYPES.EXIT) {
      if (stockAnterior < payload.cantidad) {
        throw createHttpError(
          422,
          'INSUFFICIENT_STOCK',
          'Stock insuficiente para registrar la salida'
        );
      }

      const stockPosterior = stockAnterior - payload.cantidad;
      const minimo = options.stockMinimo;
      const canForce = options.force === true && options.actorRole === ADMINISTRADOR;

      // Solo bloqueamos si se conoce el mÃ­nimo y la salida lo cruza.
      if (
        typeof minimo === 'number' &&
        Number.isFinite(minimo) &&
        stockPosterior < minimo &&
        !canForce
      ) {
        throw createHttpError(
          422,
          'BELOW_MINIMUM_STOCK',
          `La salida dejarÃ­a el stock (${stockPosterior}) por debajo del mÃ­nimo permitido (${minimo}). ` +
            'Un Administrador puede forzar la operaciÃ³n con ?force=true si es estrictamente necesario.'
        );
      }

      return stockPosterior;
    }

    // Ajuste
    if (payload.tipo_ajuste === 'sobrante') {
      return stockAnterior + payload.cantidad;
    }

    if (stockAnterior < payload.cantidad) {
      throw createHttpError(
        422,
        'NEGATIVE_STOCK_NOT_ALLOWED',
        'El ajuste no puede dejar el stock en negativo'
      );
    }

    return stockAnterior - payload.cantidad;
  }

  /**
   * Registra un movimiento dentro de una transacciÃ³n. DespuÃ©s de commit,
   * dispara el webhook a MS-09 (audit-service) en fire-and-forget para no
   * acoplar la latencia del cliente al pipeline de auditorÃ­a.
   *
   * @param {object} payload    Payload del movimiento (validado).
   * @param {object} context
   * @param {object} context.actor       Usuario autenticado.
   * @param {boolean} [context.force]    Si true y el actor es Administrador,
   *   permite cruzar el stock mÃ­nimo en una salida (override controlado).
   */
  async registerMovement(payload, { actor, force = false }) {
    this.assertPermissions(payload.tipo_movimiento, actor);

    const persisted = await this.repository.runInTransaction(async (trx) => {
      const product = await this.repository.getProductById(payload.id_producto, {
        trx,
        lockForUpdate: true,
      });

      if (!product || !isActiveProduct(product)) {
        throw createHttpError(404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado');
      }

      if (payload.id_proveedor) {
        const provider = await this.repository.getProviderById(payload.id_proveedor, { trx });
        if (!provider || !isActiveProvider(provider)) {
          throw createHttpError(404, 'SUPPLIER_NOT_FOUND', 'Proveedor no encontrado');
        }
      }

      const stockAnterior = Number(product.stock_actual || 0);
      const stockMinimo =
        product.stock_minimo === null || typeof product.stock_minimo === 'undefined'
          ? null
          : Number(product.stock_minimo);
      const stockPosterior = this.buildNextStock(payload, stockAnterior, {
        stockMinimo,
        force,
        actorRole: actor.rol,
      });
      const reason = await this.repository.findReasonByPayload(payload, { trx });

      if (!reason) {
        throw createHttpError(
          500,
          'MOVEMENT_REASON_NOT_FOUND',
          'No fue posible determinar el motivo del movimiento'
        );
      }

      const movement = await this.repository.createMovement(
        {
          id_producto: payload.id_producto,
          id_usuario: actor.id_usuario,
          id_proveedor: payload.id_proveedor,
          id_motivo: reason.id_motivo,
          cantidad: payload.cantidad,
          stock_anterior: stockAnterior,
          stock_posterior: stockPosterior,
          numero_factura: payload.numero_factura,
          comentarios: payload.comentario || payload.motivo_ajuste || payload.motivo,
          monto_pagado: payload.monto_pagado,
          movement_type: payload.tipo_movimiento,
        },
        { trx }
      );

      if (payload.tipo_movimiento === MOVEMENT_TYPES.ADJUSTMENT) {
        await this.repository.createAdjustmentAudit(
          {
            id_usuario: actor.id_usuario,
            id_producto: payload.id_producto,
            cantidad: payload.cantidad,
            motivo: payload.motivo_ajuste,
            tipo_ajuste: payload.tipo_ajuste,
          },
          { trx }
        );
      }

      return {
        ...movement,
        nombre_producto: product.nombre,
        nombre_usuario: actor.nombre,
        rol_usuario: actor.rol,
        nombre_motivo:
          payload.tipo_movimiento === MOVEMENT_TYPES.ADJUSTMENT
            ? payload.motivo_ajuste
            : reason.nombre_motivo,
        movement_type: payload.tipo_movimiento,
        tipo_ajuste: payload.tipo_ajuste || null,
        fecha_vencimiento: payload.fecha_vencimiento || null,
        monto_pagado: typeof payload.monto_pagado === 'number' ? payload.monto_pagado : movement.monto_pagado,
      };
    });

    // Fire-and-forget: cualquier fallo del webhook NO debe romper la respuesta.
    void this.notifier.notifyMovementRegistered(persisted).catch(() => {});

    return {
      data: formatMovementResponse(persisted, actor.rol),
    };
  }

  async listMovements(filters) {
    const result = await this.repository.listMovements(filters);

    return {
      total: result.total,
      page: result.page,
      size: result.size,
      totalPages: Math.ceil(result.total / result.size) || 1,
      items: result.items.map((movement) => formatMovementResponse(movement)),
    };
  }

  async getMovementReport(filters) {
    const items = (await this.repository.getMovementReportRows(filters)).map((item) => {
      const isSale = item.tipo === 'salida' && normalizeSalesReason(item.motivo) === 'venta';
      const monto_pagado = item.monto_pagado ?? null;
      const vuelto =
        isSale && monto_pagado != null
          ? roundCurrency(monto_pagado - toReportNumber(item.valor_total))
          : null;

      return {
        ...item,
        monto_pagado,
        vuelto,
      };
    });
    return buildReportPayload(REPORT_TYPES.MOVEMENTS, filters, items);
  }

  async getSalesReport(filters) {
    const items = await this.repository.getSalesReportRows(filters);
    return buildReportPayload(REPORT_TYPES.SALES, filters, items);
  }

  async getStockReport(filters) {
    const items = await this.repository.getStockReportRows(filters);
    return buildReportPayload(REPORT_TYPES.STOCK, filters, items);
  }
}

// ===========================================================================
// MS-06 â€” Servicio de alertas de stock
// ===========================================================================

function buildLowStockAlert(source, now) {
  if (!isFiniteNumber(source.currentStock) || !isFiniteNumber(source.minStock)) {
    return null;
  }
  if (source.currentStock > source.minStock) {
    return null;
  }
  return createDerivedAlert(ALERT_TYPES.LOW_STOCK, source, now);
}

function buildHighStockAlert(source, now) {
  if (!isFiniteNumber(source.currentStock) || !isFiniteNumber(source.maxStock)) {
    return null;
  }
  if (source.currentStock < source.maxStock) {
    return null;
  }
  return createDerivedAlert(ALERT_TYPES.HIGH_STOCK, source, now);
}

function buildExpiringSoonAlert(source, now) {
  const daysToExpire = calculateDaysToExpire(source.expirationDate, now);
  if (daysToExpire === null || daysToExpire < 0 || daysToExpire > EXPIRING_SOON_DAYS) {
    return null;
  }
  return createDerivedAlert(ALERT_TYPES.EXPIRING_SOON, source, now);
}

/**
 * Pipeline de derivaciÃ³n: por cada fila origen genera potencialmente las tres
 * variantes de alerta y se queda solo con las que pasan los predicados.
 */
function deriveAlerts(records = [], { now = new Date().toISOString() } = {}) {
  return records.flatMap((source) => {
    const derived = [
      buildLowStockAlert(source, now),
      buildHighStockAlert(source, now),
      buildExpiringSoonAlert(source, now),
    ];
    return derived.filter(Boolean);
  });
}

function applyAlertFilters(alerts, filters) {
  return alerts.filter((alert) => {
    if (filters.categoryId && alert.categoryId !== filters.categoryId) {
      return false;
    }
    if (filters.type.length > 0 && !filters.type.includes(alert.type)) {
      return false;
    }
    return true;
  });
}

/**
 * Factory functional para el servicio de alertas. Mantiene el contrato
 * histÃ³rico de MS-06: { getActiveAlerts(filters) -> { data, meta } }.
 */
function createInventoryService({ repository, nowProvider = () => new Date().toISOString() } = {}) {
  if (!repository || typeof repository.getAlertSourceRows !== 'function') {
    throw new ValidationError('Inventory repository must expose getAlertSourceRows(filters)');
  }

  return {
    async getActiveAlerts(rawFilters = {}) {
      const filters = normalizeAlertFilters(rawFilters);
      const generatedAt = nowProvider();
      const sourceRows = await repository.getAlertSourceRows(filters);
      const alerts = applyAlertFilters(deriveAlerts(sourceRows, { now: generatedAt }), filters);

      return {
        data: alerts,
        meta: {
          generatedAt: toIsoString(generatedAt),
          filters,
        },
      };
    },
  };
}

// ===========================================================================
// EXPORTS
// ===========================================================================

module.exports = {
  // MS-09
  InventoryService,
  formatMovementResponse,
  getColombiaTimestamp,

  // MS-06
  ALERT_TYPES,
  EXPIRING_SOON_DAYS,
  applyAlertFilters,
  buildReportSummary,
  createInventoryService,
  deriveAlerts,
  describeInventoryAlertSourceShape,
  normalizeSalesReason,
  normalizeAlertFilters,
};
