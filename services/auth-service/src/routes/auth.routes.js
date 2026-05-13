const { Router } = require('express');

function createAuthRoutes(controller) {
  const router = Router();

  router.post('/login', controller.login);
  router.post('/logout', controller.logout);
  router.post('/refresh', controller.refresh);
  router.get('/verify', controller.verify);

  return router;
}

module.exports = { createAuthRoutes };
