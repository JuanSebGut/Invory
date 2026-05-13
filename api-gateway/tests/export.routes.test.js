'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const { createExportRoutes } = require('../src/routes/export.routes');

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
    '/api/export',
    createExportRoutes({
      exportServiceUrl: 'http://export-service:3007',
      authMiddleware: createAuthMiddleware(user),
      fetchImpl,
    })
  );
  return app;
}

test('POST /api/export forwards the payload and streams CSV content', async () => {
  const calls = [];
  const app = buildApp(async (url, options) => {
    calls.push({ url: url.toString(), options });
    return {
      status: 200,
      headers: new Headers({
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="productos_2026-05-04.csv"',
        'x-export-records': '1',
      }),
      async arrayBuffer() {
        return Buffer.from('id_producto,nombre\n1,Cafe Premium\n');
      },
    };
  });

  const response = await request(app)
    .post('/api/export')
    .send({ conjunto_datos: 'productos', formato: 'CSV' });

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/export$/);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.match(calls[0].options.body, /productos/);
  assert.match(response.text, /Cafe Premium/);
  assert.equal(response.headers['x-export-records'], '1');
});

test('POST /api/export blocks non-admin users before calling upstream', async () => {
  let called = false;
  const app = buildApp(async () => {
    called = true;
    return {
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      async arrayBuffer() {
        return Buffer.from('{}');
      },
    };
  }, { id_usuario: 2, nombre: 'Operador Demo', rol: 'Operador' });

  const response = await request(app)
    .post('/api/export')
    .send({ conjunto_datos: 'productos', formato: 'CSV' });

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'AUTH_FORBIDDEN');
  assert.equal(called, false);
});

test('POST /api/export preserves upstream JSON errors', async () => {
  const app = buildApp(async () => ({
    status: 404,
    headers: new Headers({ 'content-type': 'application/json' }),
    async arrayBuffer() {
      return Buffer.from(JSON.stringify({
        success: false,
        error: { code: 'EXPORT_DATA_NOT_FOUND', message: 'No se encontraron datos' },
      }));
    },
  }));

  const response = await request(app)
    .post('/api/export')
    .send({ conjunto_datos: 'productos', formato: 'JSON' });

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'EXPORT_DATA_NOT_FOUND');
});
