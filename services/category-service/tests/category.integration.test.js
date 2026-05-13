const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp, InMemoryCategoryRepository } = require('../src/app');

function createTestApp({ categories, products } = {}) {
  const repository = new InMemoryCategoryRepository({
    categories:
      categories ||
      [
        {
          id_categoria: 1,
          nombre_categoria: 'Abarrotes',
          descripcion: 'Productos de consumo diario',
          estado: true,
        },
        {
          id_categoria: 2,
          nombre_categoria: 'Temporal',
          descripcion: null,
          estado: false,
        },
      ],
    products:
      products ||
      [
        {
          id_producto: 10,
          id_categoria: 1,
          nombre: 'Arroz',
          estado: true,
        },
      ],
  });

  return createApp({ repository });
}

test('POST /api/categories crea una categoria nueva', async () => {
  const app = createTestApp({ products: [] });

  const response = await request(app).post('/api/categories').send({
    nombre_categoria: 'Lacteos',
    descripcion: 'Cadena de frio',
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.message, 'Categoria creada correctamente');
});

test('POST /api/categories rechaza nombres duplicados case-insensitive', async () => {
  const app = createTestApp({ products: [] });

  const response = await request(app).post('/api/categories').send({
    nombre_categoria: 'ABARROTES',
    descripcion: 'Duplicado',
  });

  assert.equal(response.status, 409);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error, 'El nombre de categoria ya existe');
});

test('GET /api/categories aplica filtro por estado y por defecto devuelve activos', async () => {
  const app = createTestApp();

  const defaultResponse = await request(app).get('/api/categories');
  assert.equal(defaultResponse.status, 200);
  assert.equal(defaultResponse.body.data.categorias.length, 1);
  assert.equal(defaultResponse.body.data.categorias[0].estado, 'activo');

  const allResponse = await request(app).get('/api/categories').query({ estado: 'todos' });
  assert.equal(allResponse.status, 200);
  assert.equal(allResponse.body.data.categorias.length, 2);
});

test('PUT /api/categories devuelve 409 al intentar deshabilitar una categoria en uso', async () => {
  const app = createTestApp();

  const response = await request(app).put('/api/categories/1').send({
    estado: 'inactivo',
  });

  assert.equal(response.status, 409);
  assert.equal(
    response.body.error,
    'No se puede deshabilitar: hay productos activos en esta categoria'
  );
});

test('DELETE /api/categories realiza borrado logico cuando no hay productos activos', async () => {
  const app = createTestApp({
    products: [],
  });

  const response = await request(app).delete('/api/categories/1');

  assert.equal(response.status, 200);
  assert.equal(response.body.message, 'Categoria deshabilitada');

  const inactiveList = await request(app).get('/api/categories').query({ estado: 'inactivo' });
  assert.equal(inactiveList.status, 200);
  assert.equal(inactiveList.body.data.categorias.length, 2);
});
