const { createHttpError, toBooleanEstado } = require('../models/product.model');

function isCategoryActive(category) {
  if (!category) {
    return false;
  }

  try {
    return toBooleanEstado(category.estado);
  } catch (_error) {
    return false;
  }
}

function buildPriceWarning(product) {
  if (!product) {
    return null;
  }

  if (Number(product.precio_venta) < Number(product.precio_compra)) {
    return {
      code: 'SALE_PRICE_BELOW_PURCHASE_PRICE',
      message: 'El precio de venta es menor que el precio de compra',
    };
  }

  return null;
}

function formatProduct(product) {
  if (!product) {
    return null;
  }

  return {
    id: product.id_producto,
    id_producto: product.id_producto,
    codigo: product.codigo_barras_unico || product.codigo_barras,
    codigo_barras: product.codigo_barras_unico || product.codigo_barras,
    nombre: product.nombre,
    categoria: product.nombre_categoria || product.categoria || null,
    id_categoria: product.id_categoria,
    id_unidad:
      product.id_unidad === null || typeof product.id_unidad === 'undefined'
        ? null
        : Number(product.id_unidad),
    permite_fraccion: Boolean(product.permite_fraccion),
    unidad:
      product.unidad_nombre || product.unidad_abreviatura
        ? {
            nombre: product.unidad_nombre || null,
            abreviatura: product.unidad_abreviatura || null,
          }
        : null,
    precio_compra: Number(product.precio_compra),
    precio_venta: Number(product.precio_venta),
    stock_actual: Number(product.stock_actual || 0),
    stock_minimo:
      product.stock_minimo === null || typeof product.stock_minimo === 'undefined'
        ? null
        : Number(product.stock_minimo),
    stock_maximo:
      product.stock_maximo === null || typeof product.stock_maximo === 'undefined'
        ? null
        : Number(product.stock_maximo),
    fecha_vencimiento: product.fecha_vencimiento || null,
    ubicacion: product.ubicacion || null,
    descripcion: product.descripcion || null,
    estado: product.estado,
    fecha_creacion: product.fecha_creacion || null,
  };
}

class ProductService {
  constructor({ repository }) {
    this.repository = repository;
  }

  async validateCategory(idCategoria) {
    const category = await this.repository.getCategoryById(idCategoria);

    if (!category) {
      throw createHttpError(404, 'CATEGORY_NOT_FOUND', 'CategorÃ­a no encontrada');
    }

    if (!isCategoryActive(category)) {
      throw createHttpError(409, 'CATEGORY_INACTIVE', 'La categorÃ­a seleccionada estÃ¡ inactiva');
    }
  }

  async validateUnit(idUnidad) {
    if (typeof idUnidad !== 'number') {
      return;
    }

    const unit = await this.repository.getUnitById(idUnidad);
    if (!unit) {
      throw createHttpError(404, 'UNIT_NOT_FOUND', 'Unidad de medida no encontrada');
    }
  }

  async createProduct(payload) {
    const existing = await this.repository.getProductByBarcode(payload.codigo_barras);
    if (existing) {
      throw createHttpError(409, 'PRODUCT_BARCODE_ALREADY_EXISTS', 'El cÃ³digo de barras ya estÃ¡ registrado');
    }

    await this.validateCategory(payload.id_categoria);
    await this.validateUnit(payload.id_unidad);

    const created = await this.repository.createProduct(payload);
    const createdFull = await this.repository.getProductById(created.id_producto, {
      includeInactive: true,
    });

    return {
      data: formatProduct(createdFull || created),
      warning: buildPriceWarning(createdFull || created),
    };
  }

  async getProductById(idProducto) {
    const product = await this.repository.getProductById(idProducto);
    if (!product) {
      throw createHttpError(404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado');
    }

    return {
      data: formatProduct(product),
      warning: buildPriceWarning(product),
    };
  }

  async listProducts(query) {
    const result = await this.repository.listProducts(query);

    return {
      total: result.total,
      page: result.page,
      size: result.size,
      totalPages: Math.ceil(result.total / result.size) || 1,
      productos: result.items.map((item) => ({
        id: item.id_producto,
        id_producto: item.id_producto,
        codigo_barras: item.codigo_barras_unico || item.codigo_barras,
        nombre: item.nombre,
        categoria: item.nombre_categoria || item.categoria || null,
        unidad:
          item.unidad_nombre || item.unidad_abreviatura
            ? {
                nombre: item.unidad_nombre || null,
                abreviatura: item.unidad_abreviatura || null,
              }
            : null,
        id_unidad:
          item.id_unidad === null || typeof item.id_unidad === 'undefined'
            ? null
            : Number(item.id_unidad),
        permite_fraccion: Boolean(item.permite_fraccion),
        precio_venta: Number(item.precio_venta),
        stock_actual: Number(item.stock_actual || 0),
      })),
    };
  }

  async updateProduct(idProducto, patch) {
    const current = await this.repository.getProductById(idProducto);
    if (!current) {
      throw createHttpError(404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado');
    }

    if (typeof patch.id_categoria === 'number') {
      await this.validateCategory(patch.id_categoria);
    }

    if (typeof patch.id_unidad === 'number') {
      await this.validateUnit(patch.id_unidad);
    }

    await this.repository.updateProductPartial(idProducto, patch);
    const updated = await this.repository.getProductById(idProducto, { includeInactive: true });

    return {
      data: formatProduct(updated),
      warning: buildPriceWarning(updated),
    };
  }

  async deleteProduct(idProducto) {
    const current = await this.repository.getProductById(idProducto);
    if (!current) {
      throw createHttpError(404, 'PRODUCT_NOT_FOUND', 'Producto no encontrado');
    }

    await this.repository.softDeleteProduct(idProducto);
    const deleted = await this.repository.getProductById(idProducto, { includeInactive: true });

    return {
      data: formatProduct(deleted),
      warning: buildPriceWarning(deleted),
    };
  }

  async listUnits() {
    const items = await this.repository.listUnits();
    return {
      unidades: items.map((item) => ({
        id_unidad: Number(item.id_unidad),
        nombre: item.nombre,
        abreviatura: item.abreviatura,
        tipo: item.tipo,
        factor_base:
          item.factor_base === null || typeof item.factor_base === 'undefined'
            ? null
            : Number(item.factor_base),
      })),
    };
  }

  async getUnitById(idUnidad) {
    const unit = await this.repository.getUnitById(idUnidad);
    if (!unit) {
      throw createHttpError(404, 'UNIT_NOT_FOUND', 'Unidad de medida no encontrada');
    }

    return {
      id_unidad: Number(unit.id_unidad),
      nombre: unit.nombre,
      abreviatura: unit.abreviatura,
      tipo: unit.tipo,
      factor_base:
        unit.factor_base === null || typeof unit.factor_base === 'undefined'
          ? null
          : Number(unit.factor_base),
    };
  }
}

module.exports = { ProductService };
