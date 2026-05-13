function createHttpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function normalizeRequiredString(value, fieldName) {
  const normalized = typeof value === 'string' ? value.trim() : String(value || '').trim();
  if (!normalized) {
    throw createHttpError(400, 'VALIDATION_ERROR', `${fieldName} es obligatorio`);
  }

  return normalized;
}

function normalizeOptionalString(value) {
  if (typeof value === 'undefined' || value === null) {
    return undefined;
  }

  const normalized = String(value).trim();
  return normalized || undefined;
}

function normalizePositiveInteger(value, fieldName) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return undefined;
  }

  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createHttpError(400, 'VALIDATION_ERROR', `${fieldName} debe ser un entero positivo`);
  }

  return normalized;
}

function normalizeObject(value, fieldName, { required = false } = {}) {
  if (typeof value === 'undefined' || value === null) {
    if (required) {
      throw createHttpError(400, 'VALIDATION_ERROR', `${fieldName} es obligatorio`);
    }

    return undefined;
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw createHttpError(400, 'VALIDATION_ERROR', `${fieldName} debe ser un objeto`);
  }

  return value;
}

function normalizeOptionalDate(value, fieldName) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return undefined;
  }

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

function parseAuditEventPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'El cuerpo de la solicitud es obligatorio');
  }

  const userPayload = normalizeObject(body.user, 'user');

  return {
    action: normalizeRequiredString(body.action || body.tipo_operacion || body.tipo_op, 'action')
      .toLowerCase(),
    module: normalizeRequiredString(body.module || body.modulo, 'module').toLowerCase(),
    entity: normalizeRequiredString(
      body.entity || body.entidad_afectada || body.entidad,
      'entity'
    ).toLowerCase(),
    entityId: normalizePositiveInteger(
      body.entityId || body.id_entidad || body.id_entidad_afectada,
      'entityId'
    ),
    user: userPayload
      ? {
          id_usuario: normalizePositiveInteger(userPayload.id_usuario, 'user.id_usuario'),
          nombre: normalizeOptionalString(userPayload.nombre),
          rol: normalizeOptionalString(userPayload.rol),
        }
      : undefined,
    detail: normalizeObject(body.detail || body.detalle, 'detail') || {},
    previousData:
      normalizeObject(body.previousData || body.datos_previos, 'previousData') || undefined,
    newData: normalizeObject(body.newData || body.datos_nuevos, 'newData') || undefined,
    sessionId: normalizeOptionalString(body.sessionId || body.id_sesion),
  };
}

function parseLogFilters(query = {}) {
  const page = Math.max(1, Number(query.page || 1));
  const size = Math.min(100, Math.max(1, Number(query.size || 10)));
  const exactDate = normalizeOptionalDate(query.fecha, 'fecha');
  const dateFrom = normalizeOptionalDate(query.fecha_inicio, 'fecha_inicio');
  const dateTo = normalizeOptionalDate(query.fecha_fin, 'fecha_fin');

  if (!exactDate && dateFrom && dateTo && dateFrom > dateTo) {
    throw createHttpError(
      400,
      'VALIDATION_ERROR',
      'fecha_inicio no puede ser mayor a fecha_fin'
    );
  }

  return {
    page,
    size,
    exactDate,
    dateFrom: exactDate ? undefined : dateFrom,
    dateTo: exactDate ? undefined : dateTo,
    user: normalizeOptionalString(query.usuario),
    module: normalizeOptionalString(query.modulo)?.toLowerCase(),
    action: normalizeOptionalString(query.accion || query.tipo_op)?.toLowerCase(),
  };
}

module.exports = {
  createHttpError,
  parseAuditEventPayload,
  parseLogFilters,
};
