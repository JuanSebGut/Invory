'use strict';

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { pool } = require('./config/db');
const { errorHandler } = require('../../../shared/middlewares/errorHandler');
const { SupplierController } = require('./controllers/supplier.controller');
const {
  InMemorySupplierRepository,
  PgSupplierRepository,
} = require('./repositories/supplier.repository');
const { createSupplierRoutes } = require('./routes/supplier.routes');
const { SupplierService } = require('./services/supplier.service');

function createApp(options = {}) {
  const app = express();

  const repository =
    options.repository ||
    (process.env.SUPPLIER_REPOSITORY === 'inmemory'
      ? new InMemorySupplierRepository({ suppliers: options.seedSuppliers || [] })
      : new PgSupplierRepository({ pool }));

  const service = options.service || new SupplierService({ repository });
  const controller = options.controller || new SupplierController(service);

  app.use(cors());
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ success: true, message: 'Supplier Service activo' });
  });

  app.use('/api/providers', createSupplierRoutes(controller));

  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
