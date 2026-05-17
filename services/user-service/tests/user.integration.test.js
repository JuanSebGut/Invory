const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const { createApp } = require('../src/app');
const { InMemoryUserRepository } = require('../src/repositories/user.repository');

function buildTestContext() {
  const repository = new InMemoryUserRepository({
    users: [
      {
        id_usuario: 1,
        id_rol: 1,
        nombre: 'Admin Principal',
        correo: 'admin@stocker.test',
        contrasena: bcrypt.hashSync('Admin1234', 10),
        estado: true,
        fecha_creacion: new Date().toISOString(),
        ultimo_acceso: null,
        intentos_fallidos: 0,
        bloqueado: false,
      },
      {
        id_usuario: 2,
        id_rol: 2,
        nombre: 'Usuario Operativo',
        correo: 'operativo@stocker.test',
        contrasena: bcrypt.hashSync('Operativo123', 10),
        estado: true,
        fecha_creacion: new Date().toISOString(),
        ultimo_acceso: null,
        intentos_fallidos: 0,
        bloqueado: false,
      },
      {
        id_usuario: 3,
        id_rol: 2,
        nombre: 'Usuario Inactivo',
        correo: 'inactivo@stocker.test',
        contrasena: bcrypt.hashSync('Inactivo123', 10),
        estado: false,
        fecha_creacion: new Date().toISOString(),
        ultimo_acceso: null,
        intentos_fallidos: 0,
        bloqueado: false,
      },
    ],
  });

  const app = createApp({
    repository,
    auditNotifier: {
      notifyUserCreated: async () => {},
      notifyUserUpdated: async () => {},
      notifyUserDisabled: async () => {},
      notifyPasswordReset: async () => {},
    },
    serviceOptions: {
      bcryptSaltRounds: 4,
    },
  });

  return { app, repository };
}

function buildTestContextWithAuditSpy() {
  const repository = new InMemoryUserRepository({
    users: [
      {
        id_usuario: 1,
        id_rol: 1,
        nombre: 'Admin Principal',
        correo: 'admin@stocker.test',
        contrasena: bcrypt.hashSync('Admin1234', 10),
        estado: true,
        fecha_creacion: new Date().toISOString(),
        ultimo_acceso: null,
        intentos_fallidos: 2,
        bloqueado: true,
      },
      {
        id_usuario: 2,
        id_rol: 2,
        nombre: 'Usuario Operativo',
        correo: 'operativo@stocker.test',
        contrasena: bcrypt.hashSync('Operativo123', 10),
        estado: true,
        fecha_creacion: new Date().toISOString(),
        ultimo_acceso: null,
        intentos_fallidos: 5,
        bloqueado: true,
      },
    ],
  });

  const calls = [];
  const auditNotifier = {
    notifyUserCreated: async () => {},
    notifyUserUpdated: async () => {},
    notifyUserDisabled: async () => {},
    notifyPasswordReset: async (payload) => {
      calls.push(payload);
    },
  };

  const app = createApp({
    repository,
    auditNotifier,
    serviceOptions: {
      bcryptSaltRounds: 4,
    },
  });

  return { app, repository, calls };
}

test('POST /api/users crea usuario con hash bcrypt sin exponer contraseÃ±a', async () => {
  const { app, repository } = buildTestContext();

  const response = await request(app).post('/api/users').send({
    nombre: 'Nuevo Usuario',
    correo: 'nuevo@stocker.test',
    contrasena: 'ClaveSegura123',
    id_rol: 2,
  });

  assert.equal(response.status, 201);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.correo, 'nuevo@stocker.test');
  assert.equal(response.body.data.contrasena, undefined);

  const created = await repository.getRawById(response.body.data.id_usuario);
  assert.notEqual(created.contrasena, 'ClaveSegura123');
  assert.equal(await bcrypt.compare('ClaveSegura123', created.contrasena), true);
});

test('GET /api/users pagina y filtra por estado', async () => {
  const { app } = buildTestContext();

  const response = await request(app).get('/api/users?page=1&size=2&estado=activo');

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.total, 2);
  assert.equal(response.body.data.items.length, 2);
  assert.equal(response.body.data.items.every((item) => item.estado === true), true);
});

test('PUT /api/users/:id actualiza parcialmente campos opcionales', async () => {
  const { app } = buildTestContext();

  const response = await request(app).put('/api/users/2').send({
    nombre: 'Usuario Operativo Editado',
    estado: 'inactivo',
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.id_usuario, 2);
  assert.equal(response.body.data.nombre, 'Usuario Operativo Editado');
  assert.equal(response.body.data.estado, false);
});

test('DELETE /api/users/:id realiza borrado lÃ³gico', async () => {
  const { app } = buildTestContext();

  const response = await request(app)
    .delete('/api/users/2')
    .set('x-user-id', '1')
    .set('x-user-role', 'Administrador');

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.data.estado, false);
});

test('regla de negocio: admin no puede deshabilitarse a sÃ­ mismo', async () => {
  const { app } = buildTestContext();

  const response = await request(app)
    .put('/api/users/1')
    .set('x-user-id', '1')
    .set('x-user-role', 'Administrador')
    .send({ estado: false });

  assert.equal(response.status, 409);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'ADMIN_SELF_DISABLE_FORBIDDEN');
});

test('GET /api/users responde por debajo de 1000ms en escenario local', async () => {
  const { app } = buildTestContext();

  const start = performance.now();
  const response = await request(app).get('/api/users?page=1&size=10');
  const elapsedMs = performance.now() - start;

  assert.equal(response.status, 200);
  assert.equal(elapsedMs < 1000, true);
});

test('PUT /api/users/:id/reset-password restablece clave, desbloquea usuario y registra auditoria', async () => {
  const { app, repository, calls } = buildTestContextWithAuditSpy();

  const response = await request(app)
    .put('/api/users/2/reset-password')
    .set('x-user-id', '1')
    .set('x-user-role', 'Administrador')
    .send({
      nueva_contrasena: 'NuevaClave123',
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.message, 'Contraseña actualizada correctamente');

  const updated = await repository.getRawById(2);
  assert.equal(updated.intentos_fallidos, 0);
  assert.equal(updated.bloqueado, false);
  assert.equal(await bcrypt.compare('NuevaClave123', updated.contrasena), true);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].actorContext.userId, 1);
  assert.equal(calls[0].targetUserId, 2);
});

test('PUT /api/users/:id/reset-password retorna 403 si no es administrador', async () => {
  const { app } = buildTestContext();

  const response = await request(app)
    .put('/api/users/2/reset-password')
    .set('x-user-id', '2')
    .set('x-user-role', 'Empleado')
    .send({
      nueva_contrasena: 'NuevaClave123',
    });

  assert.equal(response.status, 403);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'RESET_PASSWORD_FORBIDDEN');
});

test('PUT /api/users/:id/reset-password valida longitud minima de nueva_contrasena', async () => {
  const { app } = buildTestContext();

  const response = await request(app)
    .put('/api/users/2/reset-password')
    .set('x-user-id', '1')
    .set('x-user-role', 'Administrador')
    .send({
      nueva_contrasena: 'corta',
    });

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});
