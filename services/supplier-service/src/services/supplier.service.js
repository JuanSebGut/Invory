'use strict';

const {
  ConflictError,
  NotFoundError,
} = require('../../../../shared/middlewares/errorHandler');
const {
  formatSupplier,
  validateCreateSupplierPayload,
  validateUpdateSupplierPayload,
} = require('../models/supplier.model');

class SupplierService {
  constructor({ repository }) {
    this.repository = repository;
  }

  async ensureUniqueName(nombreRazonSocial, excludeId = null) {
    const existing = await this.repository.findByNameInsensitive(nombreRazonSocial, excludeId);
    if (existing) {
      throw new ConflictError('El nombre del proveedor ya esta registrado');
    }
  }

  async ensureUniqueNit(nitIdentificacion, excludeId = null) {
    const existing = await this.repository.findByNit(nitIdentificacion, excludeId);
    if (existing) {
      throw new ConflictError('El NIT ya esta registrado');
    }
  }

  async ensureUniqueEmail(correoElectronico, excludeId = null) {
    if (!correoElectronico) {
      return;
    }

    const existing = await this.repository.findByEmail(correoElectronico, excludeId);
    if (existing) {
      throw new ConflictError('El correo electronico ya esta registrado');
    }
  }

  async createSupplier(payload) {
    const normalized = validateCreateSupplierPayload(payload);

    await this.ensureUniqueName(normalized.nombre_razon_social);
    await this.ensureUniqueNit(normalized.nit_identificacion);
    await this.ensureUniqueEmail(normalized.correo_electronico);

    const created = await this.repository.createSupplier(normalized);
    return formatSupplier(created);
  }

  async getSupplierById(idProveedor) {
    const supplier = await this.repository.getSupplierById(idProveedor);
    if (!supplier) {
      throw new NotFoundError('Proveedor no encontrado');
    }

    return formatSupplier(supplier);
  }

  async listSuppliers(query) {
    const result = await this.repository.listSuppliers(query);
    return {
      total: result.total,
      proveedores: result.items.map(formatSupplier),
    };
  }

  async updateSupplier(idProveedor, payload) {
    const current = await this.repository.getSupplierById(idProveedor);
    if (!current) {
      throw new NotFoundError('Proveedor no encontrado');
    }

    const patch = validateUpdateSupplierPayload(payload);

    if (patch.nombre_razon_social) {
      await this.ensureUniqueName(patch.nombre_razon_social, idProveedor);
    }

    if (patch.nit_identificacion) {
      await this.ensureUniqueNit(patch.nit_identificacion, idProveedor);
    }

    if (patch.correo_electronico) {
      await this.ensureUniqueEmail(patch.correo_electronico, idProveedor);
    }

    const updated = await this.repository.updateSupplier(idProveedor, patch);
    return formatSupplier(updated);
  }

  async deleteSupplier(idProveedor) {
    const current = await this.repository.getSupplierById(idProveedor);
    if (!current) {
      throw new NotFoundError('Proveedor no encontrado');
    }

    const deleted = await this.repository.softDeleteSupplier(idProveedor);
    return formatSupplier(deleted);
  }
}

module.exports = { SupplierService };
