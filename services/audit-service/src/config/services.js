require('dotenv').config();

function buildServiceConfig(overrides = {}) {
  return {
    authServiceUrl:
      overrides.authServiceUrl || process.env.AUTH_SERVICE_URL || 'http://localhost:3002',
  };
}

module.exports = { buildServiceConfig };
