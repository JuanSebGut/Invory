const { Router } = require('express');

function createProductRoutes(controller) {
  const router = Router();

  router.post('/', controller.createProduct);
  router.get('/', controller.listProducts);
  router.get('/:id', controller.getProductById);
  router.put('/:id', controller.updateProduct);
  router.delete('/:id', controller.deleteProduct);

  return router;
}

module.exports = { createProductRoutes };
