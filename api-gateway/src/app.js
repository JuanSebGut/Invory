'use strict';

/**
 * API Gateway de INVORY.
 *
 * Punto de entrada Ãºnico para el frontend. Resuelve:
 *   - AutenticaciÃ³n: delega en el auth-service (MS-01) la verificaciÃ³n del
 *     JWT en cada request protegido. El JWT se propaga al microservicio
 *     downstream para que pueda validarlo nuevamente (zero-trust).
 *   - AutorizaciÃ³n por rol: para operaciones sensibles (gestiÃ³n de usuarios,
 *     consulta de auditorÃ­a, mutaciones de catÃ¡logo) aplica un guard de
 *     rol Administrador / Operador antes de llegar al servicio.
 *   - Enrutamiento: prefijos /api/<dominio> proxean al microservicio
 *     correspondiente.
 *
 * Rutas expuestas:
 *   POST  /api/auth/login            pÃºblico           â†’ MS-01 auth-service
 *   POST  /api/auth/logout           JWT               â†’ MS-01 auth-service
 *   POST  /api/auth/refresh          pÃºblico           â†’ MS-01 auth-service
 *   GET   /api/auth/verify           JWT               â†’ MS-01 auth-service
 *
 *   GET   /api/users                 JWT + Admin       â†’ MS-02 user-service
 *   POST  /api/users                 JWT + Admin       â†’ MS-02 user-service
 *   GET   /api/users/:id             JWT + Admin       â†’ MS-02 user-service
 *   PUT   /api/users/:id             JWT + Admin       â†’ MS-02 user-service
 *   DELETE /api/users/:id            JWT + Admin       â†’ MS-02 user-service
 *
 *   GET   /api/categories            JWT + Admin/Op    â†’ MS-03 category-service
 *   POST  /api/categories            JWT + Admin       â†’ MS-03 category-service
 *   PUT   /api/categories/:id        JWT + Admin       â†’ MS-03 category-service
 *   DELETE /api/categories/:id       JWT + Admin       â†’ MS-03 category-service
 *
 *   GET   /api/products              JWT + Admin/Op    â†’ MS-04 product-service
 *   GET   /api/products/:id          JWT + Admin/Op    â†’ MS-04 product-service
 *   POST  /api/products              JWT + Admin       â†’ MS-04 product-service
 *   PUT   /api/products/:id          JWT + Admin       â†’ MS-04 product-service
 *   DELETE /api/products/:id         JWT + Admin       â†’ MS-04 product-service
 *
 *   GET   /api/inventory/alerts      JWT + Admin/Op    â†’ MS-05 inventory-service (MS-06 feature)
 *   GET   /api/inventory/movements   JWT + Admin/Op    â†’ MS-05 inventory-service
 *   POST  /api/inventory/movements   JWT + Admin/Op    â†’ MS-05 inventory-service
 *
 *   GET   /api/audit/logs            JWT + Admin       â†’ MS-09 audit-service
 *
 *   GET   /api/protected/ping        JWT               â†’ smoke test del gateway
 *
 * Eventos hacia MS-09 (auditorÃ­a):
 *   No los enruta el gateway directamente. Son webhooks server-to-server que
 *   cada servicio dispara cuando completa una acciÃ³n auditable:
 *     - MS-01 auth-service        â†’ login_exitoso, login_fallido, logout
 *     - MS-02 user-service        â†’ crear_usuario, actualizar_usuario, etc.
 *     - MS-05 inventory-service   â†’ registrar_movimiento, registrar_ajuste
 *   Se configuran vÃ­a MS09_AUDIT_WEBHOOK_URL / MS09_MOVEMENT_WEBHOOK_URL en
 *   docker-compose.yml.
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { createServicesConfig } = require('./config/services');
const { createAuthMiddleware } = require('./middlewares/auth.middleware');

const { createAuthRoutes } = require('./routes/auth.routes');
const { createUserRoutes } = require('./routes/user.routes');
const { createCategoryRoutes } = require('./routes/category.routes');
const { createProductRoutes } = require('./routes/product.routes');
const { createProviderRoutes } = require('./routes/provider.routes');
const { createInventoryRouter } = require('./routes/inventory.routes');
const { createAuditRoutes } = require('./routes/audit.routes');
const { createExportRoutes } = require('./routes/export.routes');

/**
 * Construye la app Express del gateway.
 *
 * Todas las dependencias (URLs de servicios, fetch, middlewares) se inyectan
 * por opciones para facilitar tests con servicios efÃ­meros (`app.listen(0)`).
 *
 * @param {object} [options]
 * @param {string} [options.authServiceUrl]
 * @param {string} [options.userServiceUrl]
 * @param {string} [options.categoryServiceUrl]
 * @param {string} [options.productServiceUrl]
 * @param {string} [options.providerServiceUrl]
 * @param {string} [options.inventoryServiceUrl]
 * @param {string} [options.auditServiceUrl]
 * @param {Function} [options.fetchImpl=fetch]
 */
