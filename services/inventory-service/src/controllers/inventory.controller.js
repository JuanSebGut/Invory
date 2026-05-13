'use strict';

/**
 * Controller del inventory-service unificado.
 *
 * Une los dos contratos HTTP del MS-05:
 *
 *   - Movimientos (MS-09): POST y GET /api/inventory/movements
 *   - Alertas    (MS-06): GET /inventory/alerts
 *
 * Cada handler lee de servicios de dominio distintos:
 *   - this.inventoryService     â†’ clase InventoryService (MS-09)
 *   - this.alertsService        â†’ factory createInventoryService (MS-06)
 */

const {
  ValidationError,
  parseMovementFilters,
  parseReportFilters,
  REPORT_TYPES,
  validateCreateMovementPayload,
} = require('../models/inventory.model');

function sendSuccess(res, status, payload) {
  res.status(status).json({
    success: true,
    data: payload.data ?? payload,
  });
}

class InventoryController {
  /**
   * @param {object} services
   * @param {object} services.inventoryService Movements service (MS-09)
   * @param {object} [services.alertsService]  Alerts service (MS-06).
   *   Opcional: si la app no lo provee, los handlers de /alerts no funcionan
   *   pero los de /movements siguen operativos.
   */
  constructor(services) {
    // Soporte de retrocompatibilidad: si reciben directamente el inventoryService
    // (la firma vieja de MS-09), lo aceptamos.
    if (services && typeof services.registerMovement === 'function') {
      this.inventoryService = services;
      this.alertsService = null;
    } else {
      this.inventoryService = services?.inventoryService;
      this.alertsService = services?.alertsService || null;
    }
  }

  // -------------------------------------------------------------------------
  // MS-09 â€” Movimientos
  // -------------------------------------------------------------------------

  registerMovement = async (req, res, next) => {
    try {
      const payload = validateCreateMovementPayload(req.body);
      // ?force=true permite a Administrador cruzar el stock mÃ­nimo en salidas.
      // El service valida que solo Admin pueda aplicar este override.
      const force =
        req.query.force === 'true' || req.query.force === '1' || req.query.force === true;
      const result = await this.inventoryService.registerMovement(payload, {
        actor: req.authUser,
        force,
      });

      sendSuccess(res, 201, result);
    } catch (error) {
      next(error);
    }
  };

  listMovements = async (req, res, next) => {
    try {
      const filters = parseMovementFilters(req.query);
      const result = await this.inventoryService.listMovements(filters);
      sendSuccess(res, 200, result);
    } catch (error) {
      next(error);
    }
  };

  getMovementReport = async (req, res, next) => {
    try {
      const filters = parseReportFilters(REPORT_TYPES.MOVEMENTS, req.query);
      const result = await this.inventoryService.getMovementReport(filters);
      sendSuccess(res, 200, result);
    } catch (error) {
      next(error);
    }
  };

  getSalesReport = async (req, res, next) => {
    try {
      const filters = parseReportFilters(REPORT_TYPES.SALES, req.query);
      const result = await this.inventoryService.getSalesReport(filters);
      sendSuccess(res, 200, result);
    } catch (error) {
      next(error);
    }
  };

  getStockReport = async (req, res, next) => {
    try {
      const filters = parseReportFilters(REPORT_TYPES.STOCK, req.query);
      const result = await this.inventoryService.getStockReport(filters);
      sendSuccess(res, 200, result);
    } catch (error) {
      next(error);
    }
  };

  getReportByType = (req, res, next) => {
    const handlers = {
      [REPORT_TYPES.MOVEMENTS]: this.getMovementReport,
      [REPORT_TYPES.SALES]: this.getSalesReport,
      [REPORT_TYPES.STOCK]: this.getStockReport,
    };

    try {
      const filters = parseReportFilters(req.params.reportType, req.query);
      const handler = handlers[filters.reportType];
      return handler(req, res, next);
    } catch (error) {
      return next(error);
    }
  };

  // -------------------------------------------------------------------------
  // MS-06 â€” Alertas de stock
  // -------------------------------------------------------------------------
  //
  // El contrato HTTP de MS-06 es distinto al estilo {success, data} de MS-09:
  // responde directamente con { data, meta } y, en error de validaciÃ³n, con
  // { error: 'mensaje' }. Lo respetamos para no romper el frontend que ya
  // consume MS-06.

  getAlerts = async (req, res, next) => {
    try {
      if (!this.alertsService) {
        return res.status(503).json({ error: 'Alerts service not configured' });
      }

      const result = await this.alertsService.getActiveAlerts({
        type: req.query.type,
        categoryId: req.query.categoryId,
      });

      res.status(200).json(result);
    } catch (error) {
      if (error instanceof ValidationError || error.statusCode === 400) {
        return res.status(400).json({ error: error.message });
      }
      return next(error);
    }
  };
}

module.exports = { InventoryController };
