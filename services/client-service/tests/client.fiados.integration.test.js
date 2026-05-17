const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../app');
const { InMemoryClientRepository } = require('../repositories/client.repository');

function buildContext() {
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  const soon = new Date(today);
  soon.setDate(soon.getDate() + 1);
  const soonIso = soon.toISOString().slice(0, 10);

  const overdue = new Date(today);
  overdue.setDate(overdue.getDate() - 1);
  const overdueIso = overdue.toISOString().slice(0, 10);

  const repository = new InMemoryClientRepository({
    clients: [
      {
        id_cliente: 1,
        nombre: 'Tienda Centro',
        telefono: '3001112233',
        direccion: 'Calle 10',
        correo: 'centro@test.com',
        documento: '900123123',
        estado: true,
        fecha_creacion: new Date().toISOString(),
      },
    ],
    fiados: [
      {
        id_fiado: 1,
        id_cliente: 1,
        id_usuario: 1,
        id_factura: null,
        monto_total: 100,
        monto_pagado: 20,
        saldo_pendiente: 80,
        fecha_fiado: new Date().toISOString(),
        fecha_pago_acordada: overdueIso,
        estado: 'pendiente',
        observaciones: null,
      },
      {
        id_fiado: 2,
        id_cliente: 1,
        id_usuario: 1,
        id_factura: null,
        monto_total: 50,
        monto_pagado: 0,
        saldo_pendiente: 50,
        fecha_fiado: new Date().toISOString(),
        fecha_pago_acordada: soonIso,
        estado: 'pendiente',
        observaciones: null,
      },
      {
        id_fiado: 3,
        id_cliente: 1,
        id_usuario: 1,
        id_factura: null,
        monto_total: 30,
        monto_pagado: 0,
        saldo_pendiente: 30,
        fecha_fiado: new Date().toISOString(),
        fecha_pago_acordada: todayIso,
        estado: 'pagado',
        observaciones: null,
      },
    ],
    parametros: { dias_aviso_fiado: '2' },
  });

  const app = createApp({ repository });
  return { app };
}

test('POST /clients/:id/fiados crea fiado', async () => {
  const { app } = buildContext();
  const response = await request(app).post('/clients/1/fiados').send({
    id_usuario: 5,
    monto_total: 120.5,
    fecha_pago_acordada: '2026-06-10',
    observaciones: 'Fiado semanal',
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.id_cliente, 1);
  assert.equal(response.body.data.estado, 'pendiente');
  assert.equal(response.body.data.saldo_pendiente, 120.5);
});

test('POST /fiados/:id_fiado/pagos cambia estado a pagado al saldar deuda', async () => {
  const { app } = buildContext();

  const response = await request(app).post('/fiados/1/pagos').send({
    id_usuario: 2,
    monto: 80,
    observaciones: 'Pago total',
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.fiado.estado, 'pagado');
  assert.equal(response.body.data.fiado.saldo_pendiente, 0);
});

test('POST /fiados/:id_fiado/pagos retorna 409 si abono supera saldo', async () => {
  const { app } = buildContext();

  const response = await request(app).post('/fiados/1/pagos').send({
    id_usuario: 2,
    monto: 100,
  });

  assert.equal(response.status, 409);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'ABONO_SUPERA_SALDO');
});

test('GET /fiados/alertas retorna vencidos y por vencer segun dias_aviso_fiado', async () => {
  const { app } = buildContext();

  const response = await request(app).get('/fiados/alertas');

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.dias_aviso_fiado, 2);
  assert.equal(response.body.data.items.length, 2);
  assert.equal(response.body.data.items.some((item) => item.tipo_alerta === 'vencido'), true);
  assert.equal(response.body.data.items.some((item) => item.tipo_alerta === 'por_vencer'), true);
});
