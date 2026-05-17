const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../src/app');

async function emptyFiadosFetch() {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        success: true,
        data: {
          items: [],
        },
      };
    },
  };
}

function buildRepository(records) {
  return {
    async getAlertSourceRows(filters) {
      return records.filter((record) => {
        if (!filters.categoryId) {
          return true;
        }

        return record.categoryId === filters.categoryId;
      });
    }
  };
}

test('GET /inventory/alerts returns active alerts with combined filters and meta', async () => {
  const app = createApp({
    repository: buildRepository([
      {
        productId: 'product-1',
        productName: 'Milk',
        categoryId: 'cat-1',
        currentStock: 2,
        minStock: 5,
        maxStock: 20,
        expirationDate: '2026-04-30T00:00:00.000Z'
      },
      {
        productId: 'product-2',
        productName: 'Rice',
        categoryId: 'cat-2',
        currentStock: 25,
        minStock: 5,
        maxStock: 20
      }
    ]),
    now: '2026-04-25T00:00:00.000Z',
    fetchImpl: emptyFiadosFetch,
  });

  const response = await request(app)
    .get('/inventory/alerts')
    .query({ type: 'low-stock,expiring-soon', categoryId: 'cat-1' });

  assert.equal(response.status, 200);
  assert.deepEqual(
    response.body.data.map((alert) => alert.type).sort(),
    ['expiring-soon', 'low-stock']
  );
  assert.deepEqual(response.body.meta.filters, {
    type: ['low-stock', 'expiring-soon'],
    categoryId: 'cat-1'
  });
  assert.match(response.body.meta.generatedAt, /^2026-04-25T00:00:00.000Z$/);
});

test('GET /inventory/alerts returns 400 when type filter is invalid', async () => {
  const app = createApp({
    repository: buildRepository([]),
    now: '2026-04-25T00:00:00.000Z',
    fetchImpl: emptyFiadosFetch,
  });

  const response = await request(app)
    .get('/inventory/alerts')
    .query({ type: 'unknown' });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'Invalid alert type filter');
});

test('GET /inventory/alerts removes alerts when source data is normalized', async () => {
  let records = [
    {
      productId: 'product-1',
      productName: 'Milk',
      categoryId: 'cat-1',
      currentStock: 2,
      minStock: 5,
      maxStock: 20
    }
  ];

  const app = createApp({
    repository: {
      async getAlertSourceRows() {
        return records;
      }
    },
    now: '2026-04-25T00:00:00.000Z',
    fetchImpl: emptyFiadosFetch,
  });

  const activeResponse = await request(app).get('/inventory/alerts');
  assert.equal(activeResponse.body.data.length, 1);

  records = [
    {
      productId: 'product-1',
      productName: 'Milk',
      categoryId: 'cat-1',
      currentStock: 10,
      minStock: 5,
      maxStock: 20
    }
  ];

  const normalizedResponse = await request(app).get('/inventory/alerts');
  assert.deepEqual(normalizedResponse.body.data, []);
});

test('GET /inventory/alerts resolves the query without persistence writes, notifications or jobs', async () => {
  let readCalls = 0;
  let unexpectedWriteCalls = 0;

  const app = createApp({
    repository: {
      async getAlertSourceRows() {
        readCalls += 1;

        return [
          {
            productId: 'product-1',
            productName: 'Milk',
            categoryId: 'cat-1',
            currentStock: 2,
            minStock: 5,
            maxStock: 20
          }
        ];
      },
      async saveAlert() {
        unexpectedWriteCalls += 1;
      },
      async sendNotification() {
        unexpectedWriteCalls += 1;
      },
      async scheduleJob() {
        unexpectedWriteCalls += 1;
      }
    },
    now: '2026-04-25T00:00:00.000Z',
    fetchImpl: emptyFiadosFetch,
  });

  const response = await request(app).get('/inventory/alerts');

  assert.equal(response.status, 200);
  assert.equal(response.body.data.length, 1);
  assert.equal(readCalls, 1);
  assert.equal(unexpectedWriteCalls, 0);
});

test('GET /inventory/alerts agrega alertas de fiados desde client-service', async () => {
  const app = createApp({
    repository: buildRepository([
      {
        productId: 'product-1',
        productName: 'Milk',
        categoryId: 'cat-1',
        currentStock: 2,
        minStock: 5,
        maxStock: 20,
      },
    ]),
    now: '2026-04-25T00:00:00.000Z',
    fetchImpl: async (url) => {
      if (String(url).includes('/fiados/alertas')) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              success: true,
              data: {
                items: [
                  {
                    id_fiado: 10,
                    cliente_nombre: 'Cliente Vencido',
                    saldo_pendiente: 80000,
                    fecha_pago_acordada: '2026-04-20',
                    tipo_alerta: 'vencido',
                  },
                  {
                    id_fiado: 11,
                    cliente_nombre: 'Cliente Por Vencer',
                    saldo_pendiente: 25000,
                    fecha_pago_acordada: '2026-04-27',
                    tipo_alerta: 'por_vencer',
                  },
                ],
              },
            };
          },
        };
      }

      return emptyFiadosFetch();
    },
  });

  const response = await request(app).get('/inventory/alerts');

  assert.equal(response.status, 200);
  assert.equal(response.body.data.some((item) => item.type === 'low-stock'), true);
  assert.equal(response.body.data.some((item) => item.type === 'fiado_vencido'), true);
  assert.equal(response.body.data.some((item) => item.type === 'fiado_por_vencer'), true);
  const fiadoAlert = response.body.data.find((item) => item.type === 'fiado_vencido');
  assert.equal(fiadoAlert.id_fiado, 10);
  assert.equal(fiadoAlert.nombre_cliente, 'Cliente Vencido');
  assert.equal(fiadoAlert.monto_pendiente, 80000);
  assert.equal(fiadoAlert.fecha_pago_acordada, '2026-04-20');
});

test('GET /inventory/alerts no falla si client-service no responde', async () => {
  const originalConsoleError = console.error;
  let errorCalls = 0;
  console.error = () => {
    errorCalls += 1;
  };

  try {
    const app = createApp({
      repository: buildRepository([
        {
          productId: 'product-1',
          productName: 'Milk',
          categoryId: 'cat-1',
          currentStock: 2,
          minStock: 5,
          maxStock: 20,
        },
      ]),
      now: '2026-04-25T00:00:00.000Z',
      fetchImpl: async () => {
        throw new Error('Client service down');
      },
    });

    const response = await request(app).get('/inventory/alerts');

    assert.equal(response.status, 200);
    assert.equal(response.body.data.some((item) => item.type === 'low-stock'), true);
    assert.equal(response.body.data.some((item) => item.type === 'fiado_vencido'), false);
    assert.equal(response.body.data.some((item) => item.type === 'fiado_por_vencer'), false);
    assert.equal(errorCalls > 0, true);
  } finally {
    console.error = originalConsoleError;
  }
});
