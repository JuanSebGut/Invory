class PgProductRepository {
  constructor(pool) {
    this.pool = pool;
  }

  async createProduct({
    id_categoria,
    nombre,
    codigo_barras,
    precio_compra,
    precio_venta,
    stock_inicial,
    stock_minimo,
    stock_maximo,
    fecha_vencimiento,
    ubicacion,
    descripcion,
    estado,
  }) {
    const query = `
      INSERT INTO productos (
        id_categoria,
        codigo_barras_unico,
        nombre,
        precio_compra,
        precio_venta,
        stock_actual,
        stock_minimo,
        stock_maximo,
        fecha_vencimiento,
        estado,
        ubicacion,
        descripcion
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING
        id_producto,
        id_categoria,
        codigo_barras_unico,
        nombre,
        precio_compra,
        precio_venta,
        stock_actual,
        stock_minimo,
        stock_maximo,
        fecha_vencimiento,
        estado,
        fecha_creacion,
        ubicacion,
        descripcion
    `;

    const { rows } = await this.pool.query(query, [
      id_categoria,
      codigo_barras,
      nombre,
      precio_compra,
      precio_venta,
      stock_inicial,
      stock_minimo,
      stock_maximo,
      fecha_vencimiento,
      estado,
      ubicacion,
      descripcion,
    ]);

    return rows[0] || null;
  }

  async getProductById(idProducto, { includeInactive = false } = {}) {
    const params = [idProducto];
    const filters = ['p.id_producto = $1'];

    if (!includeInactive) {
      filters.push('p.estado = true');
    }

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
        p.fecha_creacion,
        p.ubicacion,
        p.descripcion,
        c.nombre_categoria
      FROM productos p
      JOIN categorias c ON c.id_categoria = p.id_categoria
      WHERE ${filters.join(' AND ')}
      LIMIT 1
    `;

    const { rows } = await this.pool.query(query, params);
    return rows[0] || null;
  }

  async getProductByBarcode(codigoBarras) {
    const query = `
      SELECT
        id_producto,
        id_categoria,
        codigo_barras_unico,
        nombre,
        precio_compra,
        precio_venta,
        stock_actual,
        stock_minimo,
        stock_maximo,
        fecha_vencimiento,
        estado,
        fecha_creacion,
        ubicacion,
        descripcion
      FROM productos
      WHERE codigo_barras_unico = $1
      LIMIT 1
    `;

    const { rows } = await this.pool.query(query, [codigoBarras]);
    return rows[0] || null;
  }

  async getCategoryById(idCategoria) {
    const query = `
      SELECT *
      FROM categorias
      WHERE id_categoria = $1
      LIMIT 1
    `;

    const { rows } = await this.pool.query(query, [idCategoria]);
    return rows[0] || null;
  }

  async listProducts({ page, size, name, category, barcode, code }) {
    const offset = (page - 1) * size;
    const filters = ['p.estado = true'];
    const params = [];

    if (name) {
      params.push(`%${name}%`);
      filters.push(`LOWER(p.nombre) LIKE LOWER($${params.length})`);
    }

    if (typeof category === 'number') {
      params.push(category);
      filters.push(`p.id_categoria = $${params.length}`);
    }

    const barcodeFilter = barcode || code;
    if (barcodeFilter) {
      params.push(`%${barcodeFilter}%`);
      filters.push(`p.codigo_barras_unico LIKE $${params.length}`);
    }

    const whereClause = `WHERE ${filters.join(' AND ')}`;
    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int AS total FROM productos p ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    params.push(size);
    params.push(offset);

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
        p.fecha_creacion,
        p.ubicacion,
        p.descripcion,
        c.nombre_categoria
      FROM productos p
      JOIN categorias c ON c.id_categoria = p.id_categoria
      ${whereClause}
      ORDER BY p.id_producto ASC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}
    `;

    const { rows } = await this.pool.query(query, params);
    return { total, page, size, items: rows };
  }

  async updateProductPartial(idProducto, patch = {}) {
    const mapping = {
      id_categoria: 'id_categoria',
      nombre: 'nombre',
      precio_compra: 'precio_compra',
      precio_venta: 'precio_venta',
      stock_minimo: 'stock_minimo',
      stock_maximo: 'stock_maximo',
      fecha_vencimiento: 'fecha_vencimiento',
      estado: 'estado',
      ubicacion: 'ubicacion',
      descripcion: 'descripcion',
    };

    const updates = [];
    const values = [];

    Object.entries(patch).forEach(([key, value]) => {
      const column = mapping[key];
      if (!column) {
        return;
      }

      values.push(value);
      updates.push(`${column} = $${values.length}`);
    });

    if (updates.length === 0) {
      return this.getProductById(idProducto, { includeInactive: true });
    }

    values.push(idProducto);

    const query = `
      UPDATE productos
      SET ${updates.join(', ')}
      WHERE id_producto = $${values.length}
      RETURNING
        id_producto,
        id_categoria,
        codigo_barras_unico,
        nombre,
        precio_compra,
        precio_venta,
        stock_actual,
        stock_minimo,
        stock_maximo,
        fecha_vencimiento,
        estado,
        fecha_creacion,
        ubicacion,
        descripcion
    `;

    const { rows } = await this.pool.query(query, values);
    return rows[0] || null;
  }

  async softDeleteProduct(idProducto) {
    return this.updateProductPartial(idProducto, { estado: false });
  }
}

