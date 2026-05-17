const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../src/app');
const { InMemoryProductRepository } = require('../src/repositories/product.repository');

function buildTestContext() {
  const repository = new InMemoryProductRepository({
    units: [
      { id_unidad: 1, nombre: 'Unidad', abreviatura: 'und', tipo: 'unidad', factor_base: 1 },
      { id_unidad: 2, nombre: 'Kilogramo', abreviatura: 'kg', tipo: 'peso', factor_base: 1 },
    ],
    categories: [
      { id_categoria: 1, nombre_categoria: 'Bebidas', estado: true },
      { id_categoria: 2, nombre_categoria: 'Snacks', estado: 'activo' },
      { id_categoria: 3, nombre_categoria: 'Descatalogados', estado: false },
    ],
    products: [
      {
        id_producto: 1,
        id_categoria: 1,
        id_unidad: 1,
        permite_fraccion: false,
        nombre: 'Agua Mineral 500ml',
        codigo_barras_unico: '7501234567890',
        precio_compra: 10,
        precio_venta: 15,
        stock_actual: 20,
        stock_minimo: 2,
        stock_maximo: 50,
        ubicacion: 'Pasillo A',
        estado: true,
      },
      {
        id_producto: 2,
        id_categoria: 2,
        id_unidad: 2,
        permite_fraccion: true,
        nombre: 'Papas Clasicas',
        codigo_barras_unico: '7501234567891',
        precio_compra: 8,
        precio_venta: 12,
        stock_actual: 5,
        stock_minimo: 1,
        estado: true,
      },
      {
        id_producto: 3,
        id_categoria: 1,
        nombre: 'Producto Eliminado',
        codigo_barras_unico: '7501234567892',
        precio_compra: 4,
        precio_venta: 6,
        stock_actual: 0,
        estado: false,
      },
    ],
  });

  const app = createApp({ repository });

  return { app, repository };
}

test('POST /api/products crea producto y retorna warning si precio de venta es menor al de compra', async () => {
  const { app, repository } = buildTestContext();

  const response = await request(app).post('/api/products').send({
    nombre: 'Jugo de Naranja',
    codigo_barras: '7501234567893',
    id_categoria: 1,
    id_unidad: 2,
    permite_fraccion: true,
    precio_compra: 20,
    precio_venta: 18,
    stock_inicial: 4,
    stock_minimo: 1,
    ubicacion: 'Nevera 2',
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.nombre, 'Jugo de Naranja');
  assert.equal(response.body.data.stock_actual, 4);
  assert.equal(response.body.data.id_unidad, 2);
  assert.equal(response.body.data.permite_fraccion, true);
  assert.equal(response.body.data.unidad.abreviatura, 'kg');
  assert.equal(response.body.warning.code, 'SALE_PRICE_BELOW_PURCHASE_PRICE');

  const created = await repository.getRawById(response.body.data.id_producto);
  assert.equal(created.codigo_barras, '7501234567893');
});

test('POST /api/products rechaza codigo de barras duplicado EAN-13', async () => {
  const { app } = buildTestContext();

  const response = await request(app).post('/api/products').send({
    nombre: 'Producto Duplicado',
    codigo_barras: '7501234567890',
    id_categoria: 1,
    precio_compra: 10,
    precio_venta: 12,
    stock_inicial: 1,
  });

  assert.equal(response.status, 409);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'PRODUCT_BARCODE_ALREADY_EXISTS');
});

test('POST /api/products valida que la categoria exista y este activa', async () => {
  const { app } = buildTestContext();

  const inactiveResponse = await request(app).post('/api/products').send({
    nombre: 'Categoria Inactiva',
    codigo_barras: '7501234567894',
    id_categoria: 3,
    precio_compra: 10,
    precio_venta: 12,
    stock_inicial: 1,
  });

  assert.equal(inactiveResponse.status, 409);
  assert.equal(inactiveResponse.body.error.code, 'CATEGORY_INACTIVE');

  const missingResponse = await request(app).post('/api/products').send({
    nombre: 'Categoria Faltante',
    codigo_barras: '7501234567895',
    id_categoria: 999,
    precio_compra: 10,
    precio_venta: 12,
    stock_inicial: 1,
  });

  assert.equal(missingResponse.status, 404);
  assert.equal(missingResponse.body.error.code, 'CATEGORY_NOT_FOUND');
});

