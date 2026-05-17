const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../src/app');
const { InMemoryInventoryRepository } = require('../src/repositories/inventory.repository');

function createTestAuthMiddleware(user) {
  return (req, _res, next) => {
    req.authUser = user;
    next();
  };
}

function buildFacturaContext(user = { id_usuario: 9, nombre: 'Admin', rol: 'Administrador' }) {
  const repository = new InMemoryInventoryRepository({
    products: [
      { id_producto: 1, nombre: 'Cafe', stock_actual: 10, estado: true },
      { id_producto: 2, nombre: 'Azucar', stock_actual: 20, estado: true },
    ],
    clients: [
      {
        id_cliente: 1,
        nombre: 'Cliente Demo',
        telefono: '3001234567',
        direccion: 'Calle 10',
        correo: 'cliente@demo.com',
        documento: '900123',
      },
    ],
    parametros: {
      prefijo_factura: 'FAC',
      consecutivo_factura_actual: '0',
    },
  });

  const app = createApp({
    repository,
    notifier: { notifyMovementRegistered: async () => {} },
    authMiddleware: createTestAuthMiddleware(user),
  });

  return { app, repository };
}

test('POST /api/inventory/facturas crea factura y consecutivo incremental seguro', async () => {
  const { app } = buildFacturaContext();
  const year = new Date().toISOString().slice(0, 4);

  const payload = {
    id_cliente: 1,
    detalle: [
      { id_producto: 1, cantidad: 2, precio_unitario: 5000 },
      { id_producto: 2, cantidad: 1, precio_unitario: 3000 },
    ],
    descuento: 1000,
    tipo: 'venta',
    observaciones: 'Factura de prueba',
  };

  const first = await request(app)
    .post('/api/inventory/facturas')
    .set('x-user-id', '9')
    .send(payload);

  assert.equal(first.status, 201);
  assert.equal(first.body.success, true);
  assert.equal(first.body.data.numero_factura, `FAC-${year}-0001`);
  assert.equal(first.body.data.subtotal, 13000);
  assert.equal(first.body.data.total, 12000);

  const second = await request(app)
    .post('/api/inventory/facturas')
    .set('x-user-id', '9')
    .send(payload);

  assert.equal(second.status, 201);
  assert.equal(second.body.data.numero_factura, `FAC-${year}-0002`);
});

test('GET /api/inventory/facturas lista con filtros y paginacion', async () => {
  const { app } = buildFacturaContext();

  await request(app)
    .post('/api/inventory/facturas')
    .set('x-user-id', '9')
    .send({
      id_cliente: 1,
      detalle: [{ id_producto: 1, cantidad: 1, precio_unitario: 1000 }],
      descuento: 0,
      tipo: 'venta',
    });

  await request(app)
    .post('/api/inventory/facturas')
    .set('x-user-id', '9')
    .send({
      id_cliente: 1,
      detalle: [{ id_producto: 2, cantidad: 1, precio_unitario: 2500 }],
      descuento: 0,
      tipo: 'devolucion',
    });

  const listResponse = await request(app).get('/api/inventory/facturas?tipo=venta&page=1&size=10');

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.success, true);
  assert.equal(listResponse.body.data.total, 1);
  assert.equal(listResponse.body.data.items[0].tipo, 'venta');
});

test('GET /api/inventory/facturas/:id retorna factura completa con cliente y detalle', async () => {
  const { app } = buildFacturaContext();

  const createResponse = await request(app)
    .post('/api/inventory/facturas')
    .set('x-user-id', '9')
    .send({
      id_cliente: 1,
      detalle: [{ id_producto: 1, cantidad: 3, precio_unitario: 1500 }],
      descuento: 500,
      tipo: 'venta',
      observaciones: 'Impresion',
    });

  const idFactura = createResponse.body.data.id_factura;

  const detailResponse = await request(app).get(`/api/inventory/facturas/${idFactura}`);

  assert.equal(detailResponse.status, 200);
  assert.equal(detailResponse.body.success, true);
  assert.equal(detailResponse.body.data.id_factura, idFactura);
  assert.equal(detailResponse.body.data.cliente.nombre, 'Cliente Demo');
  assert.equal(detailResponse.body.data.detalle.length, 1);
});

test('PATCH /api/inventory/facturas/:id/anular requiere administrador y evita doble anulacion', async () => {
  const { app } = buildFacturaContext({ id_usuario: 5, nombre: 'Empleado', rol: 'Empleado' });

  const createResponse = await request(app)
    .post('/api/inventory/facturas')
    .set('x-user-id', '5')
    .send({
      id_cliente: 1,
      detalle: [{ id_producto: 1, cantidad: 1, precio_unitario: 2000 }],
      descuento: 0,
      tipo: 'venta',
    });

  const idFactura = createResponse.body.data.id_factura;

  const forbidden = await request(app)
    .patch(`/api/inventory/facturas/${idFactura}/anular`)
    .set('x-user-role', 'Empleado');

  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error.code, 'INVOICE_CANCEL_FORBIDDEN');

  const ok = await request(app)
    .patch(`/api/inventory/facturas/${idFactura}/anular`)
    .set('x-user-role', 'Administrador');

  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.estado, 'anulada');

  const conflict = await request(app)
    .patch(`/api/inventory/facturas/${idFactura}/anular`)
    .set('x-user-role', 'Administrador');

  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error.code, 'INVOICE_ALREADY_CANCELED');
});
