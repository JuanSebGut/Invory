'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const { createClientRoutes, createFiadoRoutes } = require('../src/routes/client.routes');

function createAuthMiddleware(user) {
  return (_req, _res, next) => {
    _req.authUser = user;
    next();
  };
}

function buildApp(fetchImpl, user) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/clients',
    createClientRoutes({
      clientServiceUrl: 'http://client-service:3009',
      authMiddleware: createAuthMiddleware(user),
      fetchImpl,
    })
  );
  app.use(
    '/api/fiados',
    createFiadoRoutes({
      clientServiceUrl: 'http://client-service:3009',
      authMiddleware: createAuthMiddleware(user),
      fetchImpl,
    })
  );

  return app;
}

test('Empleado puede consultar GET /api/clients y hacer POST /api/fiados/:id/pagos', async () => {
  const calls = [];
  const app = buildApp(
    async (url, options) => {
      calls.push({ url: url.toString(), method: options.method });
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        async text() {
          return JSON.stringify({ success: true, data: [] });
        },
      };
    },
    { id_usuario: 2, nombre: 'Empleado Demo', rol: 'Empleado' }
  );

  const listResponse = await request(app).get('/api/clients?page=1&size=10');
  assert.equal(listResponse.status, 200);

  const payResponse = await request(app)
    .post('/api/fiados/9/pagos')
    .send({ monto: 1000, id_usuario: 2 });
  assert.equal(payResponse.status, 200);

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/clients\?page=1&size=10$/);
  assert.equal(calls[0].method, 'GET');
  assert.match(calls[1].url, /\/fiados\/9\/pagos$/);
  assert.equal(calls[1].method, 'POST');
});

test('Empleado no puede crear clientes (POST /api/clients)', async () => {
  let called = false;
  const app = buildApp(
    async () => {
      called = true;
      return {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        async text() {
          return JSON.stringify({ success: true });
        },
      };
    },
    { id_usuario: 2, nombre: 'Empleado Demo', rol: 'Empleado' }
  );

  const response = await request(app).post('/api/clients').send({ nombre: 'Nuevo cliente' });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'AUTH_FORBIDDEN');
  assert.equal(called, false);
});
