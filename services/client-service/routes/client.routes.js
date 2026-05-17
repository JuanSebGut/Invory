const { Router } = require('express');

function createClientRoutes(controller) {
  const router = Router();

  router.get('/clients', controller.listClients);
  router.get('/clients/:id', controller.getClientById);
  router.post('/clients', controller.createClient);
  router.put('/clients/:id', controller.updateClient);
  router.patch('/clients/:id/status', controller.patchClientStatus);

  router.get('/clients/:id/fiados', controller.listClientFiados);
  router.post('/clients/:id/fiados', controller.createClientFiado);

  router.post('/fiados/:id_fiado/pagos', controller.registerFiadoPayment);
  router.get('/fiados/alertas', controller.getFiadosAlerts);

  return router;
}

module.exports = { createClientRoutes };
