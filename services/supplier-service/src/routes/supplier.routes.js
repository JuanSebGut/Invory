'use strict';

const { Router } = require('express');

function createSupplierRoutes(controller) {
  const router = Router();

  router.get('/', controller.listSuppliers);
  router.get('/:id', controller.getSupplierById);
  router.post('/', controller.createSupplier);
  router.put('/:id', controller.updateSupplier);
  router.delete('/:id', controller.deleteSupplier);

  return router;
}

module.exports = { createSupplierRoutes };
