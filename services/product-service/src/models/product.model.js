function createHttpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function toBooleanEstado(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['activo', 'true', '1'].includes(normalized)) {
      return true;
    }
    if (['inactivo', 'false', '0'].includes(normalized)) {
      return false;
    }
  }

  throw createHttpError(400, 'VALIDATION_ERROR', 'estado debe ser activo/inactivo o booleano');
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

function normalizePositiveInteger(value, fieldName) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) {
    throw createHttpError(400, 'VALIDATION_ERROR', `${fieldName} debe ser un entero positivo`);
  }
  return normalized;
}

function normalizeOptionalPositiveInteger(value, fieldName) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return undefined;
  }

  return normalizePositiveInteger(value, fieldName);
}

function normalizePageNumber(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function normalizePrice(value, fieldName) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    throw createHttpError(400, 'VALIDATION_ERROR', `${fieldName} debe ser un nÃºmero mayor o igual a 0`);
  }
  return normalized;
}

function normalizeNonNegativeInteger(value, fieldName) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw createHttpError(
      400,
      'VALIDATION_ERROR',
      `${fieldName} debe ser un entero mayor o igual a 0`
    );
  }

  return normalized;
}

function normalizeBarcode(value) {
  const barcode = normalizeRequiredString(value, 'codigo_barras');
  if (!/^\d{13}$/.test(barcode)) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'codigo_barras debe cumplir formato EAN-13');
  }
  return barcode;
}

function normalizeOptionalDate(value, fieldName) {
  if (typeof value === 'undefined' || value === null || value === '') {
    return undefined;
  }

  const normalized = normalizeTrimmedString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw createHttpError(400, 'VALIDATION_ERROR', `${fieldName} debe tener formato YYYY-MM-DD`);
  }

  return normalized;
}

function readAlias(source, aliases) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(source, alias)) {
      return source[alias];
    }
  }

  return undefined;
}

function validateCreateProductPayload(body) {
  if (!body || typeof body !== 'object') {
    throw createHttpError(400, 'VALIDATION_ERROR', 'El cuerpo de la solicitud es obligatorio');
  }

  const nombre = normalizeRequiredString(readAlias(body, ['nombre', 'name']), 'nombre');
  const codigo_barras = normalizeBarcode(readAlias(body, ['codigo_barras', 'barcode']));
  const id_categoria = normalizePositiveInteger(
    readAlias(body, ['id_categoria', 'categoryId', 'category']),
    'id_categoria'
  );
  const precio_compra = normalizePrice(
    readAlias(body, ['precio_compra', 'purchase_price', 'purchasePrice']),
    'precio_compra'
  );
  const precio_venta = normalizePrice(
    readAlias(body, ['precio_venta', 'sale_price', 'salePrice']),
    'precio_venta'
  );
  const stock_inicial = normalizeNonNegativeInteger(
    readAlias(body, ['stock_inicial', 'stockInicial', 'stock_actual']),
    'stock_inicial'
  );
  const stock_minimo =
    typeof readAlias(body, ['stock_minimo', 'stockMinimo']) === 'undefined'
      ? 0
      : normalizeNonNegativeInteger(readAlias(body, ['stock_minimo', 'stockMinimo']), 'stock_minimo');
  const stock_maximo =
    typeof readAlias(body, ['stock_maximo', 'stockMaximo']) === 'undefined'
      ? null
      : normalizeNonNegativeInteger(readAlias(body, ['stock_maximo', 'stockMaximo']), 'stock_maximo');
  const estado =
    typeof readAlias(body, ['estado']) === 'undefined'
      ? true
      : toBooleanEstado(readAlias(body, ['estado']));
  const id_unidad = normalizeOptionalPositiveInteger(readAlias(body, ['id_unidad']), 'id_unidad');
  const permite_fraccion =
    typeof readAlias(body, ['permite_fraccion']) === 'undefined'
      ? false
      : toBooleanEstado(readAlias(body, ['permite_fraccion']));

  if (typeof stock_maximo === 'number' && stock_maximo < stock_minimo) {
    throw createHttpError(
      400,
      'VALIDATION_ERROR',
      'stock_maximo no puede ser menor que stock_minimo'
    );
  }

  return {
    nombre,
    codigo_barras,
    id_categoria,
    precio_compra,
    precio_venta,
    stock_inicial,
    stock_minimo,
    stock_maximo,
    fecha_vencimiento: normalizeOptionalDate(body.fecha_vencimiento, 'fecha_vencimiento'),
    descripcion: normalizeTrimmedString(body.descripcion) || null,
    estado,
    id_unidad: id_unidad ?? null,
    permite_fraccion,
  };
}

