'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

const { createInventoryRouter } = require('../src/routes/inventory.routes');
const { createUserRoutes } = require('../src/routes/user.routes');

function auth(user) {
  return (req, _res, next) => {
    req.authUser = user;
    next();
  };
}

test('Gateway bloquea POST /api/inventory/movements tipo ajuste para Empleado', async () => {
  let called = false;
  const app = express();
  app.use(express.json());
  app.use(
    '/api/inventory',
    createInventoryRouter({
      inventoryServiceUrl: 'http://inventory-service:3005',
      authMiddleware: auth({ id_usuario: 2, nombre: 'Empleado', rol: 'Empleado' }),
      fetchImpl: async () => {
        called = true;
        return {
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          async text() {
            return JSON.stringify({ success: true });
          },
        };
      },
    })
  );

  const response = await request(app).post('/api/inventory/movements').send({
    id_producto: 1,
    tipo_movimiento: 'ajuste',
    cantidad: 1,
    tipo_ajuste: 'faltante',
    motivo_ajuste: 'prueba',
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'INVENTORY_ADJUSTMENT_FORBIDDEN');
  assert.equal(called, false);
});

test('Gateway restringe reportes profits/comparative para Empleado y facturas solo admin', async () => {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/inventory',
    createInventoryRouter({
      inventoryServiceUrl: 'http://inventory-service:3005',
      authMiddleware: auth({ id_usuario: 2, nombre: 'Empleado', rol: 'Empleado' }),
      fetchImpl: async () => ({
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        async text() {
          return JSON.stringify({ success: true });
        },
      }),
    })
  );

  const reportAllowed = await request(app).get('/api/inventory/reports/movements');
  assert.equal(reportAllowed.status, 200);

  const profitsForbidden = await request(app).get('/api/inventory/reports/profits');
  assert.equal(profitsForbidden.status, 403);

  const comparativeForbidden = await request(app).get('/api/inventory/reports/comparative');
  assert.equal(comparativeForbidden.status, 403);

  const invoiceForbidden = await request(app).get('/api/inventory/facturas');
  assert.equal(invoiceForbidden.status, 403);
});

test('Gateway permite PUT /api/users/:id/reset-password solo para Administrador', async () => {
  let called = false;
  const app = express();
  app.use(express.json());
  app.use(
    '/api/users',
    createUserRoutes({
      userServiceUrl: 'http://user-service:3004',
      authMiddleware: auth({ id_usuario: 1, nombre: 'Admin', rol: 'Administrador' }),
      fetchImpl: async (url, options) => {
        called = true;
        assert.match(url.toString(), /\/api\/users\/7\/reset-password$/);
        assert.equal(options.method, 'PUT');
        return {
          status: 200,
          async json() {
            return { success: true, message: 'Contraseña actualizada correctamente' };
          },
        };
      },
    })
  );

  const ok = await request(app)
    .put('/api/users/7/reset-password')
    .send({ nueva_contrasena: 'NuevaClave123' });

  assert.equal(ok.status, 200);
  assert.equal(called, true);

  const appEmpleado = express();
  appEmpleado.use(express.json());
  appEmpleado.use(
    '/api/users',
    createUserRoutes({
      userServiceUrl: 'http://user-service:3004',
      authMiddleware: auth({ id_usuario: 2, nombre: 'Empleado', rol: 'Empleado' }),
      fetchImpl: async () => ({
        status: 200,
        async json() {
          return { success: true };
        },
      }),
    })
  );

  const forbidden = await request(appEmpleado)
    .put('/api/users/7/reset-password')
    .send({ nueva_contrasena: 'NuevaClave123' });

  assert.equal(forbidden.status, 403);
});
