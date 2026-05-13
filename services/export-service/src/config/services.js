'use strict';

function buildServiceConfig(overrides = {}) {
  return {
    authServiceUrl:
      overrides.authServiceUrl || process.env.AUTH_SERVICE_URL || 'http://localhost:3002',
    inventoryServiceUrl:
      overrides.inventoryServiceUrl ||
      process.env.INVENTORY_SERVICE_URL ||
      'http://localhost:3005',
    auditServiceUrl:
      overrides.auditServiceUrl || process.env.AUDIT_SERVICE_URL || 'http://localhost:3006',
  };
}

module.exports = { buildServiceConfig };