function createApp(options = {}) {
  const config = createServicesConfig(options);
  const fetchImpl = options.fetchImpl || fetch;

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ success: true, message: 'API Gateway INVORY activo ðŸš€' });
  });

  // Middleware de autenticaciÃ³n reutilizable: lo creamos una sola vez con la
  // URL del auth-service y la implementaciÃ³n de fetch ya cerradas.
  //
  // Permitimos que el caller inyecte un authMiddleware propio (Ãºtil para tests
  // que mockean el upstream y no quieren montar un auth-service real).
  const authMiddleware =
    options.authMiddleware ||
    createAuthMiddleware({
      authServiceUrl: config.authServiceUrl,
      fetchImpl,
    });

  // -----------------------------------------------------------------------
  // /api/auth â€” login, logout, refresh, verify (MS-01)
  // -----------------------------------------------------------------------
  app.use(
    '/api/auth',
    createAuthRoutes({
      authServiceUrl: config.authServiceUrl,
      fetchImpl,
    })
  );

  // -----------------------------------------------------------------------
  // /api/users â€” gestiÃ³n de usuarios (MS-02), solo Administrador
  // -----------------------------------------------------------------------
  app.use(
    '/api/users',
    createUserRoutes({
      userServiceUrl: config.userServiceUrl,
      authMiddleware,
      fetchImpl,
    })
  );

  // -----------------------------------------------------------------------
  // /api/categories â€” categorÃ­as (MS-03)
  // -----------------------------------------------------------------------
  app.use(
    '/api/categories',
    createCategoryRoutes({
      categoryServiceUrl: config.categoryServiceUrl,
      authMiddleware,
      fetchImpl,
    })
  );

  // -----------------------------------------------------------------------
  // /api/products â€” catÃ¡logo de productos (MS-04)
  // -----------------------------------------------------------------------
  app.use(
    '/api/products',
    createProductRoutes({
      productServiceUrl: config.productServiceUrl,
      authMiddleware,
      fetchImpl,
    })
  );

  app.use(
    '/api/providers',
    createProviderRoutes({
      providerServiceUrl: config.providerServiceUrl,
      authMiddleware,
      fetchImpl,
    })
  );

  // -----------------------------------------------------------------------
  // /api/inventory â€” alertas (MS-06) + movimientos (MS-05/MS-09)
  // -----------------------------------------------------------------------
  // Tema histÃ³rico: el inventory-service expone /inventory/alerts (sin /api,
  // herencia de la rama MS-06) y /api/inventory/movements (rama MS-09). El
  // router unifica ambos bajo /api/inventory/* en el gateway.
  app.use(
    '/api/inventory',
    createInventoryRouter({
      inventoryServiceUrl: config.inventoryServiceUrl,
      authMiddleware,
      fetchImpl,
    })
  );

  // -----------------------------------------------------------------------
  // /api/audit â€” log de auditorÃ­a (MS-09), solo Administrador
  // -----------------------------------------------------------------------
  // El requireAdmin se aplica DENTRO de createAuditRoutes, garantizando
  // que ni siquiera GET /api/audit/logs pase el guard sin rol Admin.
  app.use(
    '/api/audit',
    createAuditRoutes({
      auditServiceUrl: config.auditServiceUrl,
      authMiddleware,
      fetchImpl,
    })
  );

  // -----------------------------------------------------------------------
  // /api/export - exportacion masiva de datos (MS-12), solo Administrador
  // -----------------------------------------------------------------------
  app.use(
    '/api/export',
    createExportRoutes({
      exportServiceUrl: config.exportServiceUrl,
      authMiddleware,
      fetchImpl,
    })
  );

  // -----------------------------------------------------------------------
  // Smoke test endpoint protegido: confirma que el JWT es vÃ¡lido
  // (lo usa gateway-auth.integration.test.js).
  // -----------------------------------------------------------------------
  app.get('/api/protected/ping', authMiddleware, (req, res) => {
    res.json({
      success: true,
      data: {
        message: 'Acceso autorizado',
        usuario: req.authUser,
      },
    });
  });

  // -----------------------------------------------------------------------
  // Manejador de errores global. Cualquier error que escape de los handlers
  // termina aquÃ­ con un payload uniforme.
  // -----------------------------------------------------------------------
  app.use((err, _req, res, _next) => {
    res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'INTERNAL_ERROR',
        message: err.message || 'Error interno del servidor',
      },
    });
  });

  return app;
}

module.exports = {
  createApp,
};
