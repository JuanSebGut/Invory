'use strict';

/**
 * Routes del inventory-service.
 *
 * Convivencia de dos sub-routers porque cada historia eligiÃ³ su prefijo:
 *
 *   - MS-09 (movimientos) vive en /api/inventory/* (con auth)
 *   - MS-06 (alertas) vive en /inventory/* (sin auth, contrato histÃ³rico)
 *
 * El api-gateway absorbe la diferencia y expone ambos como /api/inventory/*
 * de cara al frontend.
 */

const { Router } = require('express');

/**
 * Sub-router de movimientos. Requiere actor autenticado: cada handler lee
 * `req.authUser` para enforcement de roles.
 */
function createMovementsRouter(controller) {
  const router = Router();
  router.post('/movements', controller.registerMovement);
  router.get('/movements', controller.listMovements);
  router.post('/facturas', controller.createInvoice);
  router.get('/facturas', controller.listInvoices);
  router.get('/facturas/:id', controller.getInvoiceById);
  router.patch('/facturas/:id/anular', controller.cancelInvoice);
  router.get('/reports/:reportType', controller.getReportByType);
  return router;
}

/**
 * Sub-router de alertas. HistÃ³rico MS-06: sin auth (el gateway aplica el
 * guard antes de proxear).
 */
function createAlertsRouter(controller) {
  const router = Router();
  router.get('/alerts', controller.getAlerts);
  return router;
}

// Compat: la firma original de MS-09 era createInventoryRoutes(controller).
function createInventoryRoutes(controller) {
  return createMovementsRouter(controller);
}

module.exports = {
  createInventoryRoutes,
  createMovementsRouter,
  createAlertsRouter,
};
