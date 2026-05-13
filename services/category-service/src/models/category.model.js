const { ValidationError } = require('../../../../shared/middlewares/errorHandler');

const FILTER_VALUES = new Set(['activo', 'inactivo', 'todos']);

function normalizeStringField(value, fieldName, { required = false } = {}) {
  if (value === undefined) {
    if (required) {
      throw new ValidationError(`El campo ${fieldName} es obligatorio`);
    }

    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ValidationError(`El campo ${fieldName} debe ser texto`);
  }

  const normalized = value.trim();
  if (required && !normalized) {
    throw new ValidationError(`El campo ${fieldName} es obligatorio`);
  }

  return normalized;
}

function normalizeDescripcion(value) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== 'string') {
    throw new ValidationError('El campo descripcion debe ser texto');
  }

  return value.trim();
}

function normalizeEstadoValue(value) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    throw new ValidationError('El campo estado debe ser activo o inactivo');
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'activo') {
    return true;
  }

  if (normalized === 'inactivo') {
    return false;
  }

  throw new ValidationError('El campo estado debe ser activo o inactivo');
}

function validateCreateCategoryPayload(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('El cuerpo de la solicitud es obligatorio');
  }

  return {
    nombre_categoria: normalizeStringField(body.nombre_categoria, 'nombre_categoria', {
      required: true,
    }),
    descripcion: normalizeDescripcion(body.descripcion) ?? null,
  };
}

function validateUpdateCategoryPayload(body) {
  if (!body || typeof body !== 'object') {
    throw new ValidationError('El cuerpo de la solicitud es obligatorio');
  }

  const payload = {
    nombre_categoria: normalizeStringField(body.nombre_categoria, 'nombre_categoria'),
    descripcion: normalizeDescripcion(body.descripcion),
    estado: normalizeEstadoValue(body.estado),
  };

  if (
    payload.nombre_categoria === undefined &&
    payload.descripcion === undefined &&
    payload.estado === undefined
  ) {
    throw new ValidationError(
      'Debe enviar al menos uno de estos campos: nombre_categoria, descripcion o estado'
    );
  }

  return payload;
}

function validateCategoryFilter(value) {
  if (value === undefined) {
    return 'activo';
  }

  if (typeof value !== 'string') {
    throw new ValidationError('El parametro estado debe ser activo, inactivo o todos');
  }

  const normalized = value.trim().toLowerCase();
  if (!FILTER_VALUES.has(normalized)) {
    throw new ValidationError('El parametro estado debe ser activo, inactivo o todos');
  }

  return normalized;
}

function parseCategoryId(rawId) {
  const id = Number.parseInt(rawId, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError('El id de la categoria debe ser un entero positivo');
  }

  return id;
}

function mapCategoryRow(category) {
  if (!category) {
    return null;
  }

  return {
    id: category.id_categoria,
    nombre_categoria: category.nombre_categoria,
    descripcion: category.descripcion,
    estado: category.estado ? 'activo' : 'inactivo',
  };
}

module.exports = {
  validateCreateCategoryPayload,
  validateUpdateCategoryPayload,
  validateCategoryFilter,
  parseCategoryId,
  mapCategoryRow,
};
