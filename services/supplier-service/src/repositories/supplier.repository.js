'use strict';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEstadoFilter(value) {
  if (value === 'activo') {
    return true;
  }
  if (value === 'inactivo') {
    return false;
  }
  return undefined;
}

class PgSupplierRepository {
  constructor({ pool }) {
    this.pool = pool;
  }

  async createSupplier({
    nombre_razon_social,
    nit_identificacion,
    telefono,
    direccion,
    correo,
    estado,
  }) {
    const { rows } = await this.pool.query(
      `
        INSERT INTO proveedores (
          razon_social,
          nit_identificacion,
          telefono,
          direccion,
          correo,
          estado
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING
          id_proveedor,
          razon_social,
          nit_identificacion,
          telefono,
          direccion,
          correo,
          estado
      `,
      [nombre_razon_social, nit_identificacion, telefono, direccion, correo, estado]
    );

    return rows[0] || null;
  }

  async getSupplierById(idProveedor) {
    const { rows } = await this.pool.query(
      `
        SELECT
          id_proveedor,
          razon_social,
          nit_identificacion,
          telefono,
          direccion,
          correo,
          estado
        FROM proveedores
        WHERE id_proveedor = $1
        LIMIT 1
      `,
      [idProveedor]
    );

    return rows[0] || null;
  }

  async findByNameInsensitive(nombreRazonSocial, excludeId = null) {
    const { rows } = await this.pool.query(
      `
        SELECT id_proveedor
        FROM proveedores
        WHERE LOWER(TRIM(razon_social)) = LOWER(TRIM($1))
          AND ($2::int IS NULL OR id_proveedor <> $2)
        LIMIT 1
      `,
      [nombreRazonSocial, excludeId]
    );

    return rows[0] || null;
  }

  async findByNit(nitIdentificacion, excludeId = null) {
    const { rows } = await this.pool.query(
      `
        SELECT id_proveedor
        FROM proveedores
        WHERE nit_identificacion = $1
          AND ($2::int IS NULL OR id_proveedor <> $2)
        LIMIT 1
      `,
      [nitIdentificacion, excludeId]
    );

    return rows[0] || null;
  }

  async findByEmail(correo, excludeId = null) {
    const { rows } = await this.pool.query(
      `
        SELECT id_proveedor
        FROM proveedores
        WHERE LOWER(TRIM(correo)) = LOWER(TRIM($1))
          AND correo IS NOT NULL
          AND ($2::int IS NULL OR id_proveedor <> $2)
        LIMIT 1
      `,
      [correo, excludeId]
    );

    return rows[0] || null;
  }

