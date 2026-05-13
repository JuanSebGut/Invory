const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp: createAuthApp } = require('../../services/auth-service/src/app');
const { createApp: createGatewayApp } = require('../src/app');

async function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function stopServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) return reject(error);
      return resolve();
    });
  });
}

test('Gateway autoriza acceso protegido con token vÃ¡lido de auth-service', async () => {
  const authApp = createAuthApp();

  const authServer = await startServer(authApp);
  const authPort = authServer.address().port;

  const gatewayApp = createGatewayApp({
    authServiceUrl: `http://127.0.0.1:${authPort}`,
  });

  const login = await request(authApp).post('/api/auth/login').send({
    nombre_usuario: 'admin',
    contrasena: 'Admin1234',
  });

  const token = login.body.data.token;

  const response = await request(gatewayApp)
    .get('/api/protected/ping')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.usuario.id_usuario, 1);

  await stopServer(authServer);
});

test('Gateway rechaza acceso protegido sin token', async () => {
  const gatewayApp = createGatewayApp({ authServiceUrl: 'http://127.0.0.1:3002' });

  const response = await request(gatewayApp).get('/api/protected/ping');

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'AUTH_TOKEN_MISSING');
});

test('Gateway rechaza token revocado por logout en auth-service', async () => {
  const authApp = createAuthApp();

  const authServer = await startServer(authApp);
  const authPort = authServer.address().port;

  const gatewayApp = createGatewayApp({
    authServiceUrl: `http://127.0.0.1:${authPort}`,
  });

  const login = await request(authApp).post('/api/auth/login').send({
    nombre_usuario: 'admin',
    contrasena: 'Admin1234',
  });

  const token = login.body.data.token;

  await request(authApp)
    .post('/api/auth/logout')
    .set('Authorization', `Bearer ${token}`)
    .send({});

  const response = await request(gatewayApp)
    .get('/api/protected/ping')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'AUTH_TOKEN_REVOKED');

  await stopServer(authServer);
});
