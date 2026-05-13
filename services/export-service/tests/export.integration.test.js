'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const request = require('supertest');
const ExcelJS = require('exceljs');

const { createApp } = require('../src/app');
const { MAX_EXPORT_RECORDS } = require('../src/services/export.service');

function createAuthMiddleware(user) {
  return (req, _res, next) => {
    req.authUser = user;
    next();
  };
}

function createTestApp({
  user = { id_usuario: 1, nombre: 'Admin Demo', rol: 'Administrador' },
  dataSources = {},
  fetchImpl,
} = {}) {
  return createApp({
    authMiddleware: createAuthMiddleware(user),
    exportDataSources: dataSources,
    exportTempDir: path.join(os.tmpdir(), `invory-export-test-${randomUUID()}`),
    exportNowProvider: () => '2026-05-04T12:00:00.000Z',
    fetchImpl,
  });
}

function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

test('POST /api/export genera Excel y excluye campos sensibles', async () => {
  const app = createTestApp({
    dataSources: {
      productos: [
        {
          id_producto: 1,
          nombre: 'Cafe Premium',
          precio_venta: 15000,
          contrasena_hash: 'no-debe-salir',
          session_token: 'token-secreto',
        },
      ],
    },
  });

  const response = await request(app)
    .post('/api/export')
    .send({ conjunto_datos: 'productos', formato: 'EXCEL' })
    .buffer(true)
    .parse(binaryParser);

  assert.equal(response.status, 200);
  assert.match(response.headers['content-disposition'], /invory_productos_2026-05-04\.xlsx/);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(response.body);
  const ws = workbook.getWorksheet('Productos');
  assert.ok(ws);
  assert.equal(String(ws.getCell('A1').value), 'Productos');
});

test('POST /api/export genera PDF desde datos de movimientos', async () => {
  const app = createTestApp({
    dataSources: {
      movimientos: [
        {
          fecha: '2026-05-01',
          producto: 'Cafe Premium',
          tipo: 'entrada',
          cantidad: 8,
        },
      ],
    },
  });

  const response = await request(app)
    .post('/api/export')
    .send({ conjunto_datos: 'movimientos', formato: 'PDF' })
    .buffer(true)
    .parse(binaryParser);

  assert.equal(response.status, 200);
  assert.equal(response.body.slice(0, 4).toString('ascii'), '%PDF');
  assert.match(response.headers['content-disposition'], /invory_movimientos_2026-05-04\.pdf/);
});

test('POST /api/export genera Excel con extension xlsx', async () => {
  const app = createTestApp({
    dataSources: {
      categorias: [
        {
          id_categoria: 10,
          nombre_categoria: 'Bebidas',
          estado: true,
        },
      ],
    },
  });

  const response = await request(app)
    .post('/api/export')
    .send({ conjunto_datos: 'categorias', formato: 'EXCEL' })
    .buffer(true)
    .parse(binaryParser);

  assert.equal(response.status, 200);
  assert.equal(response.body.slice(0, 2).toString('ascii'), 'PK');
  assert.match(response.headers['content-disposition'], /invory_categorias_2026-05-04\.xlsx/);
  assert.equal(response.headers['x-export-records'], '1');
});

test('POST /api/export bloquea usuarios no administradores', async () => {
  const app = createTestApp({
    user: { id_usuario: 2, nombre: 'Empleado Demo', rol: 'Empleado' },
    dataSources: {
      productos: [{ id_producto: 1, nombre: 'Cafe Premium' }],
    },
  });

  const response = await request(app)
    .post('/api/export')
    .send({ conjunto_datos: 'productos', formato: 'EXCEL' });

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'AUTH_FORBIDDEN');
});

test('POST /api/export responde 404 sin datos y 400 con formato invalido', async () => {
  const app = createTestApp({
    dataSources: {
      productos: [],
    },
  });

  const emptyResponse = await request(app)
    .post('/api/export')
    .send({ conjunto_datos: 'productos', formato: 'EXCEL' });

  assert.equal(emptyResponse.status, 404);
  assert.equal(emptyResponse.body.error.code, 'EXPORT_DATA_NOT_FOUND');

  const invalidFormat = await request(app)
    .post('/api/export')
    .send({ conjunto_datos: 'productos', formato: 'TXT' });

  assert.equal(invalidFormat.status, 400);
  assert.equal(invalidFormat.body.error.code, 'VALIDATION_ERROR');
});

test('POST /api/export responde 413 cuando supera 100000 registros', async () => {
  const app = createTestApp({
    dataSources: {
      proveedores: Array.from({ length: MAX_EXPORT_RECORDS + 1 }, (_, index) => ({
        id_proveedor: index + 1,
        razon_social: `Proveedor ${index + 1}`,
      })),
    },
  });

  const response = await request(app)
    .post('/api/export')
    .send({ conjunto_datos: 'proveedores', formato: 'EXCEL' });

  assert.equal(response.status, 413);
  assert.equal(response.body.error.code, 'EXPORT_LIMIT_EXCEEDED');
});

