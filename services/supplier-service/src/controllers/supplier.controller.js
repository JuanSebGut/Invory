'use strict';

const {
  parseListQuery,
  parseSupplierId,
  validateCreateSupplierPayload,
  validateUpdateSupplierPayload,
} = require('../models/supplier.model');

class SupplierController {
  constructor(supplierService) {
    this.supplierService = supplierService;
  }

  createSupplier = async (req, res, next) => {
    try {
      const payload = validateCreateSupplierPayload(req.body);
      const supplier = await this.supplierService.createSupplier(payload);
      res.status(201).json({
        success: true,
        data: supplier,
        message: 'Proveedor creado correctamente',
      });
    } catch (error) {
      next(error);
    }
  };

  listSuppliers = async (req, res, next) => {
    try {
      const query = parseListQuery(req.query);
      const result = await this.supplierService.listSuppliers(query);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  };

  getSupplierById = async (req, res, next) => {
    try {
      const idProveedor = parseSupplierId(req.params.id);
      const supplier = await this.supplierService.getSupplierById(idProveedor);
      res.status(200).json({ success: true, data: supplier });
    } catch (error) {
      next(error);
    }
  };

  updateSupplier = async (req, res, next) => {
    try {
      const idProveedor = parseSupplierId(req.params.id);
      const payload = validateUpdateSupplierPayload(req.body);
      const supplier = await this.supplierService.updateSupplier(idProveedor, payload);
      res.status(200).json({
        success: true,
        data: supplier,
        message: 'Proveedor actualizado correctamente',
      });
    } catch (error) {
      next(error);
    }
  };

  deleteSupplier = async (req, res, next) => {
    try {
      const idProveedor = parseSupplierId(req.params.id);
      const supplier = await this.supplierService.deleteSupplier(idProveedor);
      res.status(200).json({
        success: true,
        data: supplier,
        message: 'Proveedor eliminado correctamente',
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { SupplierController };
