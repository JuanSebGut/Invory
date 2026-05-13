'use strict';

function createHttpError(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.statusCode = status;
  error.code = code;
  if (details !== undefined) {
    error.details = details;
  }
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

function normalizeRequiredString(value, fieldName) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw createHttpError(400, 'VALIDATION_ERROR', `${fieldName} es obligatorio`);
  }
  return normalized;
}

function normalizeOptionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeEmail(value) {
  const normalized = normalizeOptionalString(value);
  if (normalized === null) {
    return null;
  }

  const lower = normalized.toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(lower)) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'correo_electronico debe tener un formato valido');
  }

  return lower;
}

function normalizeEstadoBody(value, fieldName = 'estado') {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'activo' || normalized === 'true') {
      return true;
    }
    if (normalized === 'inactivo' || normalized === 'false') {
      return false;
    }
  }

  throw createHttpError(400, 'VALIDATION_ERROR', `${fieldName} debe ser activo o inactivo`);
}

function normalizeEstadoQuery(value) {
  if (value === undefined || value === null || value === '' || value === 'todos') {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value ? 'activo' : 'inactivo';
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'activo' || normalized === 'inactivo') {
    return normalized;
  }
  if (normalized === 'true') {
    return 'activo';
  }
  if (normalized === 'false') {
    return 'inactivo';
  }

  throw createHttpError(400, 'VALIDATION_ERROR', 'estado debe ser activo o inactivo');
}

function normalizePositiveInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createHttpError(400, 'VALIDATION_ERROR', `${fieldName} invalido`);
  }
  return parsed;
}

function validateEmailOptional(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }

  return normalizeEmail(value);
}

function validateCreateSupplierPayload(body) {
  if (!body || typeof body !== 'object') {
    throw createHttpError(400, 'VALIDATION_ERROR', 'El cuerpo de la solicitud es obligatorio');
  }

  const nombre_razon_social = normalizeRequiredString(
    readAlias(body, ['nombre_razon_social', 'razon_social', 'nombreRazonSocial']),
    'nombre_razon_social'
  );
  const nit_identificacion = normalizeRequiredString(
    readAlias(body, ['nit_identificacion', 'nit', 'nitIdentificacion']),
    'nit_identificacion'
  );

  const correo_electronico = validateEmailOptional(
    readAlias(body, ['correo_electronico', 'correo', 'email'])
  );

  const estado = normalizeEstadoBody(
    readAlias(body, ['estado']) ?? true,
    'estado'
  );

  return {
    nombre_razon_social,
    nit_identificacion,
    telefono: normalizeOptionalString(readAlias(body, ['telefono'])),
    direccion: normalizeOptionalString(readAlias(body, ['direccion'])),
    correo_electronico,
    correo: correo_electronico,
    estado,
  };
}

function validateUpdateSupplierPayload(body) {
  if (!body || typeof body !== 'object') {
    throw createHttpError(400, 'VALIDATION_ERROR', 'El cuerpo de la solicitud es obligatorio');
  }

  const patch = {};

  if (Object.prototype.hasOwnProperty.call(body, 'nombre_razon_social') ||
      Object.prototype.hasOwnProperty.call(body, 'razon_social') ||
      Object.prototype.hasOwnProperty.call(body, 'nombreRazonSocial')) {
    patch.nombre_razon_social = normalizeRequiredString(
      readAlias(body, ['nombre_razon_social', 'razon_social', 'nombreRazonSocial']),
      'nombre_razon_social'
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'nit_identificacion') ||
    Object.prototype.hasOwnProperty.call(body, 'nit') ||
    Object.prototype.hasOwnProperty.call(body, 'nitIdentificacion')
  ) {
    patch.nit_identificacion = normalizeRequiredString(
      readAlias(body, ['nit_identificacion', 'nit', 'nitIdentificacion']),
      'nit_identificacion'
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'correo_electronico') ||
    Object.prototype.hasOwnProperty.call(body, 'correo') ||
    Object.prototype.hasOwnProperty.call(body, 'email')
  ) {
    patch.correo_electronico = validateEmailOptional(
      readAlias(body, ['correo_electronico', 'correo', 'email'])
    );
    patch.correo = patch.correo_electronico;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'telefono')) {
    patch.telefono = normalizeOptionalString(body.telefono);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'direccion')) {
    patch.direccion = normalizeOptionalString(body.direccion);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'estado')) {
    patch.estado = normalizeEstadoBody(body.estado, 'estado');
  }

  if (Object.keys(patch).length === 0) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'Debe enviar al menos un campo para actualizar');
  }

  return patch;
}

function parseSupplierId(value) {
  return normalizePositiveInteger(value, 'id_proveedor');
}

function parseListQuery(query = {}) {
  const hasPage = Object.prototype.hasOwnProperty.call(query, 'page');
  const hasSize = Object.prototype.hasOwnProperty.call(query, 'size');
  const estado = normalizeEstadoQuery(query.estado);

  const page = hasPage ? normalizePositiveInteger(query.page, 'page') : 1;
  const size = hasSize ? Math.min(100, normalizePositiveInteger(query.size, 'size')) : 10;
  const paginate = !(estado === 'activo' && !hasPage && !hasSize);

  return { page, size, estado, paginate };
}

function formatSupplier(row) {
  if (!row) {
    return null;
  }

  const estado =
    row.estado === true || String(row.estado).toLowerCase() === 'activo' ? 'activo' : 'inactivo';

  return {
    id: row.id_proveedor,
    id_proveedor: row.id_proveedor,
    nombre_razon_social: row.razon_social || row.nombre_razon_social || null,
    razon_social: row.razon_social || row.nombre_razon_social || null,
    nit: row.nit_identificacion || row.nit || null,
    nit_identificacion: row.nit_identificacion || row.nit || null,
    telefono: row.telefono || null,
    direccion: row.direccion || null,
    correo: row.correo || row.correo_electronico || null,
    correo_electronico: row.correo || row.correo_electronico || null,
    estado,
  };
}

module.exports = {
  createHttpError,
  formatSupplier,
  normalizeEstadoBody,
  normalizeEstadoQuery,
  parseListQuery,
  parseSupplierId,
  validateCreateSupplierPayload,
  validateUpdateSupplierPayload,
};
