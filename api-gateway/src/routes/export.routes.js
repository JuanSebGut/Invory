'use strict';

const { Router } = require('express');

const { PERMISOS } = require('../../../shared/constants/roles');

function buildProxyUrl(baseUrl, path, query = {}) {
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

function requireRoles(allowedRoles) {
  return function roleGuard(req, res, next) {
    const role = req.authUser?.rol;
    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'AUTH_FORBIDDEN',
          message: 'No tiene permisos para esta operacion',
        },
      });
    }

    return next();
  };
}

function createExportRoutes({ exportServiceUrl, authMiddleware, fetchImpl = fetch }) {
  const router = Router();

  const guards = authMiddleware
    ? [authMiddleware, requireRoles(PERMISOS.EXPORTAR_DATOS)]
    : [requireRoles(PERMISOS.EXPORTAR_DATOS)];

  router.post('/', ...guards, async (req, res) => {
    try {
      const upstreamUrl = buildProxyUrl(exportServiceUrl, '/api/export');
      const upstreamResponse = await fetchImpl(upstreamUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json, application/pdf, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
          ...(req.authUser?.id_usuario ? { 'x-user-id': String(req.authUser.id_usuario) } : {}),
          ...(req.authUser?.rol ? { 'x-user-role': String(req.authUser.rol) } : {}),
          ...(req.authUser?.nombre ? { 'x-user-name': String(req.authUser.nombre) } : {}),
        },
        body: JSON.stringify(req.body || {}),
      });

      const contentType = upstreamResponse.headers?.get?.('content-type') || '';
      const disposition = upstreamResponse.headers?.get?.('content-disposition');
      const exportRecords = upstreamResponse.headers?.get?.('x-export-records');
      const buffer = Buffer.from(await upstreamResponse.arrayBuffer());

      res.status(upstreamResponse.status);
      if (contentType) {
        res.setHeader('Content-Type', contentType);
      }
      if (disposition) {
        res.setHeader('Content-Disposition', disposition);
      }
      if (exportRecords) {
        res.setHeader('X-Export-Records', exportRecords);
      }

      if (contentType.includes('application/json')) {
        const text = buffer.toString('utf8');
        res.json(text ? JSON.parse(text) : {});
        return;
      }

      res.send(buffer);
    } catch (_error) {
      res.status(502).json({
        success: false,
        error: {
          code: 'EXPORT_SERVICE_UNAVAILABLE',
          message: 'No fue posible generar la exportacion',
        },
      });
    }
  });

  return router;
}

module.exports = { buildProxyUrl, createExportRoutes };
