const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ALERT_TYPES,
  EXPIRING_SOON_DAYS,
  buildReportSummary,
  deriveAlerts,
  getColombiaTimestamp,
  normalizeSalesReason,
  normalizeAlertFilters,
  describeInventoryAlertSourceShape
} = require('../src/services/inventory.service');
const {
  parseReportFilters,
  REPORT_TYPES,
  normalizeReportType,
} = require('../src/models/inventory.model');

test('getColombiaTimestamp conserva la fecha local de Colombia cuando UTC ya cambio de dia', () => {
  const timestamp = getColombiaTimestamp(new Date('2026-05-05T02:15:00.000Z'));
  assert.equal(timestamp, '2026-05-04 21:15:00');
});

test('deriveAlerts creates low-stock and high-stock alerts when thresholds are met', () => {
  const alerts = deriveAlerts([
    {
      productId: 'product-low',
      productName: 'Low Product',
      categoryId: 'cat-1',
      currentStock: 2,
      minStock: 5,
      maxStock: 20
    },
    {
      productId: 'product-high',
      productName: 'High Product',
      categoryId: 'cat-2',
      currentStock: 25,
      minStock: 5,
      maxStock: 20
    }
  ], { now: '2026-04-25T00:00:00.000Z' });

  assert.equal(alerts.length, 2);
  assert.deepEqual(
    alerts.map((alert) => ({ type: alert.type, productId: alert.productId })),
    [
      { type: ALERT_TYPES.LOW_STOCK, productId: 'product-low' },
      { type: ALERT_TYPES.HIGH_STOCK, productId: 'product-high' }
    ]
  );
});

test('deriveAlerts creates expiring-soon alerts only inside the fixed window', () => {
  const alerts = deriveAlerts([
    {
      productId: 'product-expiring',
      productName: 'Expiring Product',
      categoryId: 'cat-1',
      currentStock: 12,
      expirationDate: '2026-05-02T00:00:00.000Z'
    },
    {
      productId: 'product-safe',
      productName: 'Safe Product',
      categoryId: 'cat-1',
      currentStock: 12,
      expirationDate: '2026-05-10T00:00:00.000Z'
    }
  ], { now: '2026-04-25T00:00:00.000Z' });

  assert.equal(EXPIRING_SOON_DAYS, 7);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].type, ALERT_TYPES.EXPIRING_SOON);
  assert.equal(alerts[0].productId, 'product-expiring');
  assert.equal(alerts[0].daysToExpire, 7);
});

test('deriveAlerts skips alert types when required source fields are missing', () => {
  const alerts = deriveAlerts([
    {
      productId: 'missing-thresholds',
      productName: 'Missing Thresholds',
      categoryId: 'cat-1',
      currentStock: 1
    },
    {
      productId: 'missing-expiration',
      productName: 'Missing Expiration',
      categoryId: 'cat-1',
      currentStock: 10,
      minStock: 5,
      maxStock: 15
    }
  ], { now: '2026-04-25T00:00:00.000Z' });

  assert.equal(alerts.length, 0);
});

test('deriveAlerts emits multiple alerts for the same product and removes them after normalization', () => {
  const source = {
    productId: 'product-combo',
    productName: 'Combo Product',
    categoryId: 'cat-1',
    currentStock: 2,
    minStock: 5,
    maxStock: 50,
    expirationDate: '2026-04-28T00:00:00.000Z'
  };

  const activeAlerts = deriveAlerts([source], { now: '2026-04-25T00:00:00.000Z' });
  const normalizedAlerts = deriveAlerts([
    {
      ...source,
      currentStock: 10,
      expirationDate: '2026-05-20T00:00:00.000Z'
    }
  ], { now: '2026-04-25T00:00:00.000Z' });

  assert.deepEqual(
    activeAlerts.map((alert) => alert.type).sort(),
    [ALERT_TYPES.EXPIRING_SOON, ALERT_TYPES.LOW_STOCK].sort()
  );
  assert.deepEqual(normalizedAlerts, []);
});

test('normalizeAlertFilters accepts optional type lists and categoryId', () => {
  assert.deepEqual(normalizeAlertFilters({}), { type: [], categoryId: null });
  assert.deepEqual(
    normalizeAlertFilters({ type: 'low-stock,expiring-soon', categoryId: 'cat-9' }),
    {
      type: [ALERT_TYPES.LOW_STOCK, ALERT_TYPES.EXPIRING_SOON],
      categoryId: 'cat-9'
    }
  );
});

test('describeInventoryAlertSourceShape documents the minimum source shape', () => {
  assert.match(describeInventoryAlertSourceShape(), /productId/);
  assert.match(describeInventoryAlertSourceShape(), /productName/);
  assert.match(describeInventoryAlertSourceShape(), /categoryId/);
  assert.match(describeInventoryAlertSourceShape(), /currentStock/);
  assert.match(describeInventoryAlertSourceShape(), /minStock/);
  assert.match(describeInventoryAlertSourceShape(), /maxStock/);
  assert.match(describeInventoryAlertSourceShape(), /expirationDate/);
});

test('normalizeReportType normalizes aliases to supported MS-07 report types', () => {
  assert.equal(normalizeReportType(' Movements '), REPORT_TYPES.MOVEMENTS);
  assert.equal(normalizeReportType('sales'), REPORT_TYPES.SALES);
  assert.equal(normalizeReportType('STOCK'), REPORT_TYPES.STOCK);
});

test('parseReportFilters normalizes compatible filters per report and trims values', () => {
  assert.deepEqual(
    parseReportFilters('movements', {
      fecha_inicio: '2026-04-01',
      fecha_fin: '2026-04-30',
      categoria: ' 7 ',
      producto: ' 15 ',
      tipo: ' SALIDA ',
    }),
    {
      reportType: 'movements',
      fecha_inicio: '2026-04-01',
      fecha_fin: '2026-04-30',
      categoria: 7,
      producto: 15,
      tipo: 'salida',
    }
  );

  assert.deepEqual(
    parseReportFilters('stock', {
      categoria: '3',
      producto: '8',
      tipo: 'entrada',
      fecha_inicio: '2026-04-01',
    }),
    {
      reportType: 'stock',
      categoria: 3,
      producto: 8,
    }
  );
});

test('parseReportFilters rejects invalid report dates and descending ranges', () => {
  assert.throws(
    () => parseReportFilters('movements', { fecha_inicio: '2026/04/01' }),
    /YYYY-MM-DD/
  );
  assert.throws(
    () => parseReportFilters('sales', {
      fecha_inicio: '2026-04-30',
      fecha_fin: '2026-04-01',
    }),
    /fecha_inicio no puede ser mayor/
  );
});

test('normalizeSalesReason collapses observable sales aliases without breaking other reasons', () => {
  assert.equal(normalizeSalesReason('Venta'), 'venta');
  assert.equal(normalizeSalesReason(' VENTA MOSTRADOR '), 'venta');
  assert.equal(normalizeSalesReason('salida por venta web'), 'venta');
  assert.equal(normalizeSalesReason('Merma'), 'merma');
});

test('buildReportSummary keeps totals consistent with item collections', () => {
  assert.deepEqual(
    buildReportSummary([
      { cantidad: 2, valor_total: 30 },
      { cantidad: 3, valor_total: 45 },
    ]),
    {
      total_items: 2,
      total_quantity: 5,
      total_value: 75,
    }
  );

  assert.deepEqual(buildReportSummary([]), {
    total_items: 0,
    total_quantity: 0,
    total_value: 0,
  });
});