class InMemoryProductRepository {
  constructor({ products = [], categories = [] } = {}) {
    this.products = products.map((product) => ({ ...product }));
    this.categories = categories.map((category) => ({ ...category }));
    this.nextId =
      this.products.length > 0
        ? Math.max(...this.products.map((product) => product.id_producto || 0)) + 1
        : 1;
  }

  async createProduct(payload) {
    const product = {
      id_producto: this.nextId,
      ...payload,
      stock_actual:
        typeof payload.stock_inicial === 'number' ? payload.stock_inicial : payload.stock_actual || 0,
    };

    this.products.push(product);
    this.nextId += 1;
    return { ...product };
  }

  async getProductById(idProducto, { includeInactive = false } = {}) {
    const product = this.products.find(
      (item) => item.id_producto === idProducto && (includeInactive || item.estado === true)
    );

    if (!product) {
      return null;
    }

    const categoryItem = this.categories.find((entry) => entry.id_categoria === product.id_categoria);
    return {
      ...product,
      nombre_categoria: categoryItem?.nombre_categoria || categoryItem?.nombre || null,
    };
  }

  async getProductByBarcode(codigoBarras) {
    const product = this.products.find(
      (item) => (item.codigo_barras_unico || item.codigo_barras) === codigoBarras
    );
    return product ? { ...product } : null;
  }

  async getCategoryById(idCategoria) {
    const category = this.categories.find((item) => item.id_categoria === idCategoria);
    return category ? { ...category } : null;
  }

  async listProducts({ page, size, name, category, barcode, code }) {
    const filtered = this.products.filter((item) => {
      if (item.estado !== true) {
        return false;
      }

      if (name && !String(item.nombre).toLowerCase().includes(String(name).toLowerCase())) {
        return false;
      }

      if (typeof category === 'number' && item.id_categoria !== category) {
        return false;
      }

      if (
        (barcode || code) &&
        !String(item.codigo_barras_unico || item.codigo_barras)
          .toLowerCase()
          .includes(String(barcode || code).toLowerCase())
      ) {
        return false;
      }

      return true;
    });

    const offset = (page - 1) * size;

    return {
      total: filtered.length,
      page,
      size,
      items: filtered.slice(offset, offset + size).map((item) => {
        const categoryItem = this.categories.find((entry) => entry.id_categoria === item.id_categoria);
        return {
          ...item,
          nombre_categoria: categoryItem?.nombre_categoria || categoryItem?.nombre || null,
        };
      }),
    };
  }

  async updateProductPartial(idProducto, patch = {}) {
    const index = this.products.findIndex((item) => item.id_producto === idProducto);
    if (index < 0) {
      return null;
    }

    this.products[index] = { ...this.products[index], ...patch };
    return { ...this.products[index] };
  }

  async softDeleteProduct(idProducto) {
    return this.updateProductPartial(idProducto, { estado: false });
  }

  async getRawById(idProducto) {
    return this.products.find((item) => item.id_producto === idProducto) || null;
  }
}

module.exports = {
  PgProductRepository,
  InMemoryProductRepository,
};
