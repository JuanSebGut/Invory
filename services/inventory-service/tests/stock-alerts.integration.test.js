const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../src/app');

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
    now: '2026-04-25T00:00:00.000Z'
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
    now: '2026-04-25T00:00:00.000Z'
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
    now: '2026-04-25T00:00:00.000Z'
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
    now: '2026-04-25T00:00:00.000Z'
  });

  const response = await request(app).get('/inventory/alerts');

  assert.equal(response.status, 200);
  assert.equal(response.body.data.length, 1);
  assert.equal(readCalls, 1);
  assert.equal(unexpectedWriteCalls, 0);
});
