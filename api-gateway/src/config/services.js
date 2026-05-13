'use strict';

/**
 * Construye el objeto de configuraciÃ³n con las URLs de todos los microservicios
 * que el API Gateway necesita conocer para enrutar las peticiones.
 *
 * Orden de precedencia: argumento explÃ­cito > variable de entorno > valor por
 * defecto (apunta a localhost para desarrollo local fuera de Docker).
 *
 * Los puertos por defecto siguen la convenciÃ³n del docker-compose.yml del
 * monorepo:
 *   - auth-service:      3002
 *   - product-service:   3001
 *   - category-service:  3003
 *   - user-service:      3004
 *   - inventory-service: 3005
 *   - audit-service:     3006
 *   - export-service:    3007
 *   - supplier-service:  3008
 *
 * @param {object} [overrides]
 * @returns {{
 *   authServiceUrl: string,
 *   productServiceUrl: string,
 *   categoryServiceUrl: string,
 *   userServiceUrl: string,
 *   inventoryServiceUrl: string,
 *   auditServiceUrl: string,
 *   exportServiceUrl: string,
 *   providerServiceUrl: string
 * }}
 */
function createServicesConfig(overrides = {}) {
  return {
    authServiceUrl:
      overrides.authServiceUrl ||
      process.env.AUTH_SERVICE_URL ||
      'http://localhost:3002',
    productServiceUrl:
      overrides.productServiceUrl ||
      process.env.PRODUCT_SERVICE_URL ||
      'http://localhost:3001',
    categoryServiceUrl:
      overrides.categoryServiceUrl ||
      process.env.CATEGORY_SERVICE_URL ||
      'http://localhost:3003',
    userServiceUrl:
      overrides.userServiceUrl ||
      process.env.USER_SERVICE_URL ||
      'http://localhost:3004',
    inventoryServiceUrl:
      overrides.inventoryServiceUrl ||
      process.env.INVENTORY_SERVICE_URL ||
      'http://localhost:3005',
    auditServiceUrl:
      overrides.auditServiceUrl ||
      process.env.AUDIT_SERVICE_URL ||
      'http://localhost:3006',
    exportServiceUrl:
      overrides.exportServiceUrl ||
      process.env.EXPORT_SERVICE_URL ||
      'http://localhost:3007',
    providerServiceUrl:
      overrides.providerServiceUrl ||
      process.env.PROVIDER_SERVICE_URL ||
      'http://localhost:3008',
  };
}

module.exports = {
  createServicesConfig,
};
