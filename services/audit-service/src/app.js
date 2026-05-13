const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { pool } = require('./config/db');
const { buildServiceConfig } = require('./config/services');
const { AuditController } = require('./controllers/audit.controller');
const { createAuthMiddleware } = require('./middlewares/auth.middleware');
const { PgAuditRepository, InMemoryAuditRepository } = require('./repositories/audit.repository');
const { createAuditRoutes } = require('./routes/audit.routes');
const { AuditService } = require('./services/audit.service');

function createApp(options = {}) {
  const app = express();
  const config = buildServiceConfig(options);
  const fetchImpl = options.fetchImpl || fetch;

  const repository =
    options.repository ||
    (process.env.AUDIT_REPOSITORY === 'inmemory'
      ? new InMemoryAuditRepository({ logs: options.seedLogs || [] })
      : new PgAuditRepository({ pool }));

  const service = options.service || new AuditService({ repository });
  const controller = options.controller || new AuditController(service);
  const authMiddleware =
    options.authMiddleware ||
    createAuthMiddleware({
      authServiceUrl: config.authServiceUrl,
      fetchImpl,
    });

  app.use(cors());
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ success: true, message: 'Audit Service activo' });
  });

  app.use('/api/audit', createAuditRoutes({ controller, authMiddleware }));

  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Error interno del servidor',
      },
    });
  });

  app.ready =
    typeof repository.ensureSchema === 'function'
      ? Promise.resolve().then(() => repository.ensureSchema())
      : Promise.resolve();

  return app;
}

module.exports = { createApp };
