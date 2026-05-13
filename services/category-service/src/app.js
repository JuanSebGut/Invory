const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { errorHandler } = require('../../../shared/middlewares/errorHandler');
const { createPool } = require('./config/db');
const {
  PgCategoryRepository,
  InMemoryCategoryRepository,
} = require('./repositories/category.repository');
const { CategoryService } = require('./services/category.service');
const { CategoryController } = require('./controllers/category.controller');
const { createCategoryRoutes } = require('./routes/category.routes');

function createApp(options = {}) {
  const app = express();

  const repository =
    options.repository ||
    new PgCategoryRepository({
      pool: options.pool || createPool(),
    });

  const service =
    options.service ||
    new CategoryService({
      repository,
    });

  const controller = options.controller || new CategoryController(service);

  app.use(cors());
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ success: true, message: 'Category Service activo' });
  });

  app.use('/api/categories', createCategoryRoutes(controller));

  app.use(errorHandler);

  return app;
}

module.exports = {
  createApp,
  InMemoryCategoryRepository,
};
