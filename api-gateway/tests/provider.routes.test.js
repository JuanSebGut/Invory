'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const { createProviderRoutes } = require('../src/routes/provider.routes');

function createAuthMiddleware(user) {
  return (req, _res, next) => {
    req.authUser = user;
    next();
  };
}

function buildApp(fetchImpl, user = { id_usuario: 1, nombre: 'Admin Demo', rol: 'Administrador' }) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/providers',
    createProviderRoutes({
      providerServiceUrl: 'http://supplier-service:3008',
      authMiddleware: createAuthMiddleware(user),
      fetchImpl,
    })
  );
  return app;
}

test('GET /api/providers forwards the query to the supplier service', async () => {
  const calls = [];
  const app = buildApp(async (url, options) => {
    calls.push({ url: url.toString(), options });
    return {
      status: 200,
      async json() {
        return { success: true, data: { total: 1, proveedores: [] } };
      },
    };
  });

  const response = await request(app).get('/api/providers?estado=activo');

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/providers\?estado=activo$/);
  assert.equal(calls[0].options.method, 'GET');
});

test('POST /api/providers blocks non-admin users before calling upstream', async () => {
  let called = false;
  const app = buildApp(async () => {
    called = true;
    return {
      status: 200,
      async json() {
        return { success: true };
      },
    };
  }, { id_usuario: 2, nombre: 'Operador Demo', rol: 'Operador' });

  const response = await request(app).post('/api/providers').send({
    nombre_razon_social: 'Proveedor Demo',
    nit_identificacion: '900111222',
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'AUTH_FORBIDDEN');
  assert.equal(called, false);
});
