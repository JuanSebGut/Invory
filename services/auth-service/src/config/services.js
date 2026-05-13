require('dotenv').config();

function buildServiceConfig(overrides = {}) {
  return {
    ms09AuditWebhookUrl:
      overrides.ms09AuditWebhookUrl || process.env.MS09_AUDIT_WEBHOOK_URL || '',
  };
}

module.exports = { buildServiceConfig };
