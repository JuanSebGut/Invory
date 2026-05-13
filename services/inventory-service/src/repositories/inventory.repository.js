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
  return {
    id_movimiento: row.id_movimiento,
    fecha: toDateOnly(row.fecha_hora_exacta),
    producto: row.nombre_producto,
    categoria: row.nombre_categoria || null,
    tipo: deriveMovementTypeFromReason(row),
    motivo: row.nombre_motivo || null,
    cantidad: toNumber(row.cantidad),
    stock_anterior: toNumber(row.stock_anterior),
    stock_posterior: toNumber(row.stock_posterior),
    usuario: row.nombre_usuario || null,
    valor_total: 0,
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

  async createMovement(payload, { trx } = {}) {
    const target = this.getTarget(trx);
    const hasMontoColumn = await this.hasMontoPagadoColumn();
    const safeComentarios =
      !hasMontoColumn && payload.monto_pagado != null
        ? `monto_pagado:${payload.monto_pagado}${payload.comentarios ? ` | ${payload.comentarios}` : ''}`
        : payload.comentarios || null;
    const query = hasMontoColumn
      ? `
        INSERT INTO movimientos_inventario (
          id_producto,
          id_usuario,
          id_proveedor,
          id_motivo,
          cantidad,
          stock_anterior,
          stock_posterior,
          numero_factura,
          comentarios,
          monto_pagado
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
          monto_pagado,
          fecha_hora_exacta
      `
      : `
        INSERT INTO movimientos_inventario (
          id_producto,
          id_usuario,
          id_proveedor,
          id_motivo,
          cantidad,
          stock_anterior,
          stock_posterior,
          numero_factura,
          comentarios
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
          NULL::numeric AS monto_pagado,
          fecha_hora_exacta
      `;

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
      values.push(payload.monto_pagado ?? null);
    }

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
}

class InMemoryInventoryRepository {
  constructor({ products = [], movements = [] } = {}) {
    this.products = products.map((product) => cloneRecord(product));
    this.movements = movements.map((movement) => cloneRecord(movement));
    this.nextMovementId =
      this.movements.length > 0
        ? Math.max(...this.movements.map((movement) => movement.id_movimiento || 0)) + 1
        : 1;
  }

  async runInTransaction(handler) {
    const snapshot = {
      products: this.products.map((product) => cloneRecord(product)),
      movements: this.movements.map((movement) => cloneRecord(movement)),
      nextMovementId: this.nextMovementId,
    };

    try {
      return await handler({});
    } catch (error) {
      this.products = snapshot.products;
      this.movements = snapshot.movements;
      this.nextMovementId = snapshot.nextMovementId;
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
}

module.exports = {
  PgInventoryRepository,
  InMemoryInventoryRepository,
};
