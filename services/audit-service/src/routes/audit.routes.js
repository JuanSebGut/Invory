const { Router } = require('express');
const { ADMINISTRADOR } = require('../../../../shared/constants/roles');

function requireAdmin(req, res, next) {
  if (req.authUser?.rol !== ADMINISTRADOR) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'AUTH_FORBIDDEN',
        message: 'No tiene permisos para consultar el log de auditoria',
      },
    });
  }

  return next();
}

function createAuditRoutes({ controller, authMiddleware }) {
  const router = Router();

  router.post('/events', controller.registerEvent);
  router.get('/logs', authMiddleware, requireAdmin, controller.listLogs);

  return router;
}

module.exports = { createAuditRoutes };
