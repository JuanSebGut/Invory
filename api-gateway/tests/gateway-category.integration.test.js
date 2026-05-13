const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const request = require('supertest');

const { createApp: createAuthApp } = require('../../services/auth-service/src/app');
const {
  createApp: createCategoryApp,
  InMemoryCategoryRepository,
} = require('../../services/category-service/src/app');
const { createApp: createGatewayApp } = require('../src/app');

async function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function stopServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        return reject(error);
      }

      return resolve();
    });
  });
}

function createSeedUsers() {
  return [
    {
      id_usuario: 1,
      nombre_usuario: 'admin',
      nombre: 'Administrador',
      rol: 'Administrador',
      estado: 'activo',
      contrasena_hash: bcrypt.hashSync('Admin1234', 10),
      intentos_fallidos: 0,
      bloqueo_hasta: null,
    },
    {
      id_usuario: 2,
      nombre_usuario: 'operador',
      nombre: 'Operador',
      rol: 'Operador',
      estado: 'activo',
      contrasena_hash: bcrypt.hashSync('Operador123', 10),
      intentos_fallidos: 0,
      bloqueo_hasta: null,
    },
  ];
}

function createCategoryTestApp() {
  const repository = new InMemoryCategoryRepository({
    categories: [
      {
        id_categoria: 1,
        nombre_categoria: 'Abarrotes',
        descripcion: 'Productos base',
        estado: true,
      },
    ],
    products: [],
  });

  return createCategoryApp({ repository });
}

test('Gateway permite a Administrador crear categorias y a Operador solo consultar', async () => {
  const authApp = createAuthApp({ seedUsers: createSeedUsers() });
  const categoryApp = createCategoryTestApp();

  const authServer = await startServer(authApp);
  const categoryServer = await startServer(categoryApp);

  const authPort = authServer.address().port;
  const categoryPort = categoryServer.address().port;

  const gatewayApp = createGatewayApp({
    authServiceUrl: `http://127.0.0.1:${authPort}`,
    categoryServiceUrl: `http://127.0.0.1:${categoryPort}`,
  });

  const adminLogin = await request(authApp).post('/api/auth/login').send({
    nombre_usuario: 'admin',
    contrasena: 'Admin1234',
  });

  const operatorLogin = await request(authApp).post('/api/auth/login').send({
    nombre_usuario: 'operador',
    contrasena: 'Operador123',
  });

  const createResponse = await request(gatewayApp)
    .post('/api/categories')
    .set('Authorization', `Bearer ${adminLogin.body.data.token}`)
    .send({
      nombre_categoria: 'Lacteos',
      descripcion: 'Refrigerados',
    });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.body.message, 'Categoria creada correctamente');

  const forbiddenCreate = await request(gatewayApp)
    .post('/api/categories')
    .set('Authorization', `Bearer ${operatorLogin.body.data.token}`)
    .send({
      nombre_categoria: 'Bebidas',
    });

  assert.equal(forbiddenCreate.status, 403);
  assert.equal(forbiddenCreate.body.error.code, 'AUTH_FORBIDDEN');

  const listResponse = await request(gatewayApp)
    .get('/api/categories')
    .set('Authorization', `Bearer ${operatorLogin.body.data.token}`);

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.body.success, true);
  assert.equal(listResponse.body.data.categorias.length, 2);

  await stopServer(categoryServer);
  await stopServer(authServer);
});
