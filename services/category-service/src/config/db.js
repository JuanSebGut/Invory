const { Pool } = require('pg');

function createPool(overrides = {}) {
  return new Pool({
    host: overrides.host || process.env.DB_HOST,
    port: overrides.port || process.env.DB_PORT,
    user: overrides.user || process.env.DB_USER,
    password: overrides.password || process.env.DB_PASSWORD,
    database: overrides.database || process.env.DB_NAME,
  });
}

module.exports = { createPool };
