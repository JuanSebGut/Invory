const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { pool } = require('./db');
const { AppError } = require('./errors');
const { ClientController } = require('./controllers/client.controller');
const { createClientRoutes } = require('./routes/client.routes');
const { PgClientRepository, InMemoryClientRepository } = require('./repositories/client.repository');

function createApp(options = {}) {
  const app = express();

  const repository =
    options.repository ||
    (process.env.CLIENT_REPOSITORY === 'inmemory'
      ? new InMemoryClientRepository({
          clients: options.seedClients || [],
          fiados: options.seedFiados || [],
          parametros: options.seedParametros || { dias_aviso_fiado: '1' },
        })
      : new PgClientRepository(pool));

  const controller = new ClientController(repository);

  app.use(cors());
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ success: true, message: 'Client Service activo' });
  });

  app.use('/', createClientRoutes(controller));

  app.use((err, _req, res, _next) => {
    if (!(err instanceof AppError) && err.code === '23503') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICTO_REFERENCIAL',
          message: 'No se puede completar la operacion por conflicto referencial',
        },
      });
    }

    return res.status(err.status || 500).json({
      success: false,
      error: {
        code: err.code || 'ERROR_INTERNO',
        message: err.message || 'Error interno del servidor',
      },
    });
  });

  return app;
}

module.exports = { createApp };
