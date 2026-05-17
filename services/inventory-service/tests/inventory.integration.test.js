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

function buildTestContext(
  user = { id_usuario: 10, nombre: 'Empleado Demo', rol: 'Empleado' }
) {
  const repository = new InMemoryInventoryRepository({
    products: [
      {
        id_producto: 1,
        nombre: 'Agua Mineral 500ml',
        stock_actual: 10,
        estado: true,
      },
      {
        id_producto: 2,
        nombre: 'Papas Clasicas',
        stock_actual: 3,
        estado: true,
      },
    ],
  });

  const app = createApp({
    repository,
    notifier: { notifyMovementRegistered: async () => {} },
    authMiddleware: createTestAuthMiddleware(user),
  });

  return { app, repository };
}

function buildReportContext(
  user = { id_usuario: 10, nombre: 'Empleado Demo', rol: 'Empleado' }
) {
  const repository = new InMemoryInventoryRepository({
    products: [
      {
        id_producto: 1,
        nombre: 'Agua Mineral 500ml',
        id_categoria: 1,
        nombre_categoria: 'Bebidas',
        precio_venta: 15,
        stock_actual: 12,
        estado: true,
      },
      {
        id_producto: 2,
        nombre: 'Papas Clasicas',
        id_categoria: 2,
        nombre_categoria: 'Snacks',
        precio_venta: 8,
        stock_actual: 6,
        estado: true,
      },
      {
        id_producto: 3,
        nombre: 'Galletas Avena',
        id_categoria: 2,
        nombre_categoria: 'Snacks',
        precio_venta: 12,
        stock_actual: 4,
        estado: true,
      },
    ],
    movements: [
      {
        id_movimiento: 1,
        id_producto: 1,
        nombre_producto: 'Agua Mineral 500ml',
        movement_type: 'entrada',
        cantidad: 10,
        stock_anterior: 2,
        stock_posterior: 12,
        nombre_motivo: 'Compra / ReposiciÃƒÂ³n',
        tipo_operacion: 'ENTRADA',
        id_usuario: 1,
        nombre_usuario: 'Admin Demo',
        fecha_hora_exacta: '2026-04-01T08:00:00.000Z',
      },
      {
        id_movimiento: 2,
        id_producto: 1,
        nombre_producto: 'Agua Mineral 500ml',
        movement_type: 'salida',
        cantidad: 3,
        stock_anterior: 12,
        stock_posterior: 9,
        nombre_motivo: 'VENTA MOSTRADOR',
        tipo_operacion: 'SALIDA',
        id_usuario: 2,
        nombre_usuario: 'Empleado Demo',
        fecha_hora_exacta: '2026-04-10T10:00:00.000Z',
      },
      {
        id_movimiento: 3,
        id_producto: 2,
        nombre_producto: 'Papas Clasicas',
        movement_type: 'salida',
        cantidad: 2,
        stock_anterior: 8,
        stock_posterior: 6,
        nombre_motivo: 'Venta web',
        tipo_operacion: 'SALIDA',
        id_usuario: 2,
        nombre_usuario: 'Empleado Demo',
        fecha_hora_exacta: '2026-04-20T09:30:00.000Z',
      },
      {
        id_movimiento: 4,
        id_producto: 3,
        nombre_producto: 'Galletas Avena',
        movement_type: 'salida',
        cantidad: 1,
        stock_anterior: 5,
        stock_posterior: 4,
        nombre_motivo: 'Merma',
        tipo_operacion: 'SALIDA',
        id_usuario: 2,
        nombre_usuario: 'Empleado Demo',
        fecha_hora_exacta: '2026-04-12T09:30:00.000Z',
      },
    ],
  });

  const app = createApp({
    repository,
    notifier: { notifyMovementRegistered: async () => {} },
    authMiddleware: createTestAuthMiddleware(user),
  });

  return { app, repository };
}