test('GET /api/products pagina y filtra por nombre, categoria y codigo', async () => {
  const { app } = buildTestContext();

  const response = await request(app).get(
    '/api/products?page=1&size=10&name=papas&category=2&barcode=7891'
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.total, 1);
  assert.equal(response.body.data.productos.length, 1);
  assert.equal(response.body.data.productos[0].id_producto, 2);
  assert.equal(response.body.data.productos[0].unidad.abreviatura, 'kg');
});

test('GET /api/products/:id incluye unidad o null cuando no esta asignada', async () => {
  const { app } = buildTestContext();

  const withUnit = await request(app).get('/api/products/1');
  assert.equal(withUnit.status, 200);
  assert.equal(withUnit.body.data.unidad.abreviatura, 'und');

  const created = await request(app).post('/api/products').send({
    nombre: 'Producto Sin Unidad',
    codigo_barras: '7501234567896',
    id_categoria: 1,
    precio_compra: 5,
    precio_venta: 8,
    stock_inicial: 2,
  });
  assert.equal(created.status, 201);

  const withoutUnit = await request(app).get(`/api/products/${created.body.data.id_producto}`);
  assert.equal(withoutUnit.status, 200);
  assert.equal(withoutUnit.body.data.unidad, null);
});

test('PUT /api/products/:id actualiza parcialmente y bloquea cambio de barcode', async () => {
  const { app } = buildTestContext();

  const okResponse = await request(app).put('/api/products/2').send({
    nombre: 'Papas Clasicas XL',
    precio_venta: 14,
    stock_minimo: 2,
    id_unidad: 1,
    permite_fraccion: false,
  });

  assert.equal(okResponse.status, 200);
  assert.equal(okResponse.body.data.nombre, 'Papas Clasicas XL');
  assert.equal(okResponse.body.data.precio_venta, 14);
  assert.equal(okResponse.body.data.stock_minimo, 2);
  assert.equal(okResponse.body.data.id_unidad, 1);
  assert.equal(okResponse.body.data.permite_fraccion, false);
  assert.equal(okResponse.body.data.unidad.abreviatura, 'und');

  const blockedResponse = await request(app).put('/api/products/2').send({
    codigo_barras: '7501234567000',
  });

  assert.equal(blockedResponse.status, 409);
  assert.equal(blockedResponse.body.error.code, 'PRODUCT_BARCODE_IMMUTABLE');
});

test('DELETE /api/products/:id realiza borrado logico y lo excluye del listado', async () => {
  const { app, repository } = buildTestContext();

  const deleteResponse = await request(app).delete('/api/products/2');

  assert.equal(deleteResponse.status, 200);
  assert.equal(deleteResponse.body.success, true);
  assert.equal(deleteResponse.body.data.estado, false);

  const raw = await repository.getRawById(2);
  assert.equal(raw.estado, false);

  const listResponse = await request(app).get('/api/products?page=1&size=10');
  assert.equal(listResponse.status, 200);
  assert.equal(
    listResponse.body.data.productos.some((item) => item.id_producto === 2),
    false
  );
});

test('GET /api/products/units lista unidades y GET /api/products/units/:id retorna una unidad', async () => {
  const { app } = buildTestContext();

  const listResponse = await request(app).get('/api/products/units');
  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.success, true);
  assert.equal(Array.isArray(listResponse.body.data.unidades), true);
  assert.equal(listResponse.body.data.unidades.length, 2);

  const getResponse = await request(app).get('/api/products/units/2');
  assert.equal(getResponse.status, 200);
  assert.equal(getResponse.body.success, true);
  assert.equal(getResponse.body.data.id_unidad, 2);
  assert.equal(getResponse.body.data.abreviatura, 'kg');
});

test('GET /api/products responde por debajo de 1000ms en escenario local', async () => {
  const { app } = buildTestContext();

  const start = performance.now();
  const response = await request(app).get('/api/products?page=1&size=10');
  const elapsedMs = performance.now() - start;

  assert.equal(response.status, 200);
  assert.equal(elapsedMs < 1000, true);
});
