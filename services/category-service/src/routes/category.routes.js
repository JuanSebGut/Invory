const { Router } = require('express');

function createCategoryRoutes(controller) {
  const router = Router();

  router.post('/', controller.create);
  router.get('/', controller.list);
  router.put('/:id', controller.update);
  router.delete('/:id', controller.remove);

  return router;
}

module.exports = { createCategoryRoutes };
