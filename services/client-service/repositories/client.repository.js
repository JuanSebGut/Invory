const { AppError } = require('../errors');

class PgClientRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async listClients({ page, size, estado, q }) {
    const offset = (page - 1) * size;
    const params = [];
    const filters = [];

    if (typeof estado === 'boolean') {
      params.push(estado);
      filters.push(`c.estado = $${params.length}`);
    }

    if (q) {
      params.push(`%${q}%`);
      filters.push(`(c.nombre ILIKE $${params.length} OR COALESCE(c.documento, '') ILIKE $${params.length})`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int AS total FROM clientes c ${whereClause}`,
      params,
    );

    params.push(size);
    params.push(offset);

    const rows = await this.pool.query(
      `SELECT c.id_cliente, c.nombre, c.telefono, c.direccion, c.correo, c.documento, c.estado, c.fecha_creacion,
              COALESCE(SUM(CASE WHEN f.estado = 'pendiente' THEN f.saldo_pendiente ELSE 0 END), 0)::numeric(12,2) AS saldo_total_pendiente
       FROM clientes c
       LEFT JOIN fiados f ON f.id_cliente = c.id_cliente
       ${whereClause}
       GROUP BY c.id_cliente
       ORDER BY c.id_cliente ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      total: countResult.rows[0]?.total || 0,
      page,
      size,
      items: rows.rows,
    };
  }

  async getClientById(idCliente) {
    const result = await this.pool.query(
      `SELECT c.id_cliente, c.nombre, c.telefono, c.direccion, c.correo, c.documento, c.estado, c.fecha_creacion,
              COALESCE(SUM(CASE WHEN f.estado = 'pendiente' THEN f.saldo_pendiente ELSE 0 END), 0)::numeric(12,2) AS saldo_total_pendiente
       FROM clientes c
       LEFT JOIN fiados f ON f.id_cliente = c.id_cliente
       WHERE c.id_cliente = $1
       GROUP BY c.id_cliente`,
      [idCliente],
    );

    return result.rows[0] || null;
  }

  async createClient(payload) {
    try {
      const result = await this.pool.query(
        `INSERT INTO clientes (nombre, telefono, direccion, correo, documento, estado)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id_cliente, nombre, telefono, direccion, correo, documento, estado, fecha_creacion`,
        [payload.nombre, payload.telefono, payload.direccion, payload.correo, payload.documento, payload.estado],
      );

      return result.rows[0];
    } catch (error) {
      if (error.code === '23505') {
        throw new AppError(409, 'CLIENTE_DUPLICADO', 'Ya existe un cliente con los datos enviados');
      }
      throw error;
    }
  }

  async updateClient(idCliente, patch) {
    const updates = [];
    const values = [];
    Object.entries(patch).forEach(([key, value]) => {
      values.push(value);
      updates.push(`${key} = $${values.length}`);
    });

    if (!updates.length) {
      return this.getClientById(idCliente);
    }

    values.push(idCliente);

    const result = await this.pool.query(
      `UPDATE clientes SET ${updates.join(', ')}
       WHERE id_cliente = $${values.length}
       RETURNING id_cliente, nombre, telefono, direccion, correo, documento, estado, fecha_creacion`,
      values,
    );

    return result.rows[0] || null;
  }

  async patchClientStatus(idCliente, estado) {
    const result = await this.pool.query(
      `UPDATE clientes SET estado = $1 WHERE id_cliente = $2
       RETURNING id_cliente, nombre, telefono, direccion, correo, documento, estado, fecha_creacion`,
      [estado, idCliente],
    );

    return result.rows[0] || null;
  }

  async listFiadosByClient(idCliente) {
    const result = await this.pool.query(
      `SELECT id_fiado, id_cliente, id_usuario, id_factura, monto_total, monto_pagado, saldo_pendiente,
              fecha_fiado, fecha_pago_acordada, estado, observaciones
       FROM fiados
       WHERE id_cliente = $1
       ORDER BY fecha_fiado DESC, id_fiado DESC`,
      [idCliente],
    );

    return result.rows;
  }

  async createFiado(payload) {
    const result = await this.pool.query(
      `INSERT INTO fiados (id_cliente, id_usuario, id_factura, monto_total, fecha_pago_acordada, observaciones)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id_fiado, id_cliente, id_usuario, id_factura, monto_total, monto_pagado, saldo_pendiente,
                 fecha_fiado, fecha_pago_acordada, estado, observaciones`,
      [
        payload.id_cliente,
        payload.id_usuario,
        payload.id_factura,
        payload.monto_total,
        payload.fecha_pago_acordada,
        payload.observaciones,
      ],
    );

    return result.rows[0];
  }

