const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');

const { createApp } = require('../src/app');
const { InMemorySupplierRepository } = require('../src/repositories/supplier.repository');

function buildTestContext() {
  const repository = new InMemorySupplierRepository({
    suppliers: [
      {
        id_proveedor: 1,
        razon_social: 'Distribuidora del Valle',
        nit_identificacion: '900100200',
        telefono: '3001112233',
        direccion: 'Calle 10 # 20-30',
        correo: 'contacto@valle.com',
        estado: true,
      },
      {
        id_proveedor: 2,
        razon_social: 'Proveedores del Norte',
        nit_identificacion: '900100201',
        telefono: '3002223344',
        direccion: 'Carrera 5 # 11-22',
        correo: 'ventas@norte.com',
        estado: false,
      },
    ],
  });

  const app = createApp({ repository });
  return { app, repository };
}

async function withServer(app, handler) {
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();

  try {
    return await handler(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let body = null;
  try {
    body = await response.json();
  } catch (_error) {
    body = null;
  }

  return { response, body };
}

test('POST /api/providers crea proveedor y valida unicidad', async () => {
  const { app, repository } = buildTestContext();

  await withServer(app, async (baseUrl) => {
    const { response, body } = await requestJson(baseUrl, '/api/providers', {
      method: 'POST',
      body: {
        nombre_razon_social: 'Novedades S.A.S.',
        nit_identificacion: '900100300',
        telefono: '3005556677',
        direccion: 'Av. Principal 123',
        correo_electronico: 'ventas@novedades.com',
        estado: 'activo',
      },
    });

    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.message, 'Proveedor creado correctamente');
    assert.equal(body.data.nombre_razon_social, 'Novedades S.A.S.');
    assert.equal(body.data.estado, 'activo');

    const created = await repository.getRawById(body.data.id_proveedor);
    assert.equal(created.nit_identificacion, '900100300');
  });
});

test('POST /api/providers rechaza nombre y NIT duplicados', async () => {
  const { app } = buildTestContext();

  await withServer(app, async (baseUrl) => {
    const nameResponse = await requestJson(baseUrl, '/api/providers', {
      method: 'POST',
      body: {
        nombre_razon_social: 'Distribuidora del Valle',
        nit_identificacion: '900100999',
      },
    });
    assert.equal(nameResponse.response.status, 409);
    assert.equal(nameResponse.body.error, 'El nombre del proveedor ya esta registrado');

    const nitResponse = await requestJson(baseUrl, '/api/providers', {
      method: 'POST',
      body: {
        nombre_razon_social: 'Nuevo Proveedor',
        nit_identificacion: '900100200',
      },
    });
    assert.equal(nitResponse.response.status, 409);
    assert.equal(nitResponse.body.error, 'El NIT ya esta registrado');

    const emailResponse = await requestJson(baseUrl, '/api/providers', {
      method: 'POST',
      body: {
        nombre_razon_social: 'Otro Proveedor',
        nit_identificacion: '900100998',
        correo_electronico: 'contacto@valle.com',
      },
    });
    assert.equal(emailResponse.response.status, 409);
    assert.equal(emailResponse.body.error, 'El correo electronico ya esta registrado');
  });
});

test('POST /api/providers valida formato de correo', async () => {
  const { app } = buildTestContext();

  await withServer(app, async (baseUrl) => {
    const { response, body } = await requestJson(baseUrl, '/api/providers', {
      method: 'POST',
      body: {
        nombre_razon_social: 'Correo Invalido SAS',
        nit_identificacion: '900100301',
        correo_electronico: 'correo-invalido',
      },
    });

    assert.equal(response.status, 400);
    assert.equal(body.error, 'correo_electronico debe tener un formato valido');
  });
});

test('GET /api/providers lista proveedores con filtro por estado y sin paginacion para activos', async () => {
  const { app } = buildTestContext();

  await withServer(app, async (baseUrl) => {
    const activeResponse = await requestJson(baseUrl, '/api/providers?estado=activo');
    assert.equal(activeResponse.response.status, 200);
    assert.equal(activeResponse.body.data.total, 1);
    assert.equal(activeResponse.body.data.proveedores.length, 1);
    assert.equal(activeResponse.body.data.proveedores[0].estado, 'activo');

    const inactiveResponse = await requestJson(
      baseUrl,
      '/api/providers?estado=inactivo&page=1&size=10'
    );
    assert.equal(inactiveResponse.response.status, 200);
    assert.equal(inactiveResponse.body.data.total, 1);
    assert.equal(inactiveResponse.body.data.proveedores[0].estado, 'inactivo');
  });
});

test('PUT /api/providers/:id actualiza proveedor y DELETE aplica borrado logico', async () => {
  const { app, repository } = buildTestContext();

  await withServer(app, async (baseUrl) => {
    const updateResponse = await requestJson(baseUrl, '/api/providers/1', {
      method: 'PUT',
      body: {
        telefono: '3009990000',
        correo_electronico: 'nuevo@valle.com',
      },
    });

    assert.equal(updateResponse.response.status, 200);
    assert.equal(updateResponse.body.message, 'Proveedor actualizado correctamente');
    assert.equal(updateResponse.body.data.telefono, '3009990000');
    assert.equal(updateResponse.body.data.correo, 'nuevo@valle.com');

    const deleteResponse = await requestJson(baseUrl, '/api/providers/1', {
      method: 'DELETE',
    });
    assert.equal(deleteResponse.response.status, 200);
    assert.equal(deleteResponse.body.message, 'Proveedor eliminado correctamente');
    assert.equal(deleteResponse.body.data.estado, 'inactivo');

    const raw = await repository.getRawById(1);
    assert.equal(raw.estado, false);
  });
});