  async listSuppliers({ page, size, estado, paginate = true }) {
    const filters = [];
    const params = [];
    const estadoFilter = normalizeEstadoFilter(estado);

    if (typeof estadoFilter === 'boolean') {
      params.push(estadoFilter);
      filters.push(`estado = $${params.length}`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const countResult = await this.pool.query(
      `SELECT COUNT(*)::int AS total FROM proveedores ${whereClause}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    const queryParams = [...params];
    let limitClause = '';

    if (paginate) {
      const offset = (page - 1) * size;
      queryParams.push(size);
      queryParams.push(offset);
      limitClause = `LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`;
    }

    const { rows } = await this.pool.query(
      `
        SELECT
          id_proveedor,
          razon_social,
          nit_identificacion,
          telefono,
          direccion,
          correo,
          estado
        FROM proveedores
        ${whereClause}
        ORDER BY razon_social ASC, id_proveedor ASC
        ${limitClause}
      `,
      queryParams
    );

    return { total, page, size, items: rows };
  }

  async updateSupplier(idProveedor, patch = {}) {
    const mapping = {
      nombre_razon_social: 'razon_social',
      nit_identificacion: 'nit_identificacion',
      telefono: 'telefono',
      direccion: 'direccion',
      correo: 'correo',
      estado: 'estado',
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
      return this.getSupplierById(idProveedor);
    }

    values.push(idProveedor);
    const { rows } = await this.pool.query(
      `
        UPDATE proveedores
        SET ${updates.join(', ')}
        WHERE id_proveedor = $${values.length}
        RETURNING
          id_proveedor,
          razon_social,
          nit_identificacion,
          telefono,
          direccion,
          correo,
          estado
      `,
      values
    );

    return rows[0] || null;
  }

  async softDeleteSupplier(idProveedor) {
    return this.updateSupplier(idProveedor, { estado: false });
  }
}

class InMemorySupplierRepository {
  constructor({ suppliers = [] } = {}) {
    this.suppliers = suppliers.map((supplier) => ({ ...supplier }));
    this.nextId =
      this.suppliers.reduce((max, supplier) => Math.max(max, supplier.id_proveedor || 0), 0) + 1;
  }

  async createSupplier(payload) {
    const supplier = {
      id_proveedor: this.nextId,
      ...payload,
    };

    this.nextId += 1;
    this.suppliers.push(supplier);
    return clone(supplier);
  }

  async getSupplierById(idProveedor) {
    const supplier = this.suppliers.find((item) => item.id_proveedor === idProveedor);
    return supplier ? clone(supplier) : null;
  }

  async findByNameInsensitive(nombreRazonSocial, excludeId = null) {
    const normalized = normalizeText(nombreRazonSocial);
    const supplier = this.suppliers.find(
      (item) =>
        normalizeText(item.razon_social || item.nombre_razon_social) === normalized &&
        (excludeId === null || item.id_proveedor !== excludeId)
    );

    return supplier ? { id_proveedor: supplier.id_proveedor } : null;
  }

  async findByNit(nitIdentificacion, excludeId = null) {
    const normalized = String(nitIdentificacion || '').trim();
    const supplier = this.suppliers.find(
      (item) =>
        String(item.nit_identificacion || '').trim() === normalized &&
        (excludeId === null || item.id_proveedor !== excludeId)
    );

    return supplier ? { id_proveedor: supplier.id_proveedor } : null;
  }

  async findByEmail(correo, excludeId = null) {
    const normalized = String(correo || '').trim().toLowerCase();
    const supplier = this.suppliers.find(
      (item) =>
        String(item.correo || '').trim().toLowerCase() === normalized &&
        (excludeId === null || item.id_proveedor !== excludeId)
    );

    return supplier ? { id_proveedor: supplier.id_proveedor } : null;
  }

  async listSuppliers({ page, size, estado, paginate = true }) {
    const estadoFilter = normalizeEstadoFilter(estado);
    let items = [...this.suppliers];

    if (typeof estadoFilter === 'boolean') {
      items = items.filter((supplier) => Boolean(supplier.estado) === estadoFilter);
    }

    items = items.sort((left, right) =>
      String(left.razon_social || left.nombre_razon_social || '')
        .localeCompare(String(right.razon_social || right.nombre_razon_social || ''))
    );

    if (!paginate) {
      return {
        total: items.length,
        page,
        size,
        items: items.map(clone),
      };
    }

    const offset = (page - 1) * size;
    return {
      total: items.length,
      page,
      size,
      items: items.slice(offset, offset + size).map(clone),
    };
  }

  async updateSupplier(idProveedor, patch = {}) {
    const index = this.suppliers.findIndex((item) => item.id_proveedor === idProveedor);
    if (index === -1) {
      return null;
    }

    this.suppliers[index] = {
      ...this.suppliers[index],
      ...patch,
    };

    return clone(this.suppliers[index]);
  }

  async softDeleteSupplier(idProveedor) {
    return this.updateSupplier(idProveedor, { estado: false });
  }

  async getRawById(idProveedor) {
    return this.suppliers.find((item) => item.id_proveedor === idProveedor) || null;
  }
}

module.exports = {
  InMemorySupplierRepository,
  PgSupplierRepository,
};