function buildAdvancedReportContext(
  user = { id_usuario: 1, nombre: 'Admin Demo', rol: 'Administrador' }
) {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  const repository = new InMemoryInventoryRepository({
    products: [
      {
        id_producto: 1,
        nombre: 'Arroz 1Kg',
        id_categoria: 1,
        nombre_categoria: 'Granos',
        precio_compra: 3000,
        precio_venta: 4500,
        stock_actual: 25,
        estado: true,
      },
      {
        id_producto: 2,
        nombre: 'Azucar 1Kg',
        id_categoria: 1,
        nombre_categoria: 'Granos',
        precio_compra: 2800,
        precio_venta: 4200,
        stock_actual: 10,
        estado: true,
      },
      {
        id_producto: 3,
        nombre: 'Aceite 1L',
        id_categoria: 2,
        nombre_categoria: 'Despensa',
        precio_compra: 5000,
        precio_venta: 7000,
        stock_actual: 8,
        estado: true,
      },
    ],
    movements: [
      {
        id_movimiento: 1,
        id_producto: 1,
        cantidad: 10,
        stock_anterior: 15,
        stock_posterior: 25,
        nombre_motivo: 'Compra / Reposicion',
        tipo_operacion: 'ENTRADA',
        fecha_hora_exacta: yesterday.toISOString(),
      },
      {
        id_movimiento: 2,
        id_producto: 1,
        cantidad: 4,
        stock_anterior: 29,
        stock_posterior: 25,
        nombre_motivo: 'Venta',
        tipo_operacion: 'SALIDA',
        fecha_hora_exacta: now.toISOString(),
      },
      {
        id_movimiento: 3,
        id_producto: 2,
        cantidad: 2,
        stock_anterior: 12,
        stock_posterior: 10,
        nombre_motivo: 'Venta',
        tipo_operacion: 'SALIDA',
        fecha_hora_exacta: now.toISOString(),
      },
      {
        id_movimiento: 4,
        id_producto: 3,
        cantidad: 2,
        stock_anterior: 10,
        stock_posterior: 8,
        nombre_motivo: 'Venta',
        tipo_operacion: 'SALIDA',
        fecha_hora_exacta: sixtyDaysAgo.toISOString(),
      },
    ],
  });

  const app = createApp({
    repository,
    notifier: { notifyMovementRegistered: async () => {} },
    authMiddleware: createTestAuthMiddleware(user),
  });

  return { app, repository };
}

