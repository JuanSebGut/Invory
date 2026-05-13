class PgCategoryRepository {
  constructor({ pool }) {
    this.pool = pool;
  }

  async createCategory({ nombre_categoria, descripcion, estado }) {
    const query = `
      INSERT INTO categorias (nombre_categoria, descripcion, estado)
      VALUES ($1, $2, $3)
      RETURNING id_categoria, nombre_categoria, descripcion, estado
    `;

    const { rows } = await this.pool.query(query, [nombre_categoria, descripcion, estado]);
    return rows[0];
  }

  async findByNameInsensitive(nombreCategoria, excludeId = null) {
    const query = `
      SELECT id_categoria, nombre_categoria, descripcion, estado
      FROM categorias
      WHERE LOWER(nombre_categoria) = LOWER($1)
        AND ($2::int IS NULL OR id_categoria <> $2)
      LIMIT 1
    `;

    const { rows } = await this.pool.query(query, [nombreCategoria, excludeId]);
    return rows[0] || null;
  }

  async listCategories(estado) {
    const conditions = [];
    const values = [];

    if (estado === 'activo') {
      values.push(true);
      conditions.push(`estado = $${values.length}`);
    }

    if (estado === 'inactivo') {
      values.push(false);
      conditions.push(`estado = $${values.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `
      SELECT id_categoria, nombre_categoria, descripcion, estado
      FROM categorias
      ${whereClause}
      ORDER BY nombre_categoria ASC
    `;

    const { rows } = await this.pool.query(query, values);
    return rows;
  }

  async getCategoryById(id) {
    const query = `
      SELECT id_categoria, nombre_categoria, descripcion, estado
      FROM categorias
      WHERE id_categoria = $1
      LIMIT 1
    `;

    const { rows } = await this.pool.query(query, [id]);
    return rows[0] || null;
  }

  async updateCategory(id, { nombre_categoria, descripcion, estado }) {
    const query = `
      UPDATE categorias
      SET nombre_categoria = $2,
          descripcion = $3,
          estado = $4
      WHERE id_categoria = $1
      RETURNING id_categoria, nombre_categoria, descripcion, estado
    `;

    const { rows } = await this.pool.query(query, [id, nombre_categoria, descripcion, estado]);
    return rows[0] || null;
  }

  async countActiveProductsByCategoryId(idCategoria) {
    const query = `
      SELECT COUNT(*)::int AS total
      FROM productos
      WHERE id_categoria = $1
        AND estado = true
    `;

    const { rows } = await this.pool.query(query, [idCategoria]);
    return rows[0]?.total || 0;
  }
}

class InMemoryCategoryRepository {
  constructor({ categories = [], products = [] } = {}) {
    this.categories = categories.map((category) => ({ ...category }));
    this.products = products.map((product) => ({ ...product }));
    this.nextId =
      this.categories.reduce((max, category) => Math.max(max, category.id_categoria), 0) + 1;
  }

  async createCategory({ nombre_categoria, descripcion, estado }) {
    const category = {
      id_categoria: this.nextId,
      nombre_categoria,
      descripcion,
      estado,
    };

    this.nextId += 1;
    this.categories.push(category);
    return { ...category };
  }

  async findByNameInsensitive(nombreCategoria, excludeId = null) {
    const normalized = nombreCategoria.toLowerCase();
    const category = this.categories.find(
      (item) =>
        item.nombre_categoria.toLowerCase() === normalized &&
        (excludeId === null || item.id_categoria !== excludeId)
    );

    return category ? { ...category } : null;
  }

  async listCategories(estado) {
    let categories = [...this.categories];

    if (estado === 'activo') {
      categories = categories.filter((category) => category.estado === true);
    }

    if (estado === 'inactivo') {
      categories = categories.filter((category) => category.estado === false);
    }

    return categories.sort((a, b) => a.nombre_categoria.localeCompare(b.nombre_categoria));
  }

  async getCategoryById(id) {
    const category = this.categories.find((item) => item.id_categoria === id);
    return category ? { ...category } : null;
  }

  async updateCategory(id, { nombre_categoria, descripcion, estado }) {
    const index = this.categories.findIndex((item) => item.id_categoria === id);
    if (index === -1) {
      return null;
    }

    this.categories[index] = {
      ...this.categories[index],
      nombre_categoria,
      descripcion,
      estado,
    };

    return { ...this.categories[index] };
  }

  async countActiveProductsByCategoryId(idCategoria) {
    return this.products.filter(
      (product) => product.id_categoria === idCategoria && product.estado === true
    ).length;
  }
}

module.exports = {
  PgCategoryRepository,
  InMemoryCategoryRepository,
};