function validateUpdateProductPayload(body) {
  if (!body || typeof body !== 'object') {
    throw createHttpError(400, 'VALIDATION_ERROR', 'El cuerpo de la solicitud es obligatorio');
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'codigo_barras') ||
    Object.prototype.hasOwnProperty.call(body, 'barcode')
  ) {
    throw createHttpError(
      409,
      'PRODUCT_BARCODE_IMMUTABLE',
      'codigo_barras no puede modificarse una vez creado el producto'
    );
  }

  const patch = {};

  if (
    Object.prototype.hasOwnProperty.call(body, 'nombre') ||
    Object.prototype.hasOwnProperty.call(body, 'name')
  ) {
    patch.nombre = normalizeRequiredString(readAlias(body, ['nombre', 'name']), 'nombre');
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'id_categoria') ||
    Object.prototype.hasOwnProperty.call(body, 'categoryId') ||
    Object.prototype.hasOwnProperty.call(body, 'category')
  ) {
    patch.id_categoria = normalizePositiveInteger(
      readAlias(body, ['id_categoria', 'categoryId', 'category']),
      'id_categoria'
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'precio_compra') ||
    Object.prototype.hasOwnProperty.call(body, 'purchase_price') ||
    Object.prototype.hasOwnProperty.call(body, 'purchasePrice')
  ) {
    patch.precio_compra = normalizePrice(
      readAlias(body, ['precio_compra', 'purchase_price', 'purchasePrice']),
      'precio_compra'
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'precio_venta') ||
    Object.prototype.hasOwnProperty.call(body, 'sale_price') ||
    Object.prototype.hasOwnProperty.call(body, 'salePrice')
  ) {
    patch.precio_venta = normalizePrice(
      readAlias(body, ['precio_venta', 'sale_price', 'salePrice']),
      'precio_venta'
    );
  }

  if (Object.prototype.hasOwnProperty.call(body, 'estado')) {
    patch.estado = toBooleanEstado(body.estado);
  }

  if (Object.prototype.hasOwnProperty.call(body, 'stock_actual')) {
    throw createHttpError(
      409,
      'PRODUCT_STOCK_MANAGED_BY_MOVEMENTS',
      'stock_actual solo puede modificarse desde movimientos de inventario'
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'stock_minimo') ||
    Object.prototype.hasOwnProperty.call(body, 'stockMinimo')
  ) {
    patch.stock_minimo = normalizeNonNegativeInteger(
      readAlias(body, ['stock_minimo', 'stockMinimo']),
      'stock_minimo'
    );
  }

  if (
    Object.prototype.hasOwnProperty.call(body, 'stock_maximo') ||
    Object.prototype.hasOwnProperty.call(body, 'stockMaximo')
  ) {
    patch.stock_maximo = normalizeNonNegativeInteger(
      readAlias(body, ['stock_maximo', 'stockMaximo']),
      'stock_maximo'
    );
  }

  if (Object.prototype.hasOwnProperty.call(body, 'fecha_vencimiento')) {
    patch.fecha_vencimiento = normalizeOptionalDate(body.fecha_vencimiento, 'fecha_vencimiento') || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'descripcion')) {
    patch.descripcion = normalizeTrimmedString(body.descripcion) || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'id_unidad')) {
    if (body.id_unidad === null || body.id_unidad === '') {
      patch.id_unidad = null;
    } else {
      patch.id_unidad = normalizePositiveInteger(body.id_unidad, 'id_unidad');
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'permite_fraccion')) {
    patch.permite_fraccion = toBooleanEstado(body.permite_fraccion);
  }

  if (
    typeof patch.stock_minimo === 'number' &&
    typeof patch.stock_maximo === 'number' &&
    patch.stock_maximo < patch.stock_minimo
  ) {
    throw createHttpError(
      400,
      'VALIDATION_ERROR',
      'stock_maximo no puede ser menor que stock_minimo'
    );
  }

  if (Object.keys(patch).length === 0) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'Debe enviar al menos un campo para actualizar');
  }

  return patch;
}

function parseProductId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw createHttpError(400, 'VALIDATION_ERROR', 'id de producto invÃ¡lido');
  }
  return id;
}

function parseListQuery(query = {}) {
  const page = normalizePageNumber(query.page, 1);
  const size = Math.min(20, normalizePageNumber(query.size, 10));
  const name = normalizeTrimmedString(readAlias(query, ['name', 'nombre']));
  const barcode = normalizeTrimmedString(readAlias(query, ['barcode', 'codigo_barras', 'code', 'codigo']));
  const categoryRaw = readAlias(query, ['category', 'id_categoria', 'categoryId']);

  return {
    page,
    size,
    name: name || undefined,
    barcode: barcode || undefined,
    category:
      typeof categoryRaw === 'undefined' || categoryRaw === ''
        ? undefined
        : normalizePositiveInteger(categoryRaw, 'category'),
  };
}

module.exports = {
  createHttpError,
  toBooleanEstado,
  validateCreateProductPayload,
  validateUpdateProductPayload,
  parseProductId,
  parseListQuery,
};
