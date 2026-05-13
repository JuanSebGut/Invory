require('dotenv').config();

function buildServiceConfig(overrides = {}) {
  return {
    authServiceUrl:
      overrides.authServiceUrl || process.env.AUTH_SERVICE_URL || 'http://localhost:3002',
    ms06MovementWebhookUrl:
      overrides.ms06MovementWebhookUrl || process.env.MS06_MOVEMENT_WEBHOOK_URL || '',
    ms09MovementWebhookUrl:
      overrides.ms09MovementWebhookUrl || process.env.MS09_MOVEMENT_WEBHOOK_URL || '',
  };
}

module.exports = { buildServiceConfig };