  async registerFiadoPayment({ id_fiado, id_usuario, monto, observaciones }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const fiadoResult = await client.query(
        `SELECT id_fiado, monto_total, monto_pagado, saldo_pendiente, estado
         FROM fiados
         WHERE id_fiado = $1
         FOR UPDATE`,
        [id_fiado],
      );

      if (!fiadoResult.rows[0]) {
        throw new AppError(404, 'FIADO_NO_ENCONTRADO', 'Fiado no encontrado');
      }

      const fiado = fiadoResult.rows[0];
      if (fiado.estado === 'pagado') {
        throw new AppError(409, 'FIADO_YA_PAGADO', 'El fiado ya se encuentra pagado');
      }

      const saldoActual = Number(fiado.saldo_pendiente);
      if (monto > saldoActual) {
        throw new AppError(409, 'ABONO_SUPERA_SALDO', 'El monto del abono supera el saldo pendiente');
      }

      const pagoResult = await client.query(
        `INSERT INTO fiados_pagos (id_fiado, id_usuario, monto, observaciones)
         VALUES ($1, $2, $3, $4)
         RETURNING id_pago, id_fiado, id_usuario, monto, fecha_pago, observaciones`,
        [id_fiado, id_usuario, monto, observaciones],
      );

      const nuevoMontoPagado = Number(fiado.monto_pagado) + monto;
      const nuevoEstado = Number((saldoActual - monto).toFixed(2)) <= 0 ? 'pagado' : fiado.estado;

      const fiadoUpdated = await client.query(
        `UPDATE fiados
         SET monto_pagado = $1,
             estado = $2
         WHERE id_fiado = $3
         RETURNING id_fiado, id_cliente, id_usuario, id_factura, monto_total, monto_pagado, saldo_pendiente,
                   fecha_fiado, fecha_pago_acordada, estado, observaciones`,
        [nuevoMontoPagado, nuevoEstado, id_fiado],
      );

      await client.query('COMMIT');

      return {
        pago: pagoResult.rows[0],
        fiado: fiadoUpdated.rows[0],
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getFiadosAlerts() {
    const paramResult = await this.pool.query(
      `SELECT valor FROM parametros_sistema WHERE clave = 'dias_aviso_fiado' LIMIT 1`,
    );
    const diasAviso = Number(paramResult.rows[0]?.valor || 1);

    const result = await this.pool.query(
      `SELECT f.id_fiado, f.id_cliente, c.nombre AS cliente_nombre, f.monto_total, f.monto_pagado, f.saldo_pendiente,
              f.fecha_pago_acordada, f.estado,
              CASE WHEN f.fecha_pago_acordada < CURRENT_DATE THEN 'vencido' ELSE 'por_vencer' END AS tipo_alerta
       FROM fiados f
       JOIN clientes c ON c.id_cliente = f.id_cliente
       WHERE f.estado = 'pendiente'
         AND f.fecha_pago_acordada <= CURRENT_DATE + ($1::int)
       ORDER BY f.fecha_pago_acordada ASC, f.id_fiado ASC`,
      [diasAviso],
    );

    return { dias_aviso_fiado: diasAviso, items: result.rows };
  }
}

class InMemoryClientRepository {
  constructor({ clients = [], fiados = [], parametros = { dias_aviso_fiado: '1' } } = {}) {
    this.clients = clients.map((c) => ({ ...c }));
    this.fiados = fiados.map((f) => ({ ...f }));
    this.fiadosPagos = [];
    this.parametros = { ...parametros };
    this.nextClientId = this.clients.length ? Math.max(...this.clients.map((c) => c.id_cliente)) + 1 : 1;
    this.nextFiadoId = this.fiados.length ? Math.max(...this.fiados.map((f) => f.id_fiado)) + 1 : 1;
    this.nextPagoId = 1;
  }

  async listClients({ page, size, estado, q }) {
    let filtered = [...this.clients];

    if (typeof estado === 'boolean') {
      filtered = filtered.filter((c) => c.estado === estado);
    }

    if (q) {
      const needle = q.toLowerCase();
      filtered = filtered.filter(
        (c) => c.nombre.toLowerCase().includes(needle) || String(c.documento || '').toLowerCase().includes(needle),
      );
    }

    const offset = (page - 1) * size;
    const items = filtered.slice(offset, offset + size).map(client => {
      const saldo = this.fiados
        .filter((f) => f.id_cliente === client.id_cliente && f.estado === 'pendiente')
        .reduce((acc, f) => acc + Number(f.saldo_pendiente), 0);
      return { ...client, saldo_total_pendiente: Number(saldo.toFixed(2)) };
    });

    return { total: filtered.length, page, size, items };
  }

  async getClientById(idCliente) {
    const client = this.clients.find((c) => c.id_cliente === idCliente);
    if (!client) {
      return null;
    }

    const saldo = this.fiados
      .filter((f) => f.id_cliente === idCliente && f.estado === 'pendiente')
      .reduce((acc, f) => acc + Number(f.saldo_pendiente), 0);

    return { ...client, saldo_total_pendiente: Number(saldo.toFixed(2)) };
  }

  async createClient(payload) {
    const now = new Date().toISOString();
    const created = {
      id_cliente: this.nextClientId++,
      fecha_creacion: now,
      ...payload,
    };
    this.clients.push(created);
    return { ...created };
  }

  async updateClient(idCliente, patch) {
    const index = this.clients.findIndex((c) => c.id_cliente === idCliente);
    if (index < 0) {
      return null;
    }

    this.clients[index] = { ...this.clients[index], ...patch };
    return { ...this.clients[index] };
  }

  async patchClientStatus(idCliente, estado) {
    return this.updateClient(idCliente, { estado });
  }

  async listFiadosByClient(idCliente) {
    return this.fiados.filter((f) => f.id_cliente === idCliente).map((f) => ({ ...f }));
  }

  async createFiado(payload) {
    const now = new Date().toISOString();
    const fiado = {
      id_fiado: this.nextFiadoId++,
      monto_pagado: 0,
      saldo_pendiente: Number(Number(payload.monto_total).toFixed(2)),
      fecha_fiado: now,
      estado: 'pendiente',
      ...payload,
    };

    this.fiados.push(fiado);
    return { ...fiado };
  }

  async registerFiadoPayment({ id_fiado, id_usuario, monto, observaciones }) {
    const index = this.fiados.findIndex((f) => f.id_fiado === id_fiado);
    if (index < 0) {
      throw new AppError(404, 'FIADO_NO_ENCONTRADO', 'Fiado no encontrado');
    }

    const fiado = this.fiados[index];
    if (fiado.estado === 'pagado') {
      throw new AppError(409, 'FIADO_YA_PAGADO', 'El fiado ya se encuentra pagado');
    }

    if (monto > Number(fiado.saldo_pendiente)) {
      throw new AppError(409, 'ABONO_SUPERA_SALDO', 'El monto del abono supera el saldo pendiente');
    }

    const pago = {
      id_pago: this.nextPagoId++,
      id_fiado,
      id_usuario,
      monto: Number(monto.toFixed(2)),
      fecha_pago: new Date().toISOString(),
      observaciones,
    };

    const montoPagado = Number((Number(fiado.monto_pagado) + monto).toFixed(2));
    const saldo = Number((Number(fiado.monto_total) - montoPagado).toFixed(2));
    const estado = saldo <= 0 ? 'pagado' : fiado.estado;

    this.fiados[index] = {
      ...fiado,
      monto_pagado: montoPagado,
      saldo_pendiente: saldo,
      estado,
    };

    this.fiadosPagos.push(pago);

    return {
      pago,
      fiado: { ...this.fiados[index] },
    };
  }

  async getFiadosAlerts() {
    const diasAviso = Number(this.parametros.dias_aviso_fiado || '1');
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const items = this.fiados
      .filter((f) => f.estado === 'pendiente')
      .filter((f) => {
        const dueDate = new Date(`${f.fecha_pago_acordada}T00:00:00Z`);
        const maxDate = new Date(today);
        maxDate.setUTCDate(maxDate.getUTCDate() + diasAviso);
        return dueDate <= maxDate;
      })
      .map((f) => {
        const dueDate = new Date(`${f.fecha_pago_acordada}T00:00:00Z`);
        return {
          id_fiado: f.id_fiado,
          id_cliente: f.id_cliente,
          cliente_nombre: this.clients.find((c) => c.id_cliente === f.id_cliente)?.nombre || null,
          monto_total: f.monto_total,
          monto_pagado: f.monto_pagado,
          saldo_pendiente: f.saldo_pendiente,
          fecha_pago_acordada: f.fecha_pago_acordada,
          estado: f.estado,
          tipo_alerta: dueDate < today ? 'vencido' : 'por_vencer',
        };
      })
      .sort((a, b) => `${a.fecha_pago_acordada}`.localeCompare(`${b.fecha_pago_acordada}`));

    return { dias_aviso_fiado: diasAviso, items };
  }
}

module.exports = { PgClientRepository, InMemoryClientRepository };