test('POST /api/inventory/movements registra una entrada y actualiza stock de forma atomica', async () => {
  const { app, repository } = buildTestContext();

  const response = await request(app).post('/api/inventory/movements').send({
    id_producto: 1,
    tipo_movimiento: 'entrada',
    cantidad: 5,
    comentario: 'Ingreso por compra',
    numero_factura: 'FAC-001',
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.stock_anterior, 10);
  assert.equal(response.body.data.nuevo_stock, 15);
  assert.equal(repository.movements.length, 1);

  const product = await repository.getProductById(1);
  assert.equal(product.stock_actual, 15);
});

test('POST /api/inventory/movements rechaza cantidad decimal cuando el producto no permite fraccion', async () => {
  const { app, repository } = buildTestContext();

  const response = await request(app).post('/api/inventory/movements').send({
    id_producto: 1,
    tipo_movimiento: 'entrada',
    cantidad: 1.5,
    id_motivo: 1,
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(
    response.body.error.message,
    'Este producto no permite cantidades fraccionadas. Ingrese una cantidad entera.'
  );
  assert.equal(repository.movements.length, 0);
});

test('POST /api/inventory/movements permite cantidad decimal cuando el producto permite fraccion', async () => {
  const repository = new InMemoryInventoryRepository({
    products: [
      {
        id_producto: 1,
        nombre: 'Arroz Granel',
        stock_actual: 10,
        permite_fraccion: true,
        estado: true,
      },
    ],
  });
  const app = createApp({
    repository,
    notifier: { notifyMovementRegistered: async () => {} },
    authMiddleware: createTestAuthMiddleware({
      id_usuario: 10,
      nombre: 'Empleado Demo',
      rol: 'Empleado',
    }),
  });

  const response = await request(app).post('/api/inventory/movements').send({
    id_producto: 1,
    tipo_movimiento: 'entrada',
    cantidad: 1.5,
    id_motivo: 1,
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.data.nuevo_stock, 11.5);
  assert.equal(repository.movements.length, 1);
});

test('POST /api/inventory/movements rechaza salidas que dejan stock negativo', async () => {
  const { app, repository } = buildTestContext();

  const response = await request(app).post('/api/inventory/movements').send({
    id_producto: 2,
    tipo_movimiento: 'salida',
    cantidad: 5,
    motivo: 'Venta',
  });

  assert.equal(response.status, 422);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'INSUFFICIENT_STOCK');
  assert.equal(repository.movements.length, 0);

  const product = await repository.getProductById(2);
  assert.equal(product.stock_actual, 3);
});

test('POST /api/inventory/movements bloquea ajustes para usuarios no administradores', async () => {
  const { app } = buildTestContext({
    id_usuario: 11,
    nombre: 'Empleado Prueba',
    rol: 'Empleado',
  });

  const response = await request(app).post('/api/inventory/movements').send({
    id_producto: 1,
    tipo_movimiento: 'ajuste',
    cantidad: 2,
    tipo_ajuste: 'faltante',
    motivo_ajuste: 'Conteo ciclico',
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'INVENTORY_ADJUSTMENT_FORBIDDEN');
});

test('POST /api/inventory/movements bloquea ajustes por id_motivo para rol Empleado', async () => {
  const { app, repository } = buildTestContext({
    id_usuario: 11,
    nombre: 'Empleado Prueba',
    rol: 'Empleado',
  });

  const response = await request(app).post('/api/inventory/movements').send({
    id_producto: 1,
    tipo_movimiento: 'salida',
    cantidad: 1,
    id_motivo: 18,
    motivo: 'Venta',
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'INVENTORY_ADJUSTMENT_FORBIDDEN');
  assert.equal(
    response.body.error.message,
    'Solo el administrador puede registrar ajustes de inventario.'
  );
  assert.equal(repository.movements.length, 0);
});

test('POST /api/inventory/movements persiste id_factura cuando se envia en el body', async () => {
  const { app, repository } = buildTestContext({
    id_usuario: 1,
    nombre: 'Administrador',
    rol: 'Administrador',
  });

  const response = await request(app).post('/api/inventory/movements').send({
    id_producto: 1,
    tipo_movimiento: 'entrada',
    cantidad: 2,
    id_motivo: 1,
    id_factura: 99,
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.data.id_factura, 99);
  assert.equal(repository.movements[0].id_factura, 99);
});

test('POST /api/inventory/movements responde 404 si el proveedor no existe', async () => {
  const repository = new InMemoryInventoryRepository({
    products: [
      {
        id_producto: 1,
        nombre: 'Agua Mineral 500ml',
        stock_actual: 10,
        estado: true,
      },
    ],
  });
  repository.getProviderById = async () => null;

  const customApp = createApp({
    repository,
    notifier: { notifyMovementRegistered: async () => {} },
    authMiddleware: createTestAuthMiddleware({
      id_usuario: 10,
      nombre: 'Empleado Demo',
      rol: 'Empleado',
    }),
  });

  const response = await request(customApp).post('/api/inventory/movements').send({
    id_producto: 1,
    tipo_movimiento: 'entrada',
    cantidad: 2,
    id_proveedor: 999,
    numero_factura: 'FAC-404',
  });

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'SUPPLIER_NOT_FOUND');
});

test('GET /api/inventory/movements filtra por fecha, producto y tipo', async () => {
  const admin = { id_usuario: 1, nombre: 'Admin Demo', rol: 'Administrador' };
  const repository = new InMemoryInventoryRepository({
    products: [
      { id_producto: 1, nombre: 'Agua Mineral 500ml', stock_actual: 12, estado: true },
      { id_producto: 2, nombre: 'Papas Clasicas', stock_actual: 6, estado: true },
    ],
    movements: [
      {
        id_movimiento: 1,
        id_producto: 1,
        nombre_producto: 'Agua Mineral 500ml',
        tipo_movimiento: 'entrada',
        movement_type: 'entrada',
        cantidad: 2,
        stock_anterior: 10,
        stock_posterior: 12,
        comentarios: 'Carga inicial',
        id_usuario: admin.id_usuario,
        nombre_usuario: admin.nombre,
        fecha_hora_exacta: '2026-04-18T10:00:00.000Z',
      },
      {
        id_movimiento: 2,
        id_producto: 2,
        nombre_producto: 'Papas Clasicas',
        tipo_movimiento: 'salida',
        movement_type: 'salida',
        cantidad: 1,
        stock_anterior: 7,
        stock_posterior: 6,
        nombre_motivo: 'Venta',
        id_usuario: admin.id_usuario,
        nombre_usuario: admin.nombre,
        fecha_hora_exacta: '2026-04-17T10:00:00.000Z',
      },
    ],
  });

  const app = createApp({
    repository,
    notifier: { notifyMovementRegistered: async () => {} },
    authMiddleware: createTestAuthMiddleware(admin),
  });

  const response = await request(app).get(
    '/api/inventory/movements?producto=1&tipo=entrada&fecha=2026-04-18'
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.total, 1);
  assert.equal(response.body.data.items.length, 1);
  assert.equal(response.body.data.items[0].id_producto, 1);
  assert.equal(response.body.data.items[0].tipo, 'entrada');
});

// ===========================================================================
// ValidaciÃƒÂ³n de stock_minimo en salidas (fix reportado post-PR)
// ===========================================================================

function buildTestContextWithMinStock(
  user = { id_usuario: 10, nombre: 'Empleado Demo', rol: 'Empleado' }
) {
  const repository = new InMemoryInventoryRepository({
    products: [
      {
        id_producto: 1,
        nombre: 'Cafe Premium 250g',
        stock_actual: 12,
        stock_minimo: 5,
        estado: true,
      },
    ],
  });
  const app = createApp({
    repository,
    notifier: { notifyMovementRegistered: async () => {} },
    authMiddleware: createTestAuthMiddleware(user),
  });
  return { app, repository };
}

test('POST /api/inventory/movements rechaza salida que deja stock por debajo del minimo', async () => {
  const { app, repository } = buildTestContextWithMinStock();

  // stock_actual=12, stock_minimo=5. Salida de 8 dejarÃƒÂ­a stock en 4 (< 5).
  const response = await request(app).post('/api/inventory/movements').send({
    id_producto: 1,
    tipo_movimiento: 'salida',
    cantidad: 8,
    motivo: 'venta',
  });

  assert.equal(response.status, 422);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'BELOW_MINIMUM_STOCK');
  assert.match(response.body.error.message, /m[iÃƒÂ­]nimo permitido/);
  assert.equal(repository.movements.length, 0);

  // El stock NO se modificÃƒÂ³.
  const product = await repository.getProductById(1);
  assert.equal(product.stock_actual, 12);
});

test('POST /api/inventory/movements permite salida que deja stock justo en el minimo', async () => {
  const { app, repository } = buildTestContextWithMinStock();

  // stock_actual=12, stock_minimo=5. Salida de 7 deja stock en 5 (= minimo).
  const response = await request(app).post('/api/inventory/movements').send({
    id_producto: 1,
    tipo_movimiento: 'salida',
    cantidad: 7,
    motivo: 'venta',
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.data.nuevo_stock, 5);
  assert.equal(repository.movements.length, 1);
});

test('POST /api/inventory/movements?force=true permite a Administrador cruzar el minimo', async () => {
  const { app, repository } = buildTestContextWithMinStock({
    id_usuario: 1,
    nombre: 'Admin Demo',
    rol: 'Administrador',
  });

  const response = await request(app)
    .post('/api/inventory/movements?force=true')
    .send({
      id_producto: 1,
      tipo_movimiento: 'salida',
      cantidad: 10,
      motivo: 'venta',
      comentario: 'Pedido urgente autorizado por gerencia',
    });

  assert.equal(response.status, 201);
  assert.equal(response.body.data.nuevo_stock, 2); // bajo el minimo (5), pero forzado
  assert.equal(repository.movements.length, 1);
});

test('POST /api/inventory/movements?force=true rechaza override de Empleado', async () => {
  // Empleado NO puede usar force=true para saltarse el mÃƒÂ­nimo.
  const { app } = buildTestContextWithMinStock({
    id_usuario: 10,
    nombre: 'Empleado',
    rol: 'Empleado',
  });

  const response = await request(app)
    .post('/api/inventory/movements?force=true')
    .send({
      id_producto: 1,
      tipo_movimiento: 'salida',
      cantidad: 10,
      motivo: 'venta',
    });

  assert.equal(response.status, 422);
  assert.equal(response.body.error.code, 'BELOW_MINIMUM_STOCK');
});

test('POST /api/inventory/movements no aplica validacion de minimo en ajustes', async () => {
  // Los ajustes son correcciones de inventario real: un faltante legÃƒÂ­timo
  // puede dejar el stock bajo mÃƒÂ­nimo y eso es vÃƒÂ¡lido.
  const { app, repository } = buildTestContextWithMinStock({
    id_usuario: 1,
    nombre: 'Admin',
    rol: 'Administrador',
  });

  const response = await request(app).post('/api/inventory/movements').send({
    id_producto: 1,
    tipo_movimiento: 'ajuste',
    cantidad: 9,
    tipo_ajuste: 'faltante',
    motivo_ajuste: 'Conteo ciclico revelo faltante',
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.data.nuevo_stock, 3); // bajo mÃƒÂ­nimo (5), pero permitido
  assert.equal(repository.movements.length, 1);
});

// ===========================================================================
// PgInventoryRepository.getAlertSourceRows (fix: query SQL real)
// ===========================================================================

const {
  PgInventoryRepository,
} = require('../src/repositories/inventory.repository');

function createMockPool(rowsByCall) {
  const calls = [];
  const queue = Array.isArray(rowsByCall) ? [...rowsByCall] : [rowsByCall];
  return {
    calls,
    pool: {
      async query(sql, params) {
        calls.push({ sql, params });
        const next = queue.shift() ?? { rows: [] };
        return next;
      },
    },
  };
}

test('PgInventoryRepository.getAlertSourceRows mapea columnas SQL al shape esperado', async () => {
  const { pool, calls } = createMockPool({
    rows: [
      {
        id_producto: 7,
        nombre: 'Leche Entera 1L',
        id_categoria: 3,
        stock_actual: '4',
        stock_minimo: '5',
        stock_maximo: '20',
        fecha_vencimiento: '2026-05-02',
      },
    ],
  });
  const repo = new PgInventoryRepository({ pool });

  const result = await repo.getAlertSourceRows();

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /FROM productos/);
  assert.match(calls[0].sql, /p\.estado = true/);
  assert.deepEqual(result, [
    {
      productId: 7,
      productName: 'Leche Entera 1L',
      categoryId: 3,
      currentStock: 4,
      minStock: 5,
      maxStock: 20,
      expirationDate: '2026-05-02',
    },
  ]);
});

test('PgInventoryRepository.getAlertSourceRows filtra por categoryId cuando se provee', async () => {
  const { pool, calls } = createMockPool({ rows: [] });
  const repo = new PgInventoryRepository({ pool });

  await repo.getAlertSourceRows({ categoryId: '3' });

  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /p\.id_categoria = \$1/);
  assert.deepEqual(calls[0].params, ['3']);
});

test('PgInventoryRepository.getAlertSourceRows tolera columnas en null', async () => {
  // Producto sin fecha_vencimiento ni stock_maximo: las alertas correspondientes
  // simplemente no se generan, pero la fila se mapea sin lanzar.
  const { pool } = createMockPool({
    rows: [
      {
        id_producto: 9,
        nombre: 'Tornillos M5',
        id_categoria: 8,
        stock_actual: '100',
        stock_minimo: '10',
        stock_maximo: null,
        fecha_vencimiento: null,
      },
    ],
  });
  const repo = new PgInventoryRepository({ pool });

  const result = await repo.getAlertSourceRows();

  assert.equal(result[0].maxStock, undefined);
  assert.equal(result[0].expirationDate, null);
});

test('GET /api/inventory/reports/:reportType devuelve payload uniforme para movements, sales y stock', async () => {
  const { app } = buildReportContext();

  const [movementsResponse, salesResponse, stockResponse] = await Promise.all([
    request(app).get('/api/inventory/reports/movements'),
    request(app).get('/api/inventory/reports/sales'),
    request(app).get('/api/inventory/reports/stock'),
  ]);

  for (const response of [movementsResponse, salesResponse, stockResponse]) {
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(typeof response.body.data.meta.generatedAt, 'string');
    assert.ok(Array.isArray(response.body.data.columns));
    assert.ok(Array.isArray(response.body.data.items));
    assert.equal(typeof response.body.data.resumen_narrativo, 'string');
  }

  assert.equal(movementsResponse.body.data.meta.reportType, 'movements');
  assert.equal(salesResponse.body.data.meta.reportType, 'sales');
  assert.equal(stockResponse.body.data.meta.reportType, 'stock');
});

test('GET /api/inventory/reports/profits calcula metricas y narrativa para Administrador', async () => {
  const { app } = buildAdvancedReportContext({
    id_usuario: 1,
    nombre: 'Administrador',
    rol: 'Administrador',
  });

  const today = new Date().toISOString().slice(0, 10);
  const from = new Date();
  from.setDate(from.getDate() - 2);
  const fromDate = from.toISOString().slice(0, 10);

  const response = await request(app)
    .get('/api/inventory/reports/profits')
    .query({ fecha_desde: fromDate, fecha_hasta: today });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.fecha_desde, fromDate);
  assert.equal(response.body.data.fecha_hasta, today);
  assert.equal(response.body.data.total_ingresos, 26400);
  assert.equal(response.body.data.costo, 30000);
  assert.equal(response.body.data.ganancia_bruta, -3600);
  assert.equal(typeof response.body.data.margen_porcentual, 'number');
  assert.match(response.body.data.resumen_narrativo, /Durante el período del/);
});

test('GET /api/inventory/reports/profits devuelve 403 para Empleado', async () => {
  const { app } = buildAdvancedReportContext({
    id_usuario: 2,
    nombre: 'Empleado Demo',
    rol: 'Empleado',
  });

  const today = new Date().toISOString().slice(0, 10);
  const from = new Date();
  from.setDate(from.getDate() - 2);
  const fromDate = from.toISOString().slice(0, 10);

  const response = await request(app)
    .get('/api/inventory/reports/profits')
    .query({ fecha_desde: fromDate, fecha_hasta: today });

  assert.equal(response.status, 403);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'REPORT_FORBIDDEN');
});

test('GET /api/inventory/reports/comparative compara dos periodos para Administrador', async () => {
  const { app } = buildAdvancedReportContext({
    id_usuario: 1,
    nombre: 'Administrador',
    rol: 'Administrador',
  });

  const today = new Date();
  const actualDesde = new Date(today);
  actualDesde.setDate(today.getDate() - 2);
  const actualHasta = new Date(today);
  const anteriorDesde = new Date(today);
  anteriorDesde.setDate(today.getDate() - 70);
  const anteriorHasta = new Date(today);
  anteriorHasta.setDate(today.getDate() - 50);

  const response = await request(app)
    .get('/api/inventory/reports/comparative')
    .query({
      periodo_actual_desde: actualDesde.toISOString().slice(0, 10),
      periodo_actual_hasta: actualHasta.toISOString().slice(0, 10),
      periodo_anterior_desde: anteriorDesde.toISOString().slice(0, 10),
      periodo_anterior_hasta: anteriorHasta.toISOString().slice(0, 10),
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(typeof response.body.data.indicadores.total_movimientos.variacion_porcentual, 'number');
  assert.equal(typeof response.body.data.indicadores.valor_inventario_cierre.periodo_actual, 'number');
  assert.match(response.body.data.resumen_narrativo, /Comparando/);
});

test('GET /api/inventory/reports/no-movement retorna productos sin movimientos recientes', async () => {
  const { app } = buildAdvancedReportContext({
    id_usuario: 2,
    nombre: 'Empleado Demo',
    rol: 'Empleado',
  });

  const response = await request(app)
    .get('/api/inventory/reports/no-movement')
    .query({ dias: 30 });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.dias, 30);
  assert.ok(Array.isArray(response.body.data.items));
  assert.equal(response.body.data.items.some((item) => item.id_producto === 3), true);
  assert.match(response.body.data.resumen_narrativo, /sin movimientos/);
});

test('GET /api/inventory/reports/by-category retorna consolidado por categoria activa', async () => {
  const { app } = buildAdvancedReportContext({
    id_usuario: 2,
    nombre: 'Empleado Demo',
    rol: 'Empleado',
  });

  const response = await request(app).get('/api/inventory/reports/by-category');

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(Array.isArray(response.body.data.items));
  assert.equal(response.body.data.items.length >= 2, true);
  assert.match(response.body.data.resumen_narrativo, /categorías activas/i);
});

test('GET /api/inventory/reports/unknown responde 404 para tipos de reporte no soportados', async () => {
  const { app } = buildReportContext();

  const response = await request(app).get('/api/inventory/reports/unknown');

  assert.equal(response.status, 404);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'REPORT_NOT_FOUND');
});

test('GET /api/inventory/reports/sales aplica filtros combinados de fecha y categoria', async () => {
  const { app } = buildReportContext();

  const response = await request(app)
    .get('/api/inventory/reports/sales')
    .query({
      fecha_inicio: '2026-04-15',
      fecha_fin: '2026-04-30',
      categoria: 2,
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.items.length, 1);
  assert.equal(response.body.data.items[0].producto, 'Papas Clasicas');
  assert.equal(response.body.data.summary.total_quantity, 2);
  assert.equal(response.body.data.summary.total_value, 16);
});

test('GET /api/inventory/reports/stock ignora filtros no aplicables y filtra snapshot actual', async () => {
  const { app } = buildReportContext();

  const response = await request(app)
    .get('/api/inventory/reports/stock')
    .query({ categoria: 2, tipo: 'entrada', fecha_inicio: '2026-04-01' });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.items.length, 2);
  assert.equal(response.body.data.summary.total_quantity, 10);
});

test('GET /api/inventory/reports/sales incluye ventas con aliases observables del motivo', async () => {
  const { app } = buildReportContext();

  const response = await request(app).get('/api/inventory/reports/sales');

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.data.items.map((item) => item.tipo),
    ['venta', 'venta']
  );
  assert.equal(response.body.data.summary.total_quantity, 5);
  assert.equal(response.body.data.summary.total_value, 61);
});

test('GET /api/inventory/movements y reports mantienen la fecha local de Colombia', async () => {
  const repository = new InMemoryInventoryRepository({
    products: [
      {
        id_producto: 1,
        nombre: 'Agua Mineral 500ml',
        id_categoria: 1,
        nombre_categoria: 'Bebidas',
        precio_venta: 15,
        stock_actual: 12,
        estado: true,
      },
    ],
    movements: [
      {
        id_movimiento: 1,
        id_producto: 1,
        nombre_producto: 'Agua Mineral 500ml',
        movement_type: 'entrada',
        cantidad: 10,
        stock_anterior: 2,
        stock_posterior: 12,
        nombre_motivo: 'Compra / ReposiciÃƒÂ³n',
        tipo_operacion: 'ENTRADA',
        id_usuario: 1,
        nombre_usuario: 'Admin Demo',
        fecha_hora_exacta: '2026-05-05T02:15:00.000Z',
      },
    ],
  });
  const app = createApp({
    repository,
    notifier: { notifyMovementRegistered: async () => {} },
    authMiddleware: createTestAuthMiddleware({
      id_usuario: 10,
      nombre: 'Empleado Demo',
      rol: 'Empleado',
    }),
  });

  const [movementsResponse, reportResponse] = await Promise.all([
    request(app).get('/api/inventory/movements'),
    request(app).get('/api/inventory/reports/movements'),
  ]);

  assert.equal(movementsResponse.status, 200);
  assert.equal(reportResponse.status, 200);
  assert.equal(movementsResponse.body.data.items[0].fecha, '2026-05-04');
  assert.equal(reportResponse.body.data.items[0].fecha, '2026-05-04');
});

