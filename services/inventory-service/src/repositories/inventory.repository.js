const { INVOICE_STATES, createHttpError } = require('../models/inventory.model');

const REASON_MATCHERS = {
  entrada: ['Compra / Reposicion', 'Compra / ReposiciÃ³n', 'Devolucion proveedor'],
  salida: {
    venta: ['Venta'],
    merma: ['Merma'],
    rotura: ['Rotura'],
    danado: ['Danado', 'DaÃ±ado'],
    vencido: ['Vencido', 'Caducidad'],
  },
  ajuste: {
    sobrante: ['Ajuste sobrante'],
    faltante: ['Ajuste faltante'],
  },
};

function toNumber(value) {
  const normalized = Number(value || 0);
  return Number.isFinite(normalized) ? normalized : 0;
}

function roundCurrency(value) {
  return Number(Number(value).toFixed(2));
}

function toDateOnly(value) {
  const normalizedDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(normalizedDate.getTime())) {
    return '';
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(normalizedDate)
    .reduce((accumulator, part) => {
      accumulator[part.type] = part.value;
      return accumulator;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function cloneRecord(record) {
  return JSON.parse(JSON.stringify(record));
}

function normalizeReasonLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function deriveMovementTypeFromReason(record) {
  const tipoOperacion = normalizeReasonLabel(record.tipo_operacion || '');
  const motivo = normalizeReasonLabel(record.nombre_motivo || record.motivo || '');

  if (tipoOperacion === 'entrada') {
    return 'entrada';
  }

  if (tipoOperacion === 'ajuste' && motivo.includes('ajuste')) {
    return 'ajuste';
  }

  return 'salida';
}

function normalizeSalesReason(value) {
  const normalized = normalizeReasonLabel(value);
  return normalized.includes('venta') ? 'venta' : normalized;
}

function extractMontoFromComentarios(comentarios) {
  const normalized = String(comentarios || '').trim();
  if (!normalized) return null;
  const match = normalized.match(/monto_pagado:([0-9]+(?:\.[0-9]+)?)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
}

function isSalesReason(value) {
  return normalizeSalesReason(value) === 'venta';
}

function filterReportByCommonFields(record, filters = {}) {
  if (typeof filters.categoria === 'number' && Number(record.id_categoria) !== filters.categoria) {
    return false;
  }

  if (typeof filters.producto === 'number' && Number(record.id_producto) !== filters.producto) {
    return false;
  }

  return true;
}

function filterReportByDate(record, filters = {}) {
  const movementDate = toDateOnly(record.fecha_hora_exacta || record.fecha);

  if (filters.fecha_inicio && movementDate < filters.fecha_inicio) {
    return false;
  }

  if (filters.fecha_fin && movementDate > filters.fecha_fin) {
    return false;
  }

  return true;
}

function mapMovementReportRow(row) {
  const monto = row.monto_pagado != null ? toNumber(row.monto_pagado) : extractMontoFromComentarios(row.comentarios);
  const cantidad = toNumber(row.cantidad);
  const precioUnitario = toNumber(row.precio_venta);
  return {
    id_movimiento: row.id_movimiento,
    fecha: toDateOnly(row.fecha_hora_exacta),
    producto: row.nombre_producto,
    categoria: row.nombre_categoria || null,
    tipo: deriveMovementTypeFromReason(row),
    motivo: row.nombre_motivo || null,
    cantidad,
    stock_anterior: toNumber(row.stock_anterior),
    stock_posterior: toNumber(row.stock_posterior),
    usuario: row.nombre_usuario || null,
    valor_total: cantidad * precioUnitario,
    monto_pagado: monto,
  };
}

function mapSalesReportRow(row) {
  const cantidad = toNumber(row.cantidad);
  const precio_unitario = toNumber(row.precio_venta);
  const costo_unitario = toNumber(row.precio_compra);
  const valor_total = cantidad * precio_unitario;
  const costo_total = cantidad * costo_unitario;
  const ganancia = valor_total - costo_total;
  const monto_pagado =
    row.monto_pagado != null ? toNumber(row.monto_pagado) : extractMontoFromComentarios(row.comentarios);
  const totalVenta = cantidad * precio_unitario;
  const vuelto = monto_pagado != null ? monto_pagado - totalVenta : null;
  return {
    id_movimiento: row.id_movimiento,
    fecha: toDateOnly(row.fecha_hora_exacta),
    producto: row.nombre_producto,
    categoria: row.nombre_categoria || null,
    tipo: 'venta',
    cantidad,
    precio_unitario,
    costo_unitario,
    valor_total,
    costo_total,
    ganancia,
    monto_pagado,
    vuelto,
  };
}

function mapStockReportRow(row) {
  const cantidad = toNumber(row.stock_actual);
  const precio_unitario = toNumber(row.precio_venta);
  return {
    id_producto: row.id_producto,
    producto: row.nombre,
    categoria: row.nombre_categoria || null,
    cantidad,
    precio_unitario,
    valor_total: cantidad * precio_unitario,
  };
}

class PgInventoryRepository {
  constructor({ pool }) {
    this.pool = pool;
    this._hasMontoPagadoColumn = null;
    this._hasIdFacturaColumn = null;
  }

  async hasMontoPagadoColumn() {
    if (typeof this._hasMontoPagadoColumn === 'boolean') {
      return this._hasMontoPagadoColumn;
    }
    const { rows } = await this.pool.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'movimientos_inventario'
          AND column_name = 'monto_pagado'
        LIMIT 1
      `
    );
    this._hasMontoPagadoColumn = rows.length > 0;
    return this._hasMontoPagadoColumn;
  }

  async hasIdFacturaColumn() {
    if (typeof this._hasIdFacturaColumn === 'boolean') {
      return this._hasIdFacturaColumn;
    }
    const { rows } = await this.pool.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'movimientos_inventario'
          AND column_name = 'id_factura'
        LIMIT 1
      `
    );
    this._hasIdFacturaColumn = rows.length > 0;
    return this._hasIdFacturaColumn;
  }

  async runInTransaction(handler) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await handler({ client });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  getTarget(trx) {
    return trx?.client || this.pool;
  }

  async getProductById(idProducto, { trx, lockForUpdate = false } = {}) {
    const target = this.getTarget(trx);
    const lockClause = lockForUpdate ? ' FOR UPDATE' : '';
    const query = `
      SELECT
        p.id_producto,
        p.id_categoria,
        p.codigo_barras_unico,
        p.nombre,
        p.precio_compra,
        p.precio_venta,
        p.stock_actual,
        p.stock_minimo,
        p.stock_maximo,
        p.permite_fraccion,
        p.fecha_vencimiento,
        p.estado,
        p.ubicacion,
        p.descripcion,
        c.nombre_categoria
      FROM productos p
      JOIN categorias c ON c.id_categoria = p.id_categoria
      WHERE p.id_producto = $1
      LIMIT 1${lockClause}
    `;

    const { rows } = await target.query(query, [idProducto]);
    return rows[0] || null;
  }

  async getProviderById(idProveedor, { trx } = {}) {
    const target = this.getTarget(trx);
    const query = `
      SELECT id_proveedor, razon_social, estado
      FROM proveedores
      WHERE id_proveedor = $1
      LIMIT 1
    `;

    const { rows } = await target.query(query, [idProveedor]);
    return rows[0] || null;
  }

  async findReasonByPayload(payload, { trx } = {}) {
    const target = this.getTarget(trx);
    let candidates = [];

    if (payload.tipo_movimiento === 'entrada') {
      candidates = REASON_MATCHERS.entrada;
    } else if (payload.tipo_movimiento === 'salida') {
      candidates = REASON_MATCHERS.salida[payload.motivo] || [];
    } else {
      candidates = REASON_MATCHERS.ajuste[payload.tipo_ajuste] || [];
    }

    const { rows } = await target.query(
      `
        SELECT id_motivo, nombre_motivo, tipo_operacion
        FROM motivos_movimiento
        ORDER BY id_motivo ASC
      `
    );

    const normalizedCandidates = candidates.map((item) => normalizeReasonLabel(item));
    return (
      rows.find((row) => normalizedCandidates.includes(normalizeReasonLabel(row.nombre_motivo))) ||
      null
    );
  }

  async getReasonById(idMotivo, { trx } = {}) {
    const target = this.getTarget(trx);
    const { rows } = await target.query(
      `
        SELECT id_motivo, nombre_motivo, tipo_operacion
        FROM motivos_movimiento
        WHERE id_motivo = $1
        LIMIT 1
      `,
      [idMotivo]
    );
    return rows[0] || null;
  }

  async createMovement(payload, { trx } = {}) {
    const target = this.getTarget(trx);
    const hasMontoColumn = await this.hasMontoPagadoColumn();
    const hasIdFacturaColumn = await this.hasIdFacturaColumn();
    const safeComentarios =
      !hasMontoColumn && payload.monto_pagado != null
        ? `monto_pagado:${payload.monto_pagado}${payload.comentarios ? ` | ${payload.comentarios}` : ''}`
        : payload.comentarios || null;

    const columns = [
      'id_producto',
      'id_usuario',
      'id_proveedor',
      'id_motivo',
      'cantidad',
      'stock_anterior',
      'stock_posterior',
      'numero_factura',
      'comentarios',
    ];
    const values = [
      payload.id_producto,
      payload.id_usuario,
      payload.id_proveedor || null,
      payload.id_motivo,
      payload.cantidad,
      payload.stock_anterior,
      payload.stock_posterior,
      payload.numero_factura || null,
      safeComentarios,
    ];

    if (hasMontoColumn) {
      columns.push('monto_pagado');
      values.push(payload.monto_pagado ?? null);
    }

    if (hasIdFacturaColumn) {
      columns.push('id_factura');
      values.push(payload.id_factura ?? null);
    }

    const placeholders = columns.map((_column, index) => `$${index + 1}`).join(', ');
    const query = `
      INSERT INTO movimientos_inventario (
        ${columns.join(',\n        ')}
      )
      VALUES (${placeholders})
      RETURNING
        id_movimiento,
        id_producto,
        id_usuario,
        id_proveedor,
        id_motivo,
        cantidad,
        stock_anterior,
        stock_posterior,
        numero_factura,
        comentarios,
        ${hasMontoColumn ? 'monto_pagado' : 'NULL::numeric AS monto_pagado'},
        ${hasIdFacturaColumn ? 'id_factura' : 'NULL::int AS id_factura'},
        fecha_hora_exacta
    `;

    const { rows } = await target.query(query, values);
    return rows[0] || null;
  }

  async createAdjustmentAudit(payload, { trx } = {}) {
    const target = this.getTarget(trx);
    const query = `
      INSERT INTO ajustes_inventario (
        id_usuario,
        id_producto,
        cantidad,
        motivo,
        tipo_ajuste
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id_ajuste
    `;

    const values = [
      payload.id_usuario,
      payload.id_producto,
      payload.cantidad,
      payload.motivo,
      payload.tipo_ajuste.toUpperCase(),
    ];

    const { rows } = await target.query(query, values);
    return rows[0] || null;
  }

  async listMovements(filters = {}) {
    const hasMontoColumn = await this.hasMontoPagadoColumn();
    const hasIdFacturaColumn = await this.hasIdFacturaColumn();
    const params = [];
    const where = [];

    if (typeof filters.productId === 'number') {
      params.push(filters.productId);
      where.push(`m.id_producto = $${params.length}`);
    }

    if (filters.exactDate) {
      params.push(filters.exactDate);
      where.push(`DATE(m.fecha_hora_exacta) = $${params.length}`);
    } else {
      if (filters.dateFrom) {
        params.push(filters.dateFrom);
        where.push(`m.fecha_hora_exacta >= $${params.length}`);
      }

      if (filters.dateTo) {
        params.push(`${filters.dateTo}T23:59:59.999Z`);
        where.push(`m.fecha_hora_exacta <= $${params.length}`);
      }
    }

    if (filters.movementType === 'entrada') {
      where.push(`LOWER(mm.tipo_operacion::text) = 'entrada'`);
    }

    if (filters.movementType === 'salida') {
      where.push(
        `(LOWER(mm.tipo_operacion::text) = 'salida' OR (LOWER(mm.tipo_operacion::text) = 'ajuste' AND LOWER(mm.nombre_motivo) NOT LIKE '%ajuste%'))`
      );
    }

    if (filters.movementType === 'ajuste') {
      where.push(
        `(LOWER(mm.tipo_operacion::text) = 'ajuste' AND LOWER(mm.nombre_motivo) LIKE '%ajuste%')`
      );
    }

    if (filters.numeroFactura) {
      params.push(`%${filters.numeroFactura}%`);
      where.push(`COALESCE(m.numero_factura, '') ILIKE $${params.length}`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM movimientos_inventario m
      JOIN motivos_movimiento mm ON mm.id_motivo = m.id_motivo
      ${whereClause}
    `;

    const countResult = await this.pool.query(countQuery, params);
    const total = countResult.rows[0]?.total || 0;

    const offset = (filters.page - 1) * filters.size;
    const listParams = [...params, filters.size, offset];
    const listQuery = `
      SELECT
        m.id_movimiento,
        m.id_producto,
        m.id_usuario,
        m.id_proveedor,
        m.id_motivo,
        m.cantidad,
        m.stock_anterior,
        m.stock_posterior,
        m.numero_factura,
        ${hasIdFacturaColumn ? 'm.id_factura' : 'NULL::int AS id_factura'},
        m.comentarios,
        ${hasMontoColumn ? 'm.monto_pagado' : 'NULL::numeric AS monto_pagado'},
        m.fecha_hora_exacta,
        p.nombre AS nombre_producto,
        u.nombre AS nombre_usuario,
        mm.nombre_motivo,
        mm.tipo_operacion
      FROM movimientos_inventario m
      JOIN productos p ON p.id_producto = m.id_producto
      JOIN usuarios u ON u.id_usuario = m.id_usuario
      JOIN motivos_movimiento mm ON mm.id_motivo = m.id_motivo
      ${whereClause}
      ORDER BY m.fecha_hora_exacta DESC, m.id_movimiento DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `;

    const { rows } = await this.pool.query(listQuery, listParams);

    return {
      total,
      page: filters.page,
      size: filters.size,
      items: rows.map((row) => ({
        ...row,
        monto_pagado:
          row.monto_pagado != null ? toNumber(row.monto_pagado) : extractMontoFromComentarios(row.comentarios),
        movement_type: deriveMovementTypeFromReason(row),
      })),
    };
  }

  /**
   * Devuelve filas crudas de productos activos con la forma que el servicio
   * de alertas (MS-06) consume: productId, productName, categoryId,
   * currentStock, minStock, maxStock, expirationDate.
   *
   * El servicio de alertas (createInventoryService.getActiveAlerts) deriva
   * de cada fila las posibles variantes de alerta:
   *   - low-stock      â†’ currentStock <= minStock
   *   - high-stock     â†’ currentStock >= maxStock
   *   - expiring-soon  â†’ fecha de vencimiento dentro de los prÃ³ximos 7 dÃ­as
   *
   * Filtros soportados:
   *   - filters.categoryId  â†’ filtra a nivel SQL para no traer productos
   *     de otras categorÃ­as cuando el usuario seleccionÃ³ una.
   *
   * Solo se devuelven productos con estado=true (activos).
   */
  async getAlertSourceRows(filters = {}) {
    const params = [];
    const where = ['p.estado = true'];

    if (filters.categoryId) {
      params.push(filters.categoryId);
      where.push(`p.id_categoria = $${params.length}`);
    }

    const query = `
      SELECT
        p.id_producto,
        p.nombre,
        p.id_categoria,
        p.stock_actual,
        p.stock_minimo,
        p.stock_maximo,
        p.fecha_vencimiento
      FROM productos p
      WHERE ${where.join(' AND ')}
    `;

    const { rows } = await this.pool.query(query, params);

    // Mapea la fila SQL al "shape" que el servicio de alertas espera
    // (camelCase). La derivaciÃ³n tolera valores null en min/max/fecha y
    // simplemente no genera la alerta correspondiente cuando faltan datos.
    return rows.map((row) => ({
      productId: row.id_producto,
      productName: row.nombre,
      categoryId: row.id_categoria,
      currentStock: row.stock_actual === null ? undefined : Number(row.stock_actual),
      minStock: row.stock_minimo === null ? undefined : Number(row.stock_minimo),
      maxStock: row.stock_maximo === null ? undefined : Number(row.stock_maximo),
      expirationDate: row.fecha_vencimiento || null,
    }));
  }

  async getMovementReportRows(filters = {}) {
    const hasMontoColumn = await this.hasMontoPagadoColumn();
    const params = [];
    const where = [];

    if (typeof filters.categoria === 'number') {
      params.push(filters.categoria);
      where.push(`p.id_categoria = $${params.length}`);
    }

    if (typeof filters.producto === 'number') {
      params.push(filters.producto);
      where.push(`p.id_producto = $${params.length}`);
    }

    if (filters.fecha_inicio) {
      params.push(filters.fecha_inicio);
      where.push(`DATE(m.fecha_hora_exacta) >= $${params.length}`);
    }

    if (filters.fecha_fin) {
      params.push(filters.fecha_fin);
      where.push(`DATE(m.fecha_hora_exacta) <= $${params.length}`);
    }

    if (filters.tipo === 'entrada') {
      where.push(`LOWER(mm.tipo_operacion::text) = 'entrada'`);
    }

    if (filters.tipo === 'salida') {
      where.push(`(LOWER(mm.tipo_operacion::text) = 'salida' OR (LOWER(mm.tipo_operacion::text) = 'ajuste' AND LOWER(mm.nombre_motivo) NOT LIKE '%ajuste%'))`);
    }

    if (filters.tipo === 'ajuste') {
      where.push(`(LOWER(mm.tipo_operacion::text) = 'ajuste' AND LOWER(mm.nombre_motivo) LIKE '%ajuste%')`);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const query = `
      SELECT
        m.id_movimiento,
        m.id_producto,
        m.cantidad,
        m.stock_anterior,
        m.stock_posterior,
        m.fecha_hora_exacta,
        m.comentarios,
        ${hasMontoColumn ? 'm.monto_pagado' : 'NULL::numeric AS monto_pagado'},
        p.id_categoria,
        p.precio_venta,
        p.nombre AS nombre_producto,
        c.nombre_categoria,
        u.nombre AS nombre_usuario,
        mm.nombre_motivo,
        mm.tipo_operacion
      FROM movimientos_inventario m
      JOIN productos p ON p.id_producto = m.id_producto
      JOIN categorias c ON c.id_categoria = p.id_categoria
      LEFT JOIN usuarios u ON u.id_usuario = m.id_usuario
      JOIN motivos_movimiento mm ON mm.id_motivo = m.id_motivo
      ${whereClause}
      ORDER BY m.fecha_hora_exacta DESC, m.id_movimiento DESC
    `;

    const { rows } = await this.pool.query(query, params);
    return rows.map(mapMovementReportRow);
  }

  async getSalesReportRows(filters = {}) {
    const hasMontoColumn = await this.hasMontoPagadoColumn();
    const params = [];
    const where = ["(LOWER(mm.tipo_operacion::text) = 'salida' OR LOWER(mm.nombre_motivo) LIKE '%venta%')"];

    if (typeof filters.categoria === 'number') {
      params.push(filters.categoria);
      where.push(`p.id_categoria = $${params.length}`);
    }

    if (typeof filters.producto === 'number') {
      params.push(filters.producto);
      where.push(`p.id_producto = $${params.length}`);
    }

    if (filters.fecha_inicio) {
      params.push(filters.fecha_inicio);
      where.push(`DATE(m.fecha_hora_exacta) >= $${params.length}`);
    }

    if (filters.fecha_fin) {
      params.push(filters.fecha_fin);
      where.push(`DATE(m.fecha_hora_exacta) <= $${params.length}`);
    }

    const query = `
      SELECT
        m.id_movimiento,
        m.id_producto,
        m.cantidad,
        m.fecha_hora_exacta,
        m.comentarios,
        ${hasMontoColumn ? 'm.monto_pagado' : 'NULL::numeric AS monto_pagado'},
        p.id_categoria,
        p.nombre AS nombre_producto,
        p.precio_venta,
        p.precio_compra,
        c.nombre_categoria,
        mm.nombre_motivo,
        mm.tipo_operacion
      FROM movimientos_inventario m
      JOIN productos p ON p.id_producto = m.id_producto
      JOIN categorias c ON c.id_categoria = p.id_categoria
      JOIN motivos_movimiento mm ON mm.id_motivo = m.id_motivo
      WHERE ${where.join(' AND ')}
      ORDER BY m.fecha_hora_exacta DESC, m.id_movimiento DESC
    `;

    const { rows } = await this.pool.query(query, params);
    return rows.filter((row) => isSalesReason(row.nombre_motivo)).map(mapSalesReportRow);
  }

  async getStockReportRows(filters = {}) {
    const params = [];
    const where = ['p.estado = true'];

    if (typeof filters.categoria === 'number') {
      params.push(filters.categoria);
      where.push(`p.id_categoria = $${params.length}`);
    }

    if (typeof filters.producto === 'number') {
      params.push(filters.producto);
      where.push(`p.id_producto = $${params.length}`);
    }

    const query = `
      SELECT
        p.id_producto,
        p.nombre,
        p.id_categoria,
        p.stock_actual,
        p.precio_venta,
        c.nombre_categoria
      FROM productos p
      JOIN categorias c ON c.id_categoria = p.id_categoria
      WHERE ${where.join(' AND ')}
      ORDER BY p.nombre ASC, p.id_producto ASC
    `;

    const { rows } = await this.pool.query(query, params);
    return rows.map(mapStockReportRow);
  }

  async getProfitsMetrics(filters = {}) {
    const { rows } = await this.pool.query(
      `
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN LOWER(mm.tipo_operacion::text) = 'salida'
                THEN COALESCE(p.precio_venta, 0) * COALESCE(m.cantidad, 0)
                ELSE 0
              END
            ),
            0
          ) AS total_ingresos,
          COALESCE(
            SUM(
              CASE
                WHEN LOWER(mm.tipo_operacion::text) = 'entrada'
                THEN COALESCE(p.precio_compra, 0) * COALESCE(m.cantidad, 0)
                ELSE 0
              END
            ),
            0
          ) AS costo
        FROM movimientos_inventario m
        JOIN motivos_movimiento mm ON mm.id_motivo = m.id_motivo
        JOIN productos p ON p.id_producto = m.id_producto
        WHERE DATE(m.fecha_hora_exacta) >= $1
          AND DATE(m.fecha_hora_exacta) <= $2
      `,
      [filters.fecha_desde, filters.fecha_hasta]
    );

    return rows[0] || { total_ingresos: 0, costo: 0 };
  }

  async getComparativeMetrics({ fecha_desde, fecha_hasta }) {
    const totalsResult = await this.pool.query(
      `
        SELECT
          COUNT(*)::int AS total_movimientos,
          COUNT(*) FILTER (WHERE LOWER(mm.tipo_operacion::text) = 'entrada')::int AS total_entradas,
          COUNT(*) FILTER (WHERE LOWER(mm.tipo_operacion::text) = 'salida')::int AS total_salidas
        FROM movimientos_inventario m
        JOIN motivos_movimiento mm ON mm.id_motivo = m.id_motivo
        WHERE DATE(m.fecha_hora_exacta) >= $1
          AND DATE(m.fecha_hora_exacta) <= $2
      `,
      [fecha_desde, fecha_hasta]
    );

    const inventoryValueResult = await this.pool.query(
      `
        WITH stock_cierre AS (
          SELECT DISTINCT ON (m.id_producto)
            m.id_producto,
            m.stock_posterior
          FROM movimientos_inventario m
          WHERE DATE(m.fecha_hora_exacta) <= $1
          ORDER BY m.id_producto, m.fecha_hora_exacta DESC, m.id_movimiento DESC
        )
        SELECT
          COALESCE(SUM(COALESCE(sc.stock_posterior, 0) * COALESCE(p.precio_compra, 0)), 0) AS valor_inventario_cierre
        FROM stock_cierre sc
        JOIN productos p ON p.id_producto = sc.id_producto
      `,
      [fecha_hasta]
    );

    return {
      total_movimientos: totalsResult.rows[0]?.total_movimientos || 0,
      total_entradas: totalsResult.rows[0]?.total_entradas || 0,
      total_salidas: totalsResult.rows[0]?.total_salidas || 0,
      valor_inventario_cierre: inventoryValueResult.rows[0]?.valor_inventario_cierre || 0,
    };
  }

  async getProductsWithoutMovement({ dias = 30 } = {}) {
    const { rows } = await this.pool.query(
      `
        SELECT
          p.id_producto,
          p.nombre,
          p.stock_actual,
          lm.ultima_fecha_movimiento
        FROM productos p
        LEFT JOIN LATERAL (
          SELECT MAX(m.fecha_hora_exacta) AS ultima_fecha_movimiento
          FROM movimientos_inventario m
          WHERE m.id_producto = p.id_producto
        ) lm ON TRUE
        WHERE p.estado = true
          AND (
            lm.ultima_fecha_movimiento IS NULL
            OR lm.ultima_fecha_movimiento < NOW() - ($1::int * INTERVAL '1 day')
          )
        ORDER BY p.nombre ASC, p.id_producto ASC
      `,
      [dias]
    );

    return rows.map((row) => ({
      id_producto: row.id_producto,
      nombre: row.nombre,
      stock_actual: Number(row.stock_actual || 0),
      ultima_fecha_movimiento: row.ultima_fecha_movimiento ? toDateOnly(row.ultima_fecha_movimiento) : null,
    }));
  }

  async getCategorySummaryRows() {
    const { rows } = await this.pool.query(`
      WITH categorias_activas AS (
        SELECT c.id_categoria, c.nombre_categoria
        FROM categorias c
        WHERE c.estado = true
      ),
      productos_por_categoria AS (
        SELECT
          p.id_categoria,
          COUNT(*)::int AS cantidad_productos,
          COALESCE(SUM(COALESCE(p.stock_actual, 0) * COALESCE(p.precio_compra, 0)), 0) AS valor_total_inventario
        FROM productos p
        WHERE p.estado = true
        GROUP BY p.id_categoria
      ),
      movimientos_30 AS (
        SELECT
          p.id_categoria,
          COUNT(m.id_movimiento)::int AS cantidad_movimientos_ultimos_30_dias
        FROM movimientos_inventario m
        JOIN productos p ON p.id_producto = m.id_producto
        WHERE m.fecha_hora_exacta >= NOW() - INTERVAL '30 days'
        GROUP BY p.id_categoria
      )
      SELECT
        ca.id_categoria,
        ca.nombre_categoria,
        COALESCE(ppc.cantidad_productos, 0) AS cantidad_productos,
        COALESCE(ppc.valor_total_inventario, 0) AS valor_total_inventario,
        COALESCE(m30.cantidad_movimientos_ultimos_30_dias, 0) AS cantidad_movimientos_ultimos_30_dias
      FROM categorias_activas ca
      LEFT JOIN productos_por_categoria ppc ON ppc.id_categoria = ca.id_categoria
      LEFT JOIN movimientos_30 m30 ON m30.id_categoria = ca.id_categoria
      ORDER BY ca.nombre_categoria ASC
    `);

    return rows.map((row) => ({
      id_categoria: row.id_categoria,
      nombre_categoria: row.nombre_categoria,
      cantidad_productos: Number(row.cantidad_productos || 0),
      valor_total_inventario: roundCurrency(Number(row.valor_total_inventario || 0)),
      cantidad_movimientos_ultimos_30_dias: Number(row.cantidad_movimientos_ultimos_30_dias || 0),
    }));
  }

  async createInvoice(payload) {
    const created = await this.runInTransaction(async (trx) => {
      const target = this.getTarget(trx);
      const productIds = [...new Set(payload.detalle.map((item) => Number(item.id_producto)))];

      const existingProductsResult = await target.query(
        `SELECT id_producto FROM productos WHERE id_producto = ANY($1::int[])`,
        [productIds]
      );

      if (existingProductsResult.rows.length !== productIds.length) {
        throw createHttpError(404, 'PRODUCT_NOT_FOUND', 'Uno o mas productos no existen');
      }

      if (payload.id_cliente) {
        const clientResult = await target.query(
          `SELECT id_cliente FROM clientes WHERE id_cliente = $1 LIMIT 1`,
          [payload.id_cliente]
        );
        if (!clientResult.rows[0]) {
          throw createHttpError(404, 'CLIENT_NOT_FOUND', 'Cliente no encontrado');
        }
      }

      await target.query(
        `
          INSERT INTO parametros_sistema (clave, valor)
          VALUES ('prefijo_factura', 'FAC'), ('consecutivo_factura_actual', '0')
          ON CONFLICT (clave) DO NOTHING
        `
      );

      const paramsResult = await target.query(
        `
          SELECT clave, valor
          FROM parametros_sistema
          WHERE clave IN ('prefijo_factura', 'consecutivo_factura_actual')
          FOR UPDATE
        `
      );

      const paramsMap = paramsResult.rows.reduce((accumulator, row) => {
        accumulator[row.clave] = row.valor;
        return accumulator;
      }, {});

      const prefijo = String(paramsMap.prefijo_factura || 'FAC').trim() || 'FAC';
      const consecutivoActual = Number(paramsMap.consecutivo_factura_actual || 0);
      const consecutivoSeguro = Number.isFinite(consecutivoActual) ? consecutivoActual : 0;
      const siguienteConsecutivo = consecutivoSeguro + 1;
      const year = toDateOnly(new Date()).slice(0, 4);
      const numeroFactura = `${prefijo}-${year}-${String(siguienteConsecutivo).padStart(4, '0')}`;

      await target.query(
        `
          UPDATE parametros_sistema
          SET valor = $1, updated_at = NOW()
          WHERE clave = 'consecutivo_factura_actual'
        `,
        [String(siguienteConsecutivo)]
      );

      const invoiceResult = await target.query(
        `
          INSERT INTO facturas (
            numero_factura,
            id_usuario,
            id_cliente,
            subtotal,
            descuento,
            total,
            estado,
            tipo,
            observaciones
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING
            id_factura,
            numero_factura,
            id_usuario,
            id_cliente,
            fecha_emision,
            subtotal,
            descuento,
            total,
            estado,
            tipo,
            observaciones
        `,
        [
          numeroFactura,
          payload.id_usuario,
          payload.id_cliente,
          payload.subtotal,
          payload.descuento,
          payload.total,
          INVOICE_STATES.ISSUED,
          payload.tipo,
          payload.observaciones,
        ]
      );

      const invoice = invoiceResult.rows[0];
      const detailRows = [];
      for (const item of payload.detalle) {
        const subtotalItem = roundCurrency(Number(item.cantidad) * Number(item.precio_unitario));
        const detailResult = await target.query(
          `
            INSERT INTO facturas_detalle (
              id_factura,
              id_producto,
              cantidad,
              precio_unitario,
              subtotal
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id_detalle, id_factura, id_producto, cantidad, precio_unitario, subtotal
          `,
          [invoice.id_factura, item.id_producto, item.cantidad, item.precio_unitario, subtotalItem]
        );
        detailRows.push(detailResult.rows[0]);
      }

      return {
        ...invoice,
        detalle: detailRows,
      };
    });

    return created;
  }

  async listInvoices(filters = {}) {
    const params = [];
    const where = [];

    if (typeof filters.id_cliente === 'number') {
      params.push(filters.id_cliente);
      where.push(`f.id_cliente = $${params.length}`);
    }

    if (filters.estado) {
      params.push(filters.estado);
      where.push(`f.estado = $${params.length}`);
    }

    if (filters.tipo) {
      params.push(filters.tipo);
      where.push(`f.tipo = $${params.length}`);
    }

    if (filters.exactDate) {
      params.push(filters.exactDate);
      where.push(`DATE(f.fecha_emision) = $${params.length}`);
    } else {
      if (filters.dateFrom) {
        params.push(filters.dateFrom);
        where.push(`DATE(f.fecha_emision) >= $${params.length}`);
      }
      if (filters.dateTo) {
        params.push(filters.dateTo);
        where.push(`DATE(f.fecha_emision) <= $${params.length}`);
      }
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int AS total FROM facturas f ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;
    const offset = (filters.page - 1) * filters.size;
    const listParams = [...params, filters.size, offset];

    const listResult = await this.pool.query(
      `
        SELECT
          f.id_factura,
          f.numero_factura,
          f.id_usuario,
          f.id_cliente,
          f.fecha_emision,
          f.subtotal,
          f.descuento,
          f.total,
          f.estado,
          f.tipo,
          f.observaciones,
          c.nombre AS cliente_nombre
        FROM facturas f
        LEFT JOIN clientes c ON c.id_cliente = f.id_cliente
        ${whereClause}
        ORDER BY f.fecha_emision DESC, f.id_factura DESC
        LIMIT $${listParams.length - 1}
        OFFSET $${listParams.length}
      `,
      listParams
    );

    return {
      total,
      page: filters.page,
      size: filters.size,
      totalPages: Math.ceil(total / filters.size) || 1,
      items: listResult.rows,
    };
  }

  async getInvoiceById(idFactura) {
    const invoiceResult = await this.pool.query(
      `
        SELECT
          f.id_factura,
          f.numero_factura,
          f.id_usuario,
          f.id_cliente,
          f.fecha_emision,
          f.subtotal,
          f.descuento,
          f.total,
          f.estado,
          f.tipo,
          f.observaciones,
          c.nombre AS cliente_nombre,
          c.telefono AS cliente_telefono,
          c.direccion AS cliente_direccion,
          c.correo AS cliente_correo,
          c.documento AS cliente_documento
        FROM facturas f
        LEFT JOIN clientes c ON c.id_cliente = f.id_cliente
        WHERE f.id_factura = $1
        LIMIT 1
      `,
      [idFactura]
    );

    if (!invoiceResult.rows[0]) {
      return null;
    }

    const detailResult = await this.pool.query(
      `
        SELECT
          d.id_detalle,
          d.id_factura,
          d.id_producto,
          d.cantidad,
          d.precio_unitario,
          d.subtotal,
          p.nombre AS producto_nombre
        FROM facturas_detalle d
        JOIN productos p ON p.id_producto = d.id_producto
        WHERE d.id_factura = $1
        ORDER BY d.id_detalle ASC
      `,
      [idFactura]
    );

    const invoice = invoiceResult.rows[0];
    return {
      ...invoice,
      cliente: invoice.id_cliente
        ? {
            id_cliente: invoice.id_cliente,
            nombre: invoice.cliente_nombre,
            telefono: invoice.cliente_telefono,
            direccion: invoice.cliente_direccion,
            correo: invoice.cliente_correo,
            documento: invoice.cliente_documento,
          }
        : null,
      detalle: detailResult.rows,
    };
  }

  async cancelInvoice(idFactura) {
    return this.runInTransaction(async (trx) => {
      const target = this.getTarget(trx);
      const currentResult = await target.query(
        `
          SELECT id_factura, estado, tipo
          FROM facturas
          WHERE id_factura = $1
          FOR UPDATE
        `,
        [idFactura]
      );

      const current = currentResult.rows[0];
      if (!current) {
        return null;
      }

      if (current.estado === INVOICE_STATES.CANCELED) {
        return {
          id_factura: idFactura,
          estado: INVOICE_STATES.CANCELED,
          wasAlreadyCanceled: true,
        };
      }

      const updateResult = await target.query(
        `
          UPDATE facturas
          SET estado = $1
          WHERE id_factura = $2
          RETURNING id_factura, numero_factura, estado, tipo, fecha_emision, total
        `,
        [INVOICE_STATES.CANCELED, idFactura]
      );

      return {
        ...updateResult.rows[0],
        wasAlreadyCanceled: false,
      };
    });
  }
}

class InMemoryInventoryRepository {
  constructor({ products = [], movements = [], invoices = [], invoiceDetails = [], clients = [], parametros = {} } = {}) {
    this.products = products.map((product) => cloneRecord(product));
    this.movements = movements.map((movement) => cloneRecord(movement));
    this.invoices = invoices.map((invoice) => cloneRecord(invoice));
    this.invoiceDetails = invoiceDetails.map((detail) => cloneRecord(detail));
    this.clients = clients.map((client) => cloneRecord(client));
    this.parametros = {
      prefijo_factura: 'FAC',
      consecutivo_factura_actual: '0',
      ...parametros,
    };
    this.nextMovementId =
      this.movements.length > 0
        ? Math.max(...this.movements.map((movement) => movement.id_movimiento || 0)) + 1
        : 1;
    this.nextInvoiceId =
      this.invoices.length > 0
        ? Math.max(...this.invoices.map((invoice) => invoice.id_factura || 0)) + 1
        : 1;
    this.nextInvoiceDetailId =
      this.invoiceDetails.length > 0
        ? Math.max(...this.invoiceDetails.map((detail) => detail.id_detalle || 0)) + 1
        : 1;
  }

  async runInTransaction(handler) {
    const snapshot = {
      products: this.products.map((product) => cloneRecord(product)),
      movements: this.movements.map((movement) => cloneRecord(movement)),
      invoices: this.invoices.map((invoice) => cloneRecord(invoice)),
      invoiceDetails: this.invoiceDetails.map((detail) => cloneRecord(detail)),
      clients: this.clients.map((client) => cloneRecord(client)),
      parametros: cloneRecord(this.parametros),
      nextMovementId: this.nextMovementId,
      nextInvoiceId: this.nextInvoiceId,
      nextInvoiceDetailId: this.nextInvoiceDetailId,
    };

    try {
      return await handler({});
    } catch (error) {
      this.products = snapshot.products;
      this.movements = snapshot.movements;
      this.invoices = snapshot.invoices;
      this.invoiceDetails = snapshot.invoiceDetails;
      this.clients = snapshot.clients;
      this.parametros = snapshot.parametros;
      this.nextMovementId = snapshot.nextMovementId;
      this.nextInvoiceId = snapshot.nextInvoiceId;
      this.nextInvoiceDetailId = snapshot.nextInvoiceDetailId;
      throw error;
    }
  }

  async getProductById(idProducto) {
    const product = this.products.find((item) => item.id_producto === idProducto);
    return product ? cloneRecord(product) : null;
  }

  async getProviderById(idProveedor) {
    return idProveedor ? { id_proveedor: idProveedor, razon_social: 'Proveedor Demo', estado: true } : null;
  }

  async findReasonByPayload(payload) {
    if (payload.tipo_movimiento === 'entrada') {
      return {
        id_motivo: 1,
        nombre_motivo: 'Compra / Reposicion',
        tipo_operacion: 'ENTRADA',
      };
    }

    if (payload.tipo_movimiento === 'salida') {
      return {
        id_motivo: 10,
        nombre_motivo: payload.motivo,
        tipo_operacion: 'SALIDA',
      };
    }

    return {
      id_motivo: payload.tipo_ajuste === 'sobrante' ? 18 : 19,
      nombre_motivo: `Ajuste ${payload.tipo_ajuste}`,
      tipo_operacion: 'AJUSTE',
    };
  }

  async getReasonById(idMotivo) {
    const reasonCatalog = {
      1: { id_motivo: 1, nombre_motivo: 'Compra / Reposicion', tipo_operacion: 'ENTRADA' },
      2: { id_motivo: 2, nombre_motivo: 'Devolucion de cliente', tipo_operacion: 'ENTRADA' },
      10: { id_motivo: 10, nombre_motivo: 'Venta', tipo_operacion: 'SALIDA' },
      11: { id_motivo: 11, nombre_motivo: 'Merma', tipo_operacion: 'SALIDA' },
      12: { id_motivo: 12, nombre_motivo: 'Rotura', tipo_operacion: 'SALIDA' },
      13: { id_motivo: 13, nombre_motivo: 'Danado', tipo_operacion: 'SALIDA' },
      14: { id_motivo: 14, nombre_motivo: 'Vencido', tipo_operacion: 'SALIDA' },
      18: { id_motivo: 18, nombre_motivo: 'Ajuste sobrante', tipo_operacion: 'AJUSTE' },
      19: { id_motivo: 19, nombre_motivo: 'Ajuste faltante', tipo_operacion: 'AJUSTE' },
    };
    const reason = reasonCatalog[Number(idMotivo)];
    return reason ? cloneRecord(reason) : null;
  }

  async createMovement(payload) {
    const record = {
      id_movimiento: this.nextMovementId,
      fecha_hora_exacta: payload.fecha_hora_exacta,
      movement_type: payload.movement_type || payload.tipo_movimiento,
      ...payload,
    };

    this.movements.push(record);
    this.nextMovementId += 1;

    const index = this.products.findIndex((item) => item.id_producto === payload.id_producto);
    if (index >= 0) {
      this.products[index] = {
        ...this.products[index],
        stock_actual: payload.stock_posterior,
      };
    }

    return cloneRecord(record);
  }

  async createAdjustmentAudit(_payload) {
    return { id_ajuste: 1 };
  }

  async listMovements(filters = {}) {
    const filtered = this.movements
      .filter((movement) => {
        if (
          typeof filters.productId === 'number' &&
          movement.id_producto !== filters.productId
        ) {
          return false;
        }

        const movementDate = toDateOnly(movement.fecha_hora_exacta);
        if (filters.exactDate && movementDate !== filters.exactDate) {
          return false;
        }
        if (filters.dateFrom && movementDate < filters.dateFrom) {
          return false;
        }
        if (filters.dateTo && movementDate > filters.dateTo) {
          return false;
        }
        if (filters.movementType && movement.movement_type !== filters.movementType) {
          return false;
        }
        if (
          filters.numeroFactura &&
          !String(movement.numero_factura || '').toLowerCase().includes(String(filters.numeroFactura).toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort((left, right) => {
        const byDate =
          new Date(right.fecha_hora_exacta).getTime() - new Date(left.fecha_hora_exacta).getTime();
        if (byDate !== 0) {
          return byDate;
        }

        return (right.id_movimiento || 0) - (left.id_movimiento || 0);
      })
      .map((movement) => {
        const product = this.products.find((item) => item.id_producto === movement.id_producto);
        return {
          ...cloneRecord(movement),
          nombre_producto: product?.nombre || movement.nombre_producto || null,
        };
      });

    const offset = (filters.page - 1) * filters.size;

    return {
      total: filtered.length,
      page: filters.page,
      size: filters.size,
      items: filtered.slice(offset, offset + filters.size),
    };
  }

  /**
   * ImplementaciÃ³n in-memory del contrato de MS-06 para alertas.
   *
   * Mapea cada producto en memoria al "shape de origen de alertas" que el
   * inventory.service espera: productId, productName, categoryId, currentStock,
   * minStock, maxStock, expirationDate. Cualquier campo ausente queda como
   * undefined y la lÃ³gica de derivaciÃ³n lo descarta (no genera la alerta).
   *
   * El filtro categoryId se aplica aquÃ­ para mantener simetrÃ­a con la
   * implementaciÃ³n Pg, que filtrarÃ­a a nivel SQL.
   */
  async getAlertSourceRows(filters = {}) {
    const rows = this.products.map((product) => ({
      productId: product.id_producto,
      productName: product.nombre,
      categoryId: product.id_categoria || product.categoryId,
      currentStock: typeof product.stock_actual === 'number' ? product.stock_actual : undefined,
      minStock: typeof product.stock_minimo === 'number' ? product.stock_minimo : undefined,
      maxStock: typeof product.stock_maximo === 'number' ? product.stock_maximo : undefined,
      expirationDate: product.fecha_vencimiento || product.expirationDate || null,
    }));

    if (!filters.categoryId) {
      return rows;
    }

    return rows.filter((row) => String(row.categoryId) === String(filters.categoryId));
  }

  async getMovementReportRows(filters = {}) {
    return this.movements
      .map((movement) => {
        const product = this.products.find((item) => item.id_producto === movement.id_producto) || {};
        return {
          ...cloneRecord(movement),
          id_categoria: product.id_categoria,
          nombre_categoria: product.nombre_categoria || null,
          nombre_producto: product.nombre || movement.nombre_producto || null,
          nombre_usuario: movement.nombre_usuario || null,
        };
      })
      .filter((row) => filterReportByCommonFields(row, filters))
      .filter((row) => filterReportByDate(row, filters))
      .filter((row) => !filters.tipo || deriveMovementTypeFromReason(row) === filters.tipo)
      .sort((left, right) => new Date(right.fecha_hora_exacta).getTime() - new Date(left.fecha_hora_exacta).getTime())
      .map(mapMovementReportRow);
  }

  async getSalesReportRows(filters = {}) {
    return this.movements
      .map((movement) => {
        const product = this.products.find((item) => item.id_producto === movement.id_producto) || {};
        return {
          ...cloneRecord(movement),
          id_categoria: product.id_categoria,
          nombre_categoria: product.nombre_categoria || null,
          nombre_producto: product.nombre || movement.nombre_producto || null,
          precio_venta: product.precio_venta || 0,
          precio_compra: product.precio_compra || 0,
        };
      })
      .filter((row) => filterReportByCommonFields(row, filters))
      .filter((row) => filterReportByDate(row, filters))
      .filter((row) => deriveMovementTypeFromReason(row) === 'salida')
      .filter((row) => isSalesReason(row.nombre_motivo || row.motivo))
      .sort((left, right) => new Date(right.fecha_hora_exacta).getTime() - new Date(left.fecha_hora_exacta).getTime())
      .map(mapSalesReportRow);
  }

  async getStockReportRows(filters = {}) {
    return this.products
      .filter((product) => product.estado !== false)
      .filter((product) => filterReportByCommonFields(product, filters))
      .sort((left, right) => String(left.nombre || '').localeCompare(String(right.nombre || '')))
      .map((product) => mapStockReportRow(product));
  }

  async getProfitsMetrics(filters = {}) {
    const rows = this.movements
      .filter((movement) => {
        const movementDate = toDateOnly(movement.fecha_hora_exacta || movement.fecha);
        return movementDate >= filters.fecha_desde && movementDate <= filters.fecha_hasta;
      });

    let total_ingresos = 0;
    let costo = 0;
    for (const movement of rows) {
      const product = this.products.find((item) => Number(item.id_producto) === Number(movement.id_producto)) || {};
      const movementType = deriveMovementTypeFromReason(movement);
      const cantidad = Number(movement.cantidad || 0);
      if (movementType === 'salida') {
        total_ingresos += cantidad * Number(product.precio_venta || 0);
      }
      if (movementType === 'entrada') {
        costo += cantidad * Number(product.precio_compra || 0);
      }
    }

    return {
      total_ingresos: roundCurrency(total_ingresos),
      costo: roundCurrency(costo),
    };
  }

  async getComparativeMetrics({ fecha_desde, fecha_hasta }) {
    const rows = this.movements.filter((movement) => {
      const movementDate = toDateOnly(movement.fecha_hora_exacta || movement.fecha);
      return movementDate >= fecha_desde && movementDate <= fecha_hasta;
    });

    const total_movimientos = rows.length;
    const total_entradas = rows.filter((movement) => deriveMovementTypeFromReason(movement) === 'entrada').length;
    const total_salidas = rows.filter((movement) => deriveMovementTypeFromReason(movement) === 'salida').length;

    const valor_inventario_cierre = this.products.reduce((total, product) => {
      const relevantMovements = this.movements
        .filter(
          (movement) =>
            Number(movement.id_producto) === Number(product.id_producto) &&
            toDateOnly(movement.fecha_hora_exacta || movement.fecha) <= fecha_hasta
        )
        .sort(
          (left, right) =>
            new Date(right.fecha_hora_exacta || right.fecha).getTime() -
            new Date(left.fecha_hora_exacta || left.fecha).getTime()
        );
      if (!relevantMovements[0]) {
        return total;
      }
      return total + Number(relevantMovements[0].stock_posterior || 0) * Number(product.precio_compra || 0);
    }, 0);

    return {
      total_movimientos,
      total_entradas,
      total_salidas,
      valor_inventario_cierre: roundCurrency(valor_inventario_cierre),
    };
  }

  async getProductsWithoutMovement({ dias = 30 } = {}) {
    const referenceDate = new Date();
    referenceDate.setDate(referenceDate.getDate() - Number(dias || 30));

    return this.products
      .filter((product) => product.estado !== false)
      .map((product) => {
        const productMovements = this.movements
          .filter((movement) => Number(movement.id_producto) === Number(product.id_producto))
          .sort(
            (left, right) =>
              new Date(right.fecha_hora_exacta || right.fecha).getTime() -
              new Date(left.fecha_hora_exacta || left.fecha).getTime()
          );
        const lastMovement = productMovements[0];
        return {
          id_producto: product.id_producto,
          nombre: product.nombre,
          stock_actual: Number(product.stock_actual || 0),
          ultima_fecha_movimiento: lastMovement
            ? toDateOnly(lastMovement.fecha_hora_exacta || lastMovement.fecha)
            : null,
          _lastMovementDate: lastMovement ? new Date(lastMovement.fecha_hora_exacta || lastMovement.fecha) : null,
        };
      })
      .filter((product) => !product._lastMovementDate || product._lastMovementDate < referenceDate)
      .map((product) => ({
        id_producto: product.id_producto,
        nombre: product.nombre,
        stock_actual: product.stock_actual,
        ultima_fecha_movimiento: product.ultima_fecha_movimiento,
      }))
      .sort((left, right) => String(left.nombre || '').localeCompare(String(right.nombre || '')));
  }

  async getCategorySummaryRows() {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - 30);

    const categories = new Map();
    for (const product of this.products.filter((item) => item.estado !== false)) {
      const categoryId = product.id_categoria;
      const current = categories.get(categoryId) || {
        id_categoria: categoryId,
        nombre_categoria: product.nombre_categoria || `Categoria ${categoryId}`,
        cantidad_productos: 0,
        valor_total_inventario: 0,
        cantidad_movimientos_ultimos_30_dias: 0,
      };
      current.cantidad_productos += 1;
      current.valor_total_inventario +=
        Number(product.stock_actual || 0) * Number(product.precio_compra || 0);
      categories.set(categoryId, current);
    }

    for (const movement of this.movements) {
      const movementDate = new Date(movement.fecha_hora_exacta || movement.fecha);
      if (Number.isNaN(movementDate.getTime()) || movementDate < threshold) {
        continue;
      }
      const product = this.products.find(
        (item) => Number(item.id_producto) === Number(movement.id_producto)
      );
      if (!product || product.estado === false) {
        continue;
      }
      const category = categories.get(product.id_categoria);
      if (category) {
        category.cantidad_movimientos_ultimos_30_dias += 1;
      }
    }

    return [...categories.values()]
      .map((item) => ({
        ...item,
        valor_total_inventario: roundCurrency(item.valor_total_inventario),
      }))
      .sort((left, right) =>
        String(left.nombre_categoria || '').localeCompare(String(right.nombre_categoria || ''))
      );
  }

  async createInvoice(payload) {
    const existingProducts = new Set(this.products.map((product) => Number(product.id_producto)));
    for (const item of payload.detalle) {
      if (!existingProducts.has(Number(item.id_producto))) {
        throw createHttpError(404, 'PRODUCT_NOT_FOUND', 'Uno o mas productos no existen');
      }
    }

    if (payload.id_cliente) {
      const existsClient = this.clients.some((client) => Number(client.id_cliente) === Number(payload.id_cliente));
      if (!existsClient) {
        throw createHttpError(404, 'CLIENT_NOT_FOUND', 'Cliente no encontrado');
      }
    }

    const consecutivoActual = Number(this.parametros.consecutivo_factura_actual || '0');
    const consecutivoSeguro = Number.isFinite(consecutivoActual) ? consecutivoActual : 0;
    const siguienteConsecutivo = consecutivoSeguro + 1;
    this.parametros.consecutivo_factura_actual = String(siguienteConsecutivo);
    const prefijo = String(this.parametros.prefijo_factura || 'FAC').trim() || 'FAC';
    const year = toDateOnly(new Date()).slice(0, 4);
    const numero_factura = `${prefijo}-${year}-${String(siguienteConsecutivo).padStart(4, '0')}`;

    const invoice = {
      id_factura: this.nextInvoiceId++,
      numero_factura,
      id_usuario: payload.id_usuario,
      id_cliente: payload.id_cliente || null,
      fecha_emision: new Date().toISOString(),
      subtotal: payload.subtotal,
      descuento: payload.descuento,
      total: payload.total,
      estado: INVOICE_STATES.ISSUED,
      tipo: payload.tipo,
      observaciones: payload.observaciones || null,
    };
    this.invoices.push(invoice);

    const detalle = payload.detalle.map((item) => {
      const detail = {
        id_detalle: this.nextInvoiceDetailId++,
        id_factura: invoice.id_factura,
        id_producto: item.id_producto,
        cantidad: item.cantidad,
        precio_unitario: item.precio_unitario,
        subtotal: roundCurrency(Number(item.cantidad) * Number(item.precio_unitario)),
      };
      this.invoiceDetails.push(detail);
      return cloneRecord(detail);
    });

    return {
      ...cloneRecord(invoice),
      detalle,
    };
  }

  async listInvoices(filters = {}) {
    const filtered = this.invoices
      .filter((invoice) => {
        if (typeof filters.id_cliente === 'number' && Number(invoice.id_cliente) !== filters.id_cliente) {
          return false;
        }
        if (filters.estado && invoice.estado !== filters.estado) {
          return false;
        }
        if (filters.tipo && invoice.tipo !== filters.tipo) {
          return false;
        }

        const invoiceDate = toDateOnly(invoice.fecha_emision);
        if (filters.exactDate && invoiceDate !== filters.exactDate) {
          return false;
        }
        if (filters.dateFrom && invoiceDate < filters.dateFrom) {
          return false;
        }
        if (filters.dateTo && invoiceDate > filters.dateTo) {
          return false;
        }
        return true;
      })
      .sort((left, right) => {
        const byDate = new Date(right.fecha_emision).getTime() - new Date(left.fecha_emision).getTime();
        if (byDate !== 0) {
          return byDate;
        }
        return Number(right.id_factura || 0) - Number(left.id_factura || 0);
      });

    const offset = (filters.page - 1) * filters.size;
    const items = filtered.slice(offset, offset + filters.size).map((invoice) => {
      const client = this.clients.find((item) => Number(item.id_cliente) === Number(invoice.id_cliente));
      return {
        ...cloneRecord(invoice),
        cliente_nombre: client?.nombre || null,
      };
    });

    return {
      total: filtered.length,
      page: filters.page,
      size: filters.size,
      totalPages: Math.ceil(filtered.length / filters.size) || 1,
      items,
    };
  }

  async getInvoiceById(idFactura) {
    const invoice = this.invoices.find((item) => Number(item.id_factura) === Number(idFactura));
    if (!invoice) {
      return null;
    }

    const detalle = this.invoiceDetails
      .filter((item) => Number(item.id_factura) === Number(idFactura))
      .sort((left, right) => Number(left.id_detalle || 0) - Number(right.id_detalle || 0))
      .map((item) => {
        const product = this.products.find((productItem) => Number(productItem.id_producto) === Number(item.id_producto));
        return {
          ...cloneRecord(item),
          producto_nombre: product?.nombre || null,
        };
      });

    const client = this.clients.find((item) => Number(item.id_cliente) === Number(invoice.id_cliente));

    return {
      ...cloneRecord(invoice),
      cliente: client
        ? {
            id_cliente: client.id_cliente,
            nombre: client.nombre,
            telefono: client.telefono || null,
            direccion: client.direccion || null,
            correo: client.correo || null,
            documento: client.documento || null,
          }
        : null,
      detalle,
    };
  }

  async cancelInvoice(idFactura) {
    const index = this.invoices.findIndex((item) => Number(item.id_factura) === Number(idFactura));
    if (index < 0) {
      return null;
    }

    if (this.invoices[index].estado === INVOICE_STATES.CANCELED) {
      return {
        id_factura: idFactura,
        estado: INVOICE_STATES.CANCELED,
        wasAlreadyCanceled: true,
      };
    }

    this.invoices[index] = {
      ...this.invoices[index],
      estado: INVOICE_STATES.CANCELED,
    };

    return {
      ...cloneRecord(this.invoices[index]),
      wasAlreadyCanceled: false,
    };
  }
}

module.exports = {
  PgInventoryRepository,
  InMemoryInventoryRepository,
};
