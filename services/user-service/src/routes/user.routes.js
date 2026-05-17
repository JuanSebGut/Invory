const { Router } = require('express');

function createUserRoutes(controller) {
  const router = Router();

  router.post('/', controller.createUser);
  router.get('/', controller.listUsers);
  router.get('/:id', controller.getUserById);
  router.put('/:id', controller.updateUser);
  router.put('/:id/reset-password', controller.resetPassword);
  router.delete('/:id', controller.deleteUser);

  return router;
}

module.exports = { createUserRoutes };
