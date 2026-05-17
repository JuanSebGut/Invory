class PgProductRepository {
  constructor(pool) {
    this.pool = pool;
    this._schemaSupport = null;
  }

  async getSchemaSupport() {
    if (this._schemaSupport) {
      return this._schemaSupport;
    }

    const [tableResult, columnsResult] = await Promise.all([
      this.pool.query(
        `
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = 'unidades_medida'
          ) AS has_units_table
        `
      ),
      this.pool.query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'productos'
            AND column_name IN ('id_unidad', 'permite_fraccion')
        `
      ),
    ]);

    const columnNames = new Set(columnsResult.rows.map((row) => row.column_name));
    this._schemaSupport = {
      hasUnitsTable: Boolean(tableResult.rows[0]?.has_units_table),
      hasProductUnitColumns:
        columnNames.has('id_unidad') && columnNames.has('permite_fraccion'),
    };

    return this._schemaSupport;
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
    id_unidad,
    permite_fraccion,
  }) {
    const support = await this.getSchemaSupport();
    const columns = [
      'id_categoria',
      'codigo_barras_unico',
      'nombre',
      'precio_compra',
      'precio_venta',
      'stock_actual',
      'stock_minimo',
      'stock_maximo',
      'fecha_vencimiento',
      'estado',
      'ubicacion',
      'descripcion',
    ];

    const values = [
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
    ];

    if (support.hasProductUnitColumns) {
      columns.splice(10, 0, 'id_unidad', 'permite_fraccion');
      values.splice(10, 0, id_unidad, permite_fraccion);
    }

    const placeholders = values.map((_value, index) => `$${index + 1}`).join(', ');
    const query = `
      INSERT INTO productos (
        ${columns.join(',\n        ')}
      )
      VALUES (${placeholders})
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
        ${
          support.hasProductUnitColumns
            ? 'id_unidad,'
            : 'NULL::int AS id_unidad,'
        }
        ${
          support.hasProductUnitColumns
            ? 'permite_fraccion,'
            : 'false::boolean AS permite_fraccion,'
        }
        fecha_creacion,
        ubicacion,
        descripcion
    `;

    const { rows } = await this.pool.query(query, values);

    return rows[0] || null;
  }

  async getProductById(idProducto, { includeInactive = false } = {}) {
    const support = await this.getSchemaSupport();
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
        ${
          support.hasProductUnitColumns
            ? 'p.id_unidad,'
            : 'NULL::int AS id_unidad,'
        }
        ${
          support.hasProductUnitColumns
            ? 'p.permite_fraccion,'
            : 'false::boolean AS permite_fraccion,'
        }
        p.fecha_creacion,
        p.ubicacion,
        p.descripcion,
        c.nombre_categoria,
        ${
          support.hasProductUnitColumns && support.hasUnitsTable
            ? 'u.nombre AS unidad_nombre, u.abreviatura AS unidad_abreviatura'
            : 'NULL::text AS unidad_nombre, NULL::text AS unidad_abreviatura'
        }
      FROM productos p
      JOIN categorias c ON c.id_categoria = p.id_categoria
      ${
        support.hasProductUnitColumns && support.hasUnitsTable
          ? 'LEFT JOIN unidades_medida u ON u.id_unidad = p.id_unidad'
          : ''
      }
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

  async getUnitById(idUnidad) {
    const support = await this.getSchemaSupport();
    if (!support.hasUnitsTable) {
      return null;
    }

    const query = `
      SELECT id_unidad, nombre, abreviatura, tipo, factor_base
      FROM unidades_medida
      WHERE id_unidad = $1
      LIMIT 1
    `;

    const { rows } = await this.pool.query(query, [idUnidad]);
    return rows[0] || null;
  }

  async listUnits() {
    const support = await this.getSchemaSupport();
    if (!support.hasUnitsTable) {
      return [];
    }

    const query = `
      SELECT id_unidad, nombre, abreviatura, tipo, factor_base
      FROM unidades_medida
      ORDER BY id_unidad ASC
    `;

    const { rows } = await this.pool.query(query);
    return rows;
  }

  async listProducts({ page, size, name, category, barcode, code }) {
    const support = await this.getSchemaSupport();
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
        ${
          support.hasProductUnitColumns
            ? 'p.id_unidad,'
            : 'NULL::int AS id_unidad,'
        }
        ${
          support.hasProductUnitColumns
            ? 'p.permite_fraccion,'
            : 'false::boolean AS permite_fraccion,'
        }
        p.fecha_creacion,
        p.ubicacion,
        p.descripcion,
        c.nombre_categoria,
        ${
          support.hasProductUnitColumns && support.hasUnitsTable
            ? 'u.nombre AS unidad_nombre, u.abreviatura AS unidad_abreviatura'
            : 'NULL::text AS unidad_nombre, NULL::text AS unidad_abreviatura'
        }
      FROM productos p
      JOIN categorias c ON c.id_categoria = p.id_categoria
      ${
        support.hasProductUnitColumns && support.hasUnitsTable
          ? 'LEFT JOIN unidades_medida u ON u.id_unidad = p.id_unidad'
          : ''
      }
      ${whereClause}
      ORDER BY p.id_producto ASC
      LIMIT $${params.length - 1}
      OFFSET $${params.length}
    `;

    const { rows } = await this.pool.query(query, params);
    return { total, page, size, items: rows };
  }

  async updateProductPartial(idProducto, patch = {}) {
    const support = await this.getSchemaSupport();
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

    if (support.hasProductUnitColumns) {
      mapping.id_unidad = 'id_unidad';
      mapping.permite_fraccion = 'permite_fraccion';
    }

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
        ${
          support.hasProductUnitColumns
            ? 'id_unidad,'
            : 'NULL::int AS id_unidad,'
        }
        ${
          support.hasProductUnitColumns
            ? 'permite_fraccion,'
            : 'false::boolean AS permite_fraccion,'
        }
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
  constructor({ products = [], categories = [], units = [] } = {}) {
    this.products = products.map((product) => ({ ...product }));
    this.categories = categories.map((category) => ({ ...category }));
    this.units = units.map((unit) => ({ ...unit }));
    this.nextId =
      this.products.length > 0
        ? Math.max(...this.products.map((product) => product.id_producto || 0)) + 1
        : 1;
  }

  async createProduct(payload) {
    const product = {
      id_producto: this.nextId,
      id_unidad: null,
      permite_fraccion: false,
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
      unidad_nombre:
        this.units.find((entry) => entry.id_unidad === product.id_unidad)?.nombre || null,
      unidad_abreviatura:
        this.units.find((entry) => entry.id_unidad === product.id_unidad)?.abreviatura || null,
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

  async getUnitById(idUnidad) {
    const unit = this.units.find((item) => item.id_unidad === idUnidad);
    return unit ? { ...unit } : null;
  }

  async listUnits() {
    return this.units.map((unit) => ({ ...unit }));
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
          unidad_nombre:
            this.units.find((entry) => entry.id_unidad === item.id_unidad)?.nombre || null,
          unidad_abreviatura:
            this.units.find((entry) => entry.id_unidad === item.id_unidad)?.abreviatura || null,
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
