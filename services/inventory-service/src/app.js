'use strict';

/**
 * App del inventory-service unificado (MS-05 + MS-06 + MS-09).
 *
 * Cablea, en un Ãºnico proceso Express, los dos dominios:
 *
 *   - Movimientos auditados (MS-09): expone /api/inventory/movements detrÃ¡s
 *     del authMiddleware. Cada movimiento dispara un webhook fire-and-forget
 *     hacia el audit-service (MS-09), realizando el flujo:
 *         POST /api/inventory/movements
 *           â†’ InventoryService.registerMovement
 *           â†’ InventoryNotifier.notifyMovementRegistered
 *           â†’ POST {ms09MovementWebhookUrl} con el payload de auditorÃ­a
 *
 *   - Alertas de stock (MS-06): expone /inventory/alerts SIN auth a nivel de
 *     servicio (el contrato original de MS-06 era pÃºblico; el gateway aÃ±ade
 *     el guard). Computa alertas a partir de las filas que devuelve el
 *     repository.
 *
 * Las opciones del createApp se aceptan tanto en la forma "plana" (que es la
 * que usa gateway-full.integration.test.js) como en la forma estÃ¡ndar.
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { pool } = require('./config/db');
const { buildServiceConfig } = require('./config/services');
const { InventoryController } = require('./controllers/inventory.controller');
const { createAuthMiddleware } = require('./middlewares/auth.middleware');
const {
  PgInventoryRepository,
  InMemoryInventoryRepository,
} = require('./repositories/inventory.repository');
const {
  createMovementsRouter,
  createAlertsRouter,
} = require('./routes/inventory.routes');
const { InventoryNotifier } = require('./services/inventory-notifier.service');
const {
  InventoryService,
  createInventoryService,
} = require('./services/inventory.service');

function createApp(options = {}) {
  const app = express();
  const config = buildServiceConfig(options);
  const fetchImpl = options.fetchImpl || fetch;

  // Repositorio: in-memory para tests, Pg para producciÃ³n. Si el test inyecta
  // su propio repository (`new InMemoryInventoryRepository(...)`), lo usamos
  // tal cual.
  const repository =
    options.repository ||
    (process.env.INVENTORY_REPOSITORY === 'inmemory'
      ? new InMemoryInventoryRepository({
          products: options.seedProducts || [],
          movements: options.seedMovements || [],
        })
      : new PgInventoryRepository({ pool }));

  // Notifier para audit-service. Si el test pasa notifier=undefined queremos
  // construir el real con la URL del webhook (fire-and-forget en errores).
  const notifier =
    options.notifier === undefined
      ? new InventoryNotifier({
          ms06MovementWebhookUrl: config.ms06MovementWebhookUrl,
          ms09MovementWebhookUrl: config.ms09MovementWebhookUrl,
          fetchImpl,
        })
      : options.notifier;

  // Servicios de dominio
  const inventoryService =
    options.service || new InventoryService({ repository, notifier });

  // Servicio de alertas. Si el repository no implementa getAlertSourceRows
  // (poco probable porque ya lo aÃ±adimos), createInventoryService lanza y
  // dejamos el handler como no-op vÃ­a controller.
  //
  // Soportamos dos formas de fijar el reloj para tests deterministas:
  //   - options.nowProvider: funciÃ³n () => string ISO (forma estÃ¡ndar)
  //   - options.now:         string ISO fijo (forma legacy de MS-06)
  let alertsService = null;
  try {
    const nowProvider = options.nowProvider
      || (typeof options.now === 'string' ? () => options.now : undefined);
    alertsService = createInventoryService({
      repository,
      nowProvider,
      fetchImpl,
      clientServiceUrl: config.clientServiceUrl,
    });
  } catch (_error) {
    alertsService = null;
  }

  const controller =
    options.controller ||
    new InventoryController({
      inventoryService,
      alertsService,
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
    res.json({ success: true, message: 'Inventory Service activo' });
  });

  // ---- MS-09: Movimientos auditados (con auth) ---------------------------
  app.use('/api/inventory', authMiddleware, createMovementsRouter(controller));

  // ---- MS-06: Alertas de stock (pÃºblico a nivel de servicio) -------------
  app.use('/inventory', createAlertsRouter(controller));

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
