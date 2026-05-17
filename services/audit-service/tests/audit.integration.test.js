const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');
const { InMemoryAuditRepository } = require('../src/repositories/audit.repository');

async function startServer(app) {
  await app.ready;
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

async function stopServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        return reject(error);
      }

      return resolve();
    });
  });
}

function createTestAuthMiddleware(user) {
  return (req, _res, next) => {
    req.authUser = user;
    next();
  };
}

test('POST /api/audit/events registra evento y GET /api/audit/logs filtra por usuario, fecha y modulo', async () => {
  const app = createApp({
    repository: new InMemoryAuditRepository(),
    authMiddleware: createTestAuthMiddleware({
      id_usuario: 1,
      nombre: 'Administrador Demo',
      rol: 'Administrador',
    }),
  });

  const server = await startServer(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const registerResponse = await fetch(`${baseUrl}/api/audit/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'crear_usuario',
      module: 'usuarios',
      entity: 'usuario',
      entityId: 15,
      user: {
        id_usuario: 1,
        nombre: 'Administrador Demo',
        rol: 'Administrador',
      },
      detail: {
        mensaje: 'Usuario creado exitosamente',
        origen: 'qa',
      },
      previousData: {
        estado: null,
      },
      newData: {
        estado: true,
        correo: 'nuevo@invory.test',
      },
      sessionId: 'session-test-001',
    }),
  });

  assert.equal(registerResponse.status, 201);
  const registered = await registerResponse.json();
  assert.equal(registered.data.accion, 'crear_usuario');
  assert.equal(registered.data.modulo, 'usuarios');
  assert.equal(registered.data.usuario.nombre, 'Administrador Demo');

  const today = new Date().toISOString().slice(0, 10);
  const listResponse = await fetch(
    `${baseUrl}/api/audit/logs?usuario=Administrador&modulo=usuarios&fecha=${today}`
  );
  assert.equal(listResponse.status, 200);

  const listed = await listResponse.json();
  assert.equal(listed.data.total, 1);
  assert.equal(listed.data.logs.length, 1);
  assert.equal(listed.data.logs[0].detalle.origen, 'qa');
  assert.equal(listed.data.logs[0].datos_nuevos.estado, true);
  assert.equal(listed.data.logs[0].usuario.nombre, 'Administrador Demo');

  await stopServer(server);
});

test('GET /api/audit/logs soporta filtros id_usuario, entidad_afectada, id_accion y rango de fechas', async () => {
  const app = createApp({
    repository: new InMemoryAuditRepository(),
    authMiddleware: createTestAuthMiddleware({
      id_usuario: 1,
      nombre: 'Administrador Demo',
      rol: 'Administrador',
    }),
  });

  const server = await startServer(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const createEvent = (payload) =>
    fetch(`${baseUrl}/api/audit/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

  await createEvent({
    action: 'registrar_movimiento',
    module: 'inventario',
    entity: 'movimientos_inventario',
    entityId: 1001,
    user: { id_usuario: 7, nombre: 'Usuario Caja', rol: 'Empleado' },
    detail: { mensaje: 'Salida por venta' },
  });

  await createEvent({
    action: 'crear_usuario',
    module: 'usuarios',
    entity: 'usuarios',
    entityId: 1002,
    user: { id_usuario: 1, nombre: 'Administrador Demo', rol: 'Administrador' },
    detail: { mensaje: 'Alta usuario' },
  });

  const today = new Date().toISOString().slice(0, 10);
  const byEntityAndUser = await fetch(
    `${baseUrl}/api/audit/logs?entidad_afectada=movimientos_inventario&id_usuario=7&fecha_desde=${today}&fecha_hasta=${today}`
  );

  assert.equal(byEntityAndUser.status, 200);
  const payloadEntityUser = await byEntityAndUser.json();
  assert.equal(payloadEntityUser.data.total, 1);
  assert.equal(payloadEntityUser.data.logs[0].entidad, 'movimientos_inventario');
  assert.equal(payloadEntityUser.data.logs[0].usuario.nombre, 'Usuario Caja');
  assert.equal(payloadEntityUser.data.logs[0].id_accion > 0, true);

  const actionId = payloadEntityUser.data.logs[0].id_accion;
  const byActionId = await fetch(`${baseUrl}/api/audit/logs?id_accion=${actionId}`);
  assert.equal(byActionId.status, 200);
  const payloadAction = await byActionId.json();
  assert.equal(payloadAction.data.total, 1);
  assert.equal(payloadAction.data.logs[0].accion, 'registrar_movimiento');

  await stopServer(server);
});

test('GET /api/audit/logs/movements retorna solo logs de movimientos con filtros de fecha e id_usuario', async () => {
  const app = createApp({
    repository: new InMemoryAuditRepository(),
    authMiddleware: createTestAuthMiddleware({
      id_usuario: 1,
      nombre: 'Administrador Demo',
      rol: 'Administrador',
    }),
  });

  const server = await startServer(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const createEvent = (payload) =>
    fetch(`${baseUrl}/api/audit/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

  await createEvent({
    action: 'registrar_movimiento',
    module: 'inventario',
    entity: 'movimientos_inventario',
    entityId: 2001,
    user: { id_usuario: 20, nombre: 'Operador A', rol: 'Empleado' },
    detail: { mensaje: 'Entrada por compra' },
  });

  await createEvent({
    action: 'actualizar_producto',
    module: 'productos',
    entity: 'productos',
    entityId: 2002,
    user: { id_usuario: 20, nombre: 'Operador A', rol: 'Empleado' },
    detail: { mensaje: 'Cambio descripcion' },
  });

  const today = new Date().toISOString().slice(0, 10);
  const response = await fetch(
    `${baseUrl}/api/audit/logs/movements?id_usuario=20&fecha_desde=${today}&fecha_hasta=${today}`
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.data.total, 1);
  assert.equal(payload.data.logs.length, 1);
  assert.equal(payload.data.logs[0].entidad, 'movimientos_inventario');
  assert.equal(payload.data.logs[0].usuario.nombre, 'Operador A');

  await stopServer(server);
});

test('GET /api/audit/logs bloquea usuarios que no son administradores', async () => {
  const app = createApp({
    repository: new InMemoryAuditRepository(),
    authMiddleware: createTestAuthMiddleware({
      id_usuario: 2,
      nombre: 'Empleado Demo',
      rol: 'Empleado',
    }),
  });

  const server = await startServer(app);
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${baseUrl}/api/audit/logs`);
  assert.equal(response.status, 403);

  const body = await response.json();
  assert.equal(body.error.code, 'AUTH_FORBIDDEN');

  await stopServer(server);
});

