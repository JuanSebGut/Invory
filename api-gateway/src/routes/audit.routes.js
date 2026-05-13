const { Router } = require('express');
const { ADMINISTRADOR } = require('../../../shared/constants/roles');

function buildProxyUrl(baseUrl, path, query) {
  const searchParams = new URLSearchParams();

  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined) {
      searchParams.append(key, value);
    }
  });

  const queryString = searchParams.toString();
  return `${baseUrl}${path}${queryString ? `?${queryString}` : ''}`;
}

function requireAdmin(req, res, next) {
  if (req.authUser?.rol !== ADMINISTRADOR) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'AUTH_FORBIDDEN',
        message: 'No tiene permisos para esta operacion',
      },
    });
  }

  return next();
}

function createAuditRoutes({ auditServiceUrl, authMiddleware, fetchImpl = fetch }) {
  const router = Router();

  router.get('/logs', authMiddleware, requireAdmin, async (req, res, next) => {
    try {
      const response = await fetchImpl(buildProxyUrl(auditServiceUrl, '/api/audit/logs', req.query), {
        method: 'GET',
        headers: {
          Authorization: req.headers.authorization,
        },
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createAuditRoutes };
