const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const { createApp } = require('../src/app');

function createTestApp() {
  const seedUsers = [
    {
      id_usuario: 10,
      nombre_usuario: 'qa_admin',
      nombre: 'QA Admin',
      rol: 'Administrador',
      estado: 'activo',
      contrasena_hash: bcrypt.hashSync('Admin1234', 10),
      intentos_fallidos: 0,
      bloqueo_hasta: null,
    },
  ];

  return createApp({
    seedUsers,
    service: undefined,
    serviceOptions: {
      jwtSecret: 'test-secret',
      jwtExpiresIn: '30m',
      maxLoginAttempts: 3,
      lockMinutes: 15,
    },
  });
}

test('POST /api/auth/login devuelve token con credenciales vÃ¡lidas', async () => {
  const app = createTestApp();

  const response = await request(app).post('/api/auth/login').send({
    nombre_usuario: 'qa_admin',
    contrasena: 'Admin1234',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(response.body.data.token);
  assert.equal(response.body.data.rol, 'Administrador');
});

test('POST /api/auth/login bloquea cuenta tras 3 intentos fallidos', async () => {
  const app = createTestApp();

  for (let i = 0; i < 2; i += 1) {
    const response = await request(app).post('/api/auth/login').send({
      nombre_usuario: 'qa_admin',
      contrasena: 'incorrecta',
    });
    assert.equal(response.status, 401);
  }

  const thirdAttempt = await request(app).post('/api/auth/login').send({
    nombre_usuario: 'qa_admin',
    contrasena: 'incorrecta',
  });

  assert.equal(thirdAttempt.status, 423);
  assert.equal(thirdAttempt.body.error.code, 'AUTH_ACCOUNT_BLOCKED');
});

test('GET /api/auth/verify valida token emitido', async () => {
  const app = createTestApp();

  const login = await request(app).post('/api/auth/login').send({
    nombre_usuario: 'qa_admin',
    contrasena: 'Admin1234',
  });

  const verify = await request(app)
    .get('/api/auth/verify')
    .set('Authorization', `Bearer ${login.body.data.token}`);

  assert.equal(verify.status, 200);
  assert.equal(verify.body.data.valid, true);
  assert.equal(verify.body.data.id_usuario, 10);
});

test('POST /api/auth/logout revoca token y verify devuelve 401', async () => {
  const app = createTestApp();

  const login = await request(app).post('/api/auth/login').send({
    nombre_usuario: 'qa_admin',
    contrasena: 'Admin1234',
  });

  const token = login.body.data.token;

  const logout = await request(app)
    .post('/api/auth/logout')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(logout.status, 200);

  const verifyAfterLogout = await request(app)
    .get('/api/auth/verify')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(verifyAfterLogout.status, 401);
  assert.equal(verifyAfterLogout.body.error.code, 'AUTH_TOKEN_REVOKED');
});

test('POST /api/auth/refresh devuelve nuevo token e invalida token previo', async () => {
  const app = createTestApp();

  const login = await request(app).post('/api/auth/login').send({
    nombre_usuario: 'qa_admin',
    contrasena: 'Admin1234',
  });

  const oldToken = login.body.data.token;

  const refresh = await request(app)
    .post('/api/auth/refresh')
    .set('Authorization', `Bearer ${oldToken}`);

  assert.equal(refresh.status, 200);
  assert.ok(refresh.body.data.token);
  assert.notEqual(refresh.body.data.token, oldToken);

  const oldTokenVerify = await request(app)
    .get('/api/auth/verify')
    .set('Authorization', `Bearer ${oldToken}`);

  assert.equal(oldTokenVerify.status, 401);
  assert.equal(oldTokenVerify.body.error.code, 'AUTH_TOKEN_REVOKED');
});
