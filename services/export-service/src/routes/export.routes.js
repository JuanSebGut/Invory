'use strict';

const fs = require('fs');
const { Router } = require('express');

const { PERMISOS } = require('../../../../shared/constants/roles');
const { ExportService } = require('../services/export.service');

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

function sendExportError(error, res, next) {
  if (error?.status) {
    return res.status(error.status).json({
      success: false,
      error: {
        code: error.code || 'EXPORT_ERROR',
        message: error.message,
      },
    });
  }

  return next(error);
}

function cleanupTempFile(filePath) {
  fs.promises.rm(filePath, { force: true }).catch(() => {});
}

function streamDownload(result, res, next) {
  let cleaned = false;
  const cleanupOnce = () => {
    if (cleaned) {
      return;
    }
    cleaned = true;
    cleanupTempFile(result.filePath);
  };

  const ttl = setTimeout(cleanupOnce, result.ttlMs);
  if (typeof ttl.unref === 'function') {
    ttl.unref();
  }

  res.on('finish', cleanupOnce);
  res.on('close', cleanupOnce);
  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.setHeader('X-Export-Records', String(result.meta.total_registros));

  const stream = fs.createReadStream(result.filePath);
  stream.on('error', (error) => {
    clearTimeout(ttl);
    cleanupOnce();
    return next(error);
  });
  stream.pipe(res);
}

function createExportRoutes({
  authMiddleware,
  productServiceUrl,
  categoryServiceUrl,
  inventoryServiceUrl,
  auditServiceUrl,
  fetchImpl = fetch,
  dataSources,
  dbPool,
  exportService,
  tempDir,
  nowProvider,
} = {}) {
  const router = Router();
  const service =
    exportService ||
    new ExportService({
      productServiceUrl,
      categoryServiceUrl,
      inventoryServiceUrl,
      auditServiceUrl,
      fetchImpl,
      dataSources,
      dbPool,
      tempDir,
      nowProvider,
    });

  const guards = authMiddleware
    ? [authMiddleware, requireRoles(PERMISOS.EXPORTAR_DATOS)]
    : [requireRoles(PERMISOS.EXPORTAR_DATOS)];

  router.post('/', ...guards, async (req, res, next) => {
    try {
      const result = await service.createExport(req.body, {
        actor: req.authUser,
        authorization: req.headers.authorization,
      });
      return streamDownload(result, res, next);
    } catch (error) {
      return sendExportError(error, res, next);
    }
  });

  return router;
}

module.exports = { createExportRoutes };
