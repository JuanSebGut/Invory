'use strict';

/**
 * Servicio de dominio del inventory-service unificado.
 *
 * Ofrece dos capacidades complementarias:
 *
 *   - MS-09 (movimientos): clase InventoryService con registerMovement /
 *     listMovements. Aplica reglas de permisos por rol (ajustes solo para
 *     Administrador), valida stock, persiste en una transacciÃƒÂ³n y dispara
 *     un webhook al audit-service para registrar la acciÃƒÂ³n.
 *
 *   - MS-06 (alertas): factory createInventoryService que expone
 *     getActiveAlerts. Lee filas crudas vÃƒÂ­a repository.getAlertSourceRows
 *     y deriva alertas low-stock / high-stock / expiring-soon.
 *
 * Las dos APIs no se solapan ni comparten estado interno; se exponen juntas
 * solo porque MS-05 las consume desde el mismo proceso.
 */

const { ADMINISTRADOR, EMPLEADO } = require('../../../../shared/constants/roles');
const {
  ALERT_TYPES,
  EXPIRING_SOON_DAYS,
  INVOICE_STATES,
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

function formatCurrency(value) {
  return `$${roundCurrency(Number(value || 0)).toFixed(2)}`;
}

function normalizeRoleLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function isAdministradorRole(value) {
  return normalizeRoleLabel(value) === normalizeRoleLabel(ADMINISTRADOR);
}

function isEmpleadoRole(value) {
  return normalizeRoleLabel(value) === normalizeRoleLabel(EMPLEADO);
}

function allowsFractionalQuantity(product) {
  if (typeof product?.permite_fraccion === 'boolean') {
    return product.permite_fraccion;
  }
  const normalized = String(product?.permite_fraccion || '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 't';
}

function hasFractionalPart(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    return false;
  }
  return Math.abs(normalized % 1) > Number.EPSILON;
}

function normalizeReasonOperation(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
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

function buildPercentageVariation(actual, previous) {
  const current = Number(actual || 0);
  const prior = Number(previous || 0);
  if (prior === 0) {
    return current === 0 ? 0 : 100;
  }
  return Number((((current - prior) / prior) * 100).toFixed(2));
}

function buildReportNarrative(reportType, { filters, summary, totalItems }) {
  if (reportType === REPORT_TYPES.MOVEMENTS) {
    const desde = filters.fecha_inicio || 'inicio del período consultado';
    const hasta = filters.fecha_fin || 'la fecha actual';
    return `Durante el período del ${desde} al ${hasta}, se registraron ${summary.total_items} movimientos con una cantidad total de ${summary.total_quantity} unidades y un valor agregado de ${formatCurrency(summary.total_value)}.`;
  }

  if (reportType === REPORT_TYPES.SALES) {
    const desde = filters.fecha_inicio || 'inicio del período consultado';
    const hasta = filters.fecha_fin || 'la fecha actual';
    return `Durante el período del ${desde} al ${hasta}, se consolidaron ventas por ${formatCurrency(summary.total_value)} con una ganancia estimada de ${formatCurrency(summary.total_profit)} y un margen del ${summary.profit_margin}%.`;
  }

  if (reportType === REPORT_TYPES.STOCK) {
    return `El inventario actual incluye ${totalItems} productos activos con un valor total estimado de ${formatCurrency(summary.total_value)} y un stock acumulado de ${summary.total_quantity} unidades.`;
  }

  return '';
}

const REPORT_COLUMNS = Object.freeze({
  [REPORT_TYPES.MOVEMENTS]: [
    { key: 'fecha', label: 'Fecha' },
    { key: 'producto', label: 'Producto' },
    { key: 'categoria', label: 'CategorÃƒÂ­a' },
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
    { key: 'categoria', label: 'CategorÃƒÂ­a' },
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
    { key: 'categoria', label: 'CategorÃƒÂ­a' },
    { key: 'cantidad', label: 'Stock actual' },
    { key: 'precio_unitario', label: 'Precio unitario' },
    { key: 'valor_total', label: 'Valor inventario' },
  ],
});

function buildReportPayload(reportType, filters, items) {
  const summary = reportType === REPORT_TYPES.SALES ? buildSalesSummary(items) : buildReportSummary(items);
  return {
    meta: {
      reportType,
      generatedAt: new Date().toISOString(),
      filters,
    },
    summary,
    resumen_narrativo: buildReportNarrative(reportType, {
      filters,
      summary,
      totalItems: items.length,
    }),
    columns: REPORT_COLUMNS[reportType] || [],
    items,
  };
}

// ===========================================================================
// MS-09 Ã¢â‚¬â€ Servicio de movimientos
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
 * Da forma a un movimiento persistido para la respuesta HTTP. AÃƒÂ­sla a los
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
    id_factura: movement.id_factura || null,
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
   *   - Entradas y salidas las puede registrar Administrador u Empleado.
   */
  assertPermissions(tipoMovimiento, actor) {
    if (!actor?.id_usuario) {
      throw createHttpError(401, 'AUTH_TOKEN_INVALID', 'Token invalido');
    }

    const role = actor.rol;

    if (![ADMINISTRADOR, EMPLEADO].includes(role)) {
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
   *       * dejarÃƒÂ­a stock negativo (INSUFFICIENT_STOCK), o
   *       * dejarÃƒÂ­a stock por debajo de stock_minimo del producto
   *         (BELOW_MINIMUM_STOCK), salvo que `force=true` (override Admin).
   *   - Ajuste: suma o resta segÃƒÂºn tipo. Lanza 422 si dejarÃƒÂ­a negativo.
   *     Los ajustes NO validan stock_minimo: son correcciones de
   *     inventario real (faltantes legÃƒÂ­timos pueden quedar bajo mÃƒÂ­nimo).
   *
   * @param {object} payload    Payload del movimiento ya validado.
   * @param {number} stockAnterior
   * @param {object} [options]
   * @param {number} [options.stockMinimo]   Stock mÃƒÂ­nimo del producto (puede
   *   ser null/undefined si el producto no lo define).
   * @param {boolean} [options.force=false]  Si true, salta la validaciÃƒÂ³n de
   *   stock_minimo. Solo usado por Administrador vÃƒÂ­a query ?force=true.
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

      // Solo bloqueamos si se conoce el mÃƒÂ­nimo y la salida lo cruza.
      if (
        typeof minimo === 'number' &&
        Number.isFinite(minimo) &&
        stockPosterior < minimo &&
        !canForce
      ) {
        throw createHttpError(
          422,
          'BELOW_MINIMUM_STOCK',
          `La salida dejarÃƒÂ­a el stock (${stockPosterior}) por debajo del mÃƒÂ­nimo permitido (${minimo}). ` +
            'Un Administrador puede forzar la operaciÃƒÂ³n con ?force=true si es estrictamente necesario.'
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
   * Registra un movimiento dentro de una transacciÃƒÂ³n. DespuÃƒÂ©s de commit,
   * dispara el webhook a MS-09 (audit-service) en fire-and-forget para no
   * acoplar la latencia del cliente al pipeline de auditorÃƒÂ­a.
   *
   * @param {object} payload    Payload del movimiento (validado).
   * @param {object} context
   * @param {object} context.actor       Usuario autenticado.
   * @param {boolean} [context.force]    Si true y el actor es Administrador,
   *   permite cruzar el stock mÃƒÂ­nimo en una salida (override controlado).
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

      if (!allowsFractionalQuantity(product) && hasFractionalPart(payload.cantidad)) {
        throw createHttpError(
          400,
          'VALIDATION_ERROR',
          'Este producto no permite cantidades fraccionadas. Ingrese una cantidad entera.'
        );
      }

      if (payload.id_proveedor) {
        const provider = await this.repository.getProviderById(payload.id_proveedor, { trx });
        if (!provider || !isActiveProvider(provider)) {
          throw createHttpError(404, 'SUPPLIER_NOT_FOUND', 'Proveedor no encontrado');
        }
      }

      const reason = payload.id_motivo
        ? await this.repository.getReasonById(payload.id_motivo, { trx })
        : await this.repository.findReasonByPayload(payload, { trx });

      if (!reason) {
        throw createHttpError(
          payload.id_motivo ? 404 : 500,
          'MOVEMENT_REASON_NOT_FOUND',
          payload.id_motivo
            ? 'Motivo de movimiento no encontrado'
            : 'No fue posible determinar el motivo del movimiento'
        );
      }

      const reasonOperation = normalizeReasonOperation(reason.tipo_operacion);
      if (reasonOperation === MOVEMENT_TYPES.ADJUSTMENT && isEmpleadoRole(actor.rol)) {
        throw createHttpError(
          403,
          'INVENTORY_ADJUSTMENT_FORBIDDEN',
          'Solo el administrador puede registrar ajustes de inventario.'
        );
      }

      const isSale =
        reasonOperation === MOVEMENT_TYPES.EXIT &&
        normalizeSalesReason(reason.nombre_motivo || payload.motivo) === 'venta';
      const montoPagadoVenta =
        isSale && typeof payload.monto_pagado === 'number' ? payload.monto_pagado : null;

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

      const movement = await this.repository.createMovement(
        {
          id_producto: payload.id_producto,
          id_usuario: actor.id_usuario,
          id_proveedor: payload.id_proveedor,
          id_motivo: reason.id_motivo,
          id_factura: payload.id_factura,
          cantidad: payload.cantidad,
          stock_anterior: stockAnterior,
          stock_posterior: stockPosterior,
          numero_factura: payload.numero_factura,
          comentarios: payload.comentario || payload.motivo_ajuste || payload.motivo,
          monto_pagado: montoPagadoVenta,
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
        id_factura: payload.id_factura || movement.id_factura || null,
        monto_pagado: montoPagadoVenta ?? movement.monto_pagado,
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

  assertAdminOnlyReport(actorRole, reportType) {
    if (!isAdministradorRole(actorRole)) {
      throw createHttpError(
        403,
        'REPORT_FORBIDDEN',
        `Solo el administrador puede consultar el reporte ${reportType}.`
      );
    }
  }

  async getProfitsReport(filters, { actorRole } = {}) {
    this.assertAdminOnlyReport(actorRole, REPORT_TYPES.PROFITS);

    const metrics = await this.repository.getProfitsMetrics(filters);
    const total_ingresos = roundCurrency(Number(metrics.total_ingresos || 0));
    const costo = roundCurrency(Number(metrics.costo || 0));
    const ganancia_bruta = roundCurrency(total_ingresos - costo);
    const margen_porcentual = total_ingresos > 0
      ? Number(((ganancia_bruta / total_ingresos) * 100).toFixed(2))
      : 0;

    return {
      fecha_desde: filters.fecha_desde,
      fecha_hasta: filters.fecha_hasta,
      total_ingresos,
      costo,
      ganancia_bruta,
      margen_porcentual,
      resumen_narrativo: `Durante el período del ${filters.fecha_desde} al ${filters.fecha_hasta}, se registraron ingresos por ${formatCurrency(total_ingresos)} y un costo de mercancía de ${formatCurrency(costo)}. La ganancia bruta fue de ${formatCurrency(ganancia_bruta)} correspondiente a un margen del ${margen_porcentual}%.`,
    };
  }

  async getComparativeReport(filters, { actorRole } = {}) {
    this.assertAdminOnlyReport(actorRole, REPORT_TYPES.COMPARATIVE);

    const [periodoActual, periodoAnterior] = await Promise.all([
      this.repository.getComparativeMetrics({
        fecha_desde: filters.periodo_actual_desde,
        fecha_hasta: filters.periodo_actual_hasta,
      }),
      this.repository.getComparativeMetrics({
        fecha_desde: filters.periodo_anterior_desde,
        fecha_hasta: filters.periodo_anterior_hasta,
      }),
    ]);

    const indicadores = {
      total_movimientos: {
        periodo_actual: Number(periodoActual.total_movimientos || 0),
        periodo_anterior: Number(periodoAnterior.total_movimientos || 0),
      },
      total_entradas: {
        periodo_actual: Number(periodoActual.total_entradas || 0),
        periodo_anterior: Number(periodoAnterior.total_entradas || 0),
      },
      total_salidas: {
        periodo_actual: Number(periodoActual.total_salidas || 0),
        periodo_anterior: Number(periodoAnterior.total_salidas || 0),
      },
      valor_inventario_cierre: {
        periodo_actual: roundCurrency(Number(periodoActual.valor_inventario_cierre || 0)),
        periodo_anterior: roundCurrency(Number(periodoAnterior.valor_inventario_cierre || 0)),
      },
    };

    for (const indicador of Object.values(indicadores)) {
      indicador.variacion_porcentual = buildPercentageVariation(
        indicador.periodo_actual,
        indicador.periodo_anterior
      );
    }

    return {
      periodos: {
        actual: {
          desde: filters.periodo_actual_desde,
          hasta: filters.periodo_actual_hasta,
        },
        anterior: {
          desde: filters.periodo_anterior_desde,
          hasta: filters.periodo_anterior_hasta,
        },
      },
      indicadores,
      resumen_narrativo: `Comparando ${filters.periodo_actual_desde} a ${filters.periodo_actual_hasta} frente a ${filters.periodo_anterior_desde} a ${filters.periodo_anterior_hasta}, el total de movimientos varió ${indicadores.total_movimientos.variacion_porcentual}%, las entradas ${indicadores.total_entradas.variacion_porcentual}%, las salidas ${indicadores.total_salidas.variacion_porcentual}% y el valor de inventario al cierre ${indicadores.valor_inventario_cierre.variacion_porcentual}%.`,
    };
  }

  async getNoMovementReport(filters) {
    const items = await this.repository.getProductsWithoutMovement(filters);
    return {
      dias: filters.dias,
      total_productos: items.length,
      items,
      resumen_narrativo: `Se identificaron ${items.length} productos sin movimientos en los últimos ${filters.dias} días.`,
    };
  }

  async getByCategoryReport(_filters = {}) {
    const items = await this.repository.getCategorySummaryRows();
    const totalInventario = roundCurrency(
      items.reduce(
        (accumulator, item) => accumulator + Number(item.valor_total_inventario || 0),
        0
      )
    );
    return {
      total_categorias: items.length,
      items,
      resumen_narrativo: `Las categorías activas acumulan un valor de inventario de ${formatCurrency(totalInventario)} con actividad de movimientos en los últimos 30 días.`,
    };
  }

  async createInvoice(payload, { idUsuario }) {
    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'Usuario emisor invalido');
    }

    const subtotal = roundCurrency(
      payload.detalle.reduce(
        (accumulator, item) => accumulator + Number(item.cantidad) * Number(item.precio_unitario),
        0
      )
    );

    const descuento = roundCurrency(Number(payload.descuento || 0));
    if (descuento > subtotal) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'El descuento no puede superar el subtotal');
    }

    const total = roundCurrency(subtotal - descuento);
    const invoice = await this.repository.createInvoice({
      id_cliente: payload.id_cliente,
      id_usuario: idUsuario,
      detalle: payload.detalle,
      descuento,
      subtotal,
      total,
      tipo: payload.tipo,
      observaciones: payload.observaciones || null,
    });

    return { data: invoice };
  }

  async listInvoices(filters) {
    return this.repository.listInvoices(filters);
  }

  async getInvoiceById(idFactura) {
    const invoice = await this.repository.getInvoiceById(idFactura);
    if (!invoice) {
      throw createHttpError(404, 'INVOICE_NOT_FOUND', 'Factura no encontrada');
    }
    return invoice;
  }

  async cancelInvoice(idFactura, { actorRole }) {
    if (!isAdministradorRole(actorRole)) {
      throw createHttpError(
        403,
        'INVOICE_CANCEL_FORBIDDEN',
        'Solo un administrador puede anular facturas'
      );
    }

    const updated = await this.repository.cancelInvoice(idFactura);
    if (!updated) {
      throw createHttpError(404, 'INVOICE_NOT_FOUND', 'Factura no encontrada');
    }
    if (updated.estado === INVOICE_STATES.CANCELED && updated.wasAlreadyCanceled) {
      throw createHttpError(409, 'INVOICE_ALREADY_CANCELED', 'La factura ya se encuentra anulada');
    }
    return updated;
  }
}

// ===========================================================================
// MS-06 Ã¢â‚¬â€ Servicio de alertas de stock
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
 * Pipeline de derivaciÃƒÂ³n: por cada fila origen genera potencialmente las tres
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

function mapFiadoAlertType(rawType) {
  const normalized = String(rawType || '').trim().toLowerCase();
  if (normalized === 'vencido') {
    return ALERT_TYPES.FIADO_VENCIDO;
  }
  if (normalized === 'por_vencer') {
    return ALERT_TYPES.FIADO_POR_VENCER;
  }
  return null;
}

async function fetchFiadoAlerts({
  clientServiceUrl,
  fetchImpl,
}) {
  if (!clientServiceUrl || typeof fetchImpl !== 'function') {
    return [];
  }

  try {
    const response = await fetchImpl(`${String(clientServiceUrl).replace(/\/$/, '')}/fiados/alertas`, {
      method: 'GET',
    });

    if (!response.ok) {
      console.error(
        `[inventory-service] No fue posible obtener alertas de fiados: HTTP ${response.status}`
      );
      return [];
    }

    const payload = await response.json();
    const items = Array.isArray(payload?.data?.items) ? payload.data.items : [];

    return items
      .map((item) => {
        const type = mapFiadoAlertType(item.tipo_alerta);
        if (!type) {
          return null;
        }

        return {
          type,
          tipo: type,
          id_fiado: item.id_fiado,
          nombre_cliente: item.cliente_nombre || null,
          monto_pendiente: item.saldo_pendiente,
          fecha_pago_acordada: item.fecha_pago_acordada,
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error(
      '[inventory-service] Error consultando alertas de fiados en client-service:',
      error?.message || error
    );
    return [];
  }
}

/**
 * Factory functional para el servicio de alertas. Mantiene el contrato
 * histÃƒÂ³rico de MS-06: { getActiveAlerts(filters) -> { data, meta } }.
 */
function createInventoryService({
  repository,
  nowProvider = () => new Date().toISOString(),
  fetchImpl = fetch,
  clientServiceUrl = process.env.CLIENT_SERVICE_URL || 'http://localhost:3009',
} = {}) {
  if (!repository || typeof repository.getAlertSourceRows !== 'function') {
    throw new ValidationError('Inventory repository must expose getAlertSourceRows(filters)');
  }

  return {
    async getActiveAlerts(rawFilters = {}) {
      const filters = normalizeAlertFilters(rawFilters);
      const generatedAt = nowProvider();
      const sourceRows = await repository.getAlertSourceRows(filters);
      const inventoryAlerts = deriveAlerts(sourceRows, { now: generatedAt });
      const fiadoAlerts = await fetchFiadoAlerts({ clientServiceUrl, fetchImpl });
      const alerts = applyAlertFilters([...inventoryAlerts, ...fiadoAlerts], filters);

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

