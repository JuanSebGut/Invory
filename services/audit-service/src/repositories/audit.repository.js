function parseStoredValue(value) {
  if (value === null || typeof value === 'undefined') {
    return null;
  }

  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
}

function serializeStoredValue(value) {
  if (value === null || typeof value === 'undefined') {
    return null;
  }

  return JSON.stringify(value);
}

function buildDetailRows(previousData = {}, newData = {}) {
  const keys = new Set([
    ...Object.keys(previousData || {}),
    ...Object.keys(newData || {}),
  ]);

  return [...keys].map((key) => ({
    campo_modificado: key,
    valor_anterior: serializeStoredValue(previousData?.[key]),
    valor_nuevo: serializeStoredValue(newData?.[key]),
  }));
}

function normalizeTimestamp(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function formatLogRecord(record) {
  const previousData = {};
  const newData = {};

  for (const detail of record.details || []) {
    if (detail.valor_anterior !== null) {
      previousData[detail.campo_modificado] = parseStoredValue(detail.valor_anterior);
    }

    if (detail.valor_nuevo !== null) {
      newData[detail.campo_modificado] = parseStoredValue(detail.valor_nuevo);
    }
  }

  const hasPreviousData = Object.keys(previousData).length > 0;
  const hasNewData = Object.keys(newData).length > 0;

  return {
    id_log: record.id_auditoria,
    accion: record.accion,
    modulo: record.modulo,
    entidad: record.entidad_afectada,
    id_entidad: record.id_entidad_afectada || null,
    fecha: normalizeTimestamp(record.fecha_hora),
    usuario:
      record.id_usuario || record.usuario_nombre || record.rol_usuario
        ? {
            id_usuario: record.id_usuario || null,
            nombre: record.usuario_nombre || null,
            rol: record.rol_usuario || null,
          }
        : null,
    detalle: record.detalle || {},
    datos_previos: hasPreviousData ? previousData : null,
    datos_nuevos: hasNewData ? newData : null,
    id_sesion: record.id_sesion || null,
  };
}

class PgAuditRepository {
  constructor({ pool }) {
    this.pool = pool;
  }

  async ensureSchema() {
    await this.pool.query(`
      ALTER TABLE public.auditoria_operaciones
        ALTER COLUMN id_usuario DROP NOT NULL,
        ALTER COLUMN id_entidad_afectada DROP NOT NULL;

      ALTER TABLE public.auditoria_operaciones
        ADD COLUMN IF NOT EXISTS usuario_nombre character varying(150),
        ADD COLUMN IF NOT EXISTS rol_usuario character varying(50),
        ADD COLUMN IF NOT EXISTS modulo character varying(50) NOT NULL DEFAULT 'general',
        ADD COLUMN IF NOT EXISTS detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS id_sesion character varying(120);

      CREATE INDEX IF NOT EXISTS auditoria_operaciones_fecha_hora_idx
        ON public.auditoria_operaciones (fecha_hora DESC);

      CREATE INDEX IF NOT EXISTS auditoria_operaciones_id_usuario_idx
        ON public.auditoria_operaciones (id_usuario);

      CREATE INDEX IF NOT EXISTS auditoria_operaciones_modulo_idx
        ON public.auditoria_operaciones (modulo);
    `);
  }

  async runInTransaction(handler) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await handler(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async ensureActionId(action, client) {
    const { rows } = await client.query(
      `
        INSERT INTO acciones_auditoria (nombre_accion)
        VALUES ($1)
        ON CONFLICT (nombre_accion)
        DO UPDATE SET nombre_accion = EXCLUDED.nombre_accion
        RETURNING id_accion
      `,
      [action]
    );

    return rows[0].id_accion;
  }

  async createAuditLog(event) {
    const details = buildDetailRows(event.previousData, event.newData);

    const persisted = await this.runInTransaction(async (client) => {
      const actionId = await this.ensureActionId(event.action, client);
      const { rows } = await client.query(
        `
          INSERT INTO auditoria_operaciones (
            id_usuario,
            usuario_nombre,
            rol_usuario,
            id_accion,
            modulo,
            entidad_afectada,
            id_entidad_afectada,
            fecha_hora,
            detalle,
            id_sesion
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8::jsonb, $9)
          RETURNING
            id_auditoria,
            id_usuario,
            usuario_nombre,
            rol_usuario,
            modulo,
            entidad_afectada,
            id_entidad_afectada,
            fecha_hora,
            detalle,
            id_sesion
        `,
        [
          event.user?.id_usuario || null,
          event.user?.nombre || null,
          event.user?.rol || null,
          actionId,
          event.module,
          event.entity,
          event.entityId || null,
          JSON.stringify(event.detail || {}),
          event.sessionId || null,
        ]
      );

      const operation = rows[0];
      for (const detail of details) {
        await client.query(
          `
            INSERT INTO auditoria_detalles (
              id_auditoria,
              campo_modificado,
              valor_anterior,
              valor_nuevo
            )
            VALUES ($1, $2, $3, $4)
          `,
          [
            operation.id_auditoria,
            detail.campo_modificado,
            detail.valor_anterior,
            detail.valor_nuevo,
          ]
        );
      }

      return {
        ...operation,
        accion: event.action,
        details,
      };
    });

    return formatLogRecord(persisted);
  }

  async listLogs(filters = {}) {
    const params = [];
    const where = [];

    if (filters.exactDate) {
      params.push(filters.exactDate);
      where.push(`DATE(o.fecha_hora) = $${params.length}`);
    } else {
      if (filters.dateFrom) {
        params.push(filters.dateFrom);
        where.push(`o.fecha_hora >= $${params.length}`);
      }

      if (filters.dateTo) {
        params.push(filters.dateTo);
        where.push(`o.fecha_hora < ($${params.length}::date + INTERVAL '1 day')`);
      }
    }

    if (filters.module) {
      params.push(filters.module);
      where.push(`LOWER(o.modulo) = LOWER($${params.length})`);
    }

    if (filters.action) {
      params.push(filters.action);
      where.push(`LOWER(a.nombre_accion) = LOWER($${params.length})`);
    }

    if (filters.user) {
      const numericUser = Number(filters.user);
      if (Number.isInteger(numericUser) && numericUser > 0) {
        params.push(numericUser);
        where.push(`o.id_usuario = $${params.length}`);
      } else {
        params.push(`%${filters.user}%`);
        where.push(`LOWER(COALESCE(o.usuario_nombre, '')) LIKE LOWER($${params.length})`);
      }
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM auditoria_operaciones o
      JOIN acciones_auditoria a ON a.id_accion = o.id_accion
      ${whereClause}
    `;
    const countResult = await this.pool.query(countQuery, params);
    const total = countResult.rows[0]?.total || 0;

    const offset = (filters.page - 1) * filters.size;
    const listParams = [...params, filters.size, offset];
    const listQuery = `
      SELECT
        o.id_auditoria,
        o.id_usuario,
        o.usuario_nombre,
        o.rol_usuario,
        o.modulo,
        o.entidad_afectada,
        o.id_entidad_afectada,
        o.fecha_hora,
        o.detalle,
        o.id_sesion,
        a.nombre_accion AS accion
      FROM auditoria_operaciones o
      JOIN acciones_auditoria a ON a.id_accion = o.id_accion
      ${whereClause}
      ORDER BY o.fecha_hora DESC, o.id_auditoria DESC
      LIMIT $${listParams.length - 1}
      OFFSET $${listParams.length}
    `;
    const { rows } = await this.pool.query(listQuery, listParams);

    const auditIds = rows.map((row) => row.id_auditoria);
    let detailsByAuditId = new Map();

    if (auditIds.length > 0) {
      const detailsResult = await this.pool.query(
        `
          SELECT
            id_auditoria,
            campo_modificado,
            valor_anterior,
            valor_nuevo
          FROM auditoria_detalles
          WHERE id_auditoria = ANY($1::int[])
          ORDER BY id_detalle ASC
        `,
        [auditIds]
      );

      detailsByAuditId = detailsResult.rows.reduce((map, row) => {
        const current = map.get(row.id_auditoria) || [];
        current.push(row);
        map.set(row.id_auditoria, current);
        return map;
      }, new Map());
    }

    return {
      total,
      page: filters.page,
      size: filters.size,
      items: rows.map((row) =>
        formatLogRecord({
          ...row,
          details: detailsByAuditId.get(row.id_auditoria) || [],
        })
      ),
    };
  }
}

class InMemoryAuditRepository {
  constructor({ logs = [] } = {}) {
    this.logs = logs.map((log) => ({
      ...log,
      detalle: log.detalle ? JSON.parse(JSON.stringify(log.detalle)) : {},
      details: (log.details || []).map((detail) => ({ ...detail })),
    }));
    this.nextId =
      this.logs.length > 0
        ? Math.max(...this.logs.map((log) => log.id_auditoria || 0)) + 1
        : 1;
  }

  async ensureSchema() {}

  async createAuditLog(event) {
    const record = {
      id_auditoria: this.nextId,
      id_usuario: event.user?.id_usuario || null,
      usuario_nombre: event.user?.nombre || null,
      rol_usuario: event.user?.rol || null,
      accion: event.action,
      modulo: event.module,
      entidad_afectada: event.entity,
      id_entidad_afectada: event.entityId || null,
      fecha_hora: new Date().toISOString(),
      detalle: JSON.parse(JSON.stringify(event.detail || {})),
      id_sesion: event.sessionId || null,
      details: buildDetailRows(event.previousData, event.newData),
    };

    this.logs.push(record);
    this.nextId += 1;

    return formatLogRecord(record);
  }

  async listLogs(filters = {}) {
    const filtered = this.logs
      .filter((record) => {
        const isoDate = normalizeTimestamp(record.fecha_hora).slice(0, 10);

        if (filters.exactDate && isoDate !== filters.exactDate) {
          return false;
        }

        if (filters.dateFrom && isoDate < filters.dateFrom) {
          return false;
        }

        if (filters.dateTo && isoDate > filters.dateTo) {
          return false;
        }

        if (filters.module && String(record.modulo).toLowerCase() !== filters.module) {
          return false;
        }

        if (filters.action && String(record.accion).toLowerCase() !== filters.action) {
          return false;
        }

        if (filters.user) {
          const numericUser = Number(filters.user);
          if (Number.isInteger(numericUser) && numericUser > 0) {
            if (Number(record.id_usuario) !== numericUser) {
              return false;
            }
          } else if (
            !String(record.usuario_nombre || '')
              .toLowerCase()
              .includes(String(filters.user).toLowerCase())
          ) {
            return false;
          }
        }

        return true;
      })
      .sort((left, right) => {
        const byDate = new Date(right.fecha_hora).getTime() - new Date(left.fecha_hora).getTime();
        if (byDate !== 0) {
          return byDate;
        }

        return right.id_auditoria - left.id_auditoria;
      });

    const offset = (filters.page - 1) * filters.size;

    return {
      total: filtered.length,
      page: filters.page,
      size: filters.size,
      items: filtered.slice(offset, offset + filters.size).map((record) => formatLogRecord(record)),
    };
  }
}

module.exports = {
  PgAuditRepository,
  InMemoryAuditRepository,
};
