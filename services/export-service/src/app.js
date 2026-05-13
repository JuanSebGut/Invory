'use strict';

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { buildServiceConfig } = require('./config/services');
const { createPool } = require('./config/db');
const { createAuthMiddleware } = require('./middlewares/auth.middleware');
const { ExportService } = require('./services/export.service');
const { createExportRoutes } = require('./routes/export.routes');

function createApp(options = {}) {
  const config = buildServiceConfig(options);
  const fetchImpl = options.fetchImpl || fetch;

  const app = express();
  const dbPool = options.exportDbPool || options.dbPool || createPool();

  const exportService =
    options.exportService ||
    new ExportService({
      inventoryServiceUrl: config.inventoryServiceUrl,
      auditServiceUrl: config.auditServiceUrl,
      fetchImpl,
      dataSources: options.exportDataSources,
      dbPool,
      tempDir: options.exportTempDir,
      nowProvider: options.exportNowProvider,
    });

  const authMiddleware =
    options.authMiddleware ||
    createAuthMiddleware({
      authServiceUrl: config.authServiceUrl,
      fetchImpl,
    });

  app.use(cors());
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ success: true, message: 'Export Service activo' });
  });

  app.use(
    '/api/export',
    createExportRoutes({
      authMiddleware,
      exportService,
    })
  );

  app.use((err, _req, res, _next) => {
    res.status(err.status || err.statusCode || 500).json({
      success: false,
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Error interno del servidor',
      },
    });
  });

  return app;
}

module.exports = { createApp };
