import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

process.env.API_KEY = process.env.API_KEY || 'test-key';
process.env.CVV_PEPPER = process.env.CVV_PEPPER || 'dev-pepper-change-me';

// Allow overriding DB for tests via TEST_DATABASE_URL, otherwise default to local docker defaults
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
if (TEST_DATABASE_URL) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  try {
    const u = new URL(TEST_DATABASE_URL);
    process.env.POSTGRES_HOST = u.hostname || '127.0.0.1';
    process.env.POSTGRES_PORT = u.port || '5432';
    process.env.POSTGRES_DB = (u.pathname || '/ccvi').replace(/^\//, '') || 'ccvi';
    process.env.POSTGRES_USER = u.username || 'app';
    process.env.POSTGRES_PASSWORD = u.password || 'app';
    process.env.PGHOST = process.env.POSTGRES_HOST;
    process.env.PGPORT = process.env.POSTGRES_PORT;
    process.env.PGDATABASE = process.env.POSTGRES_DB;
    process.env.PGUSER = process.env.POSTGRES_USER;
    process.env.PGPASSWORD = process.env.POSTGRES_PASSWORD;
  } catch {
    // ignore URL parse errors
  }
} else {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://app:app@127.0.0.1:5432/ccvi';
  process.env.POSTGRES_HOST = '127.0.0.1';
  process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || '5432';
  process.env.POSTGRES_DB = process.env.POSTGRES_DB || 'ccvi';
  process.env.POSTGRES_USER = process.env.POSTGRES_USER || 'app';
  process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'app';
}

import { waitForDb } from '../helpers/wait-db.js';

function computeLuhnCheckDigit(panWithoutLast) {
  let sum = 0;
  let dbl = true;
  for (let i = panWithoutLast.length - 1; i >= 0; i--) {
    let d = panWithoutLast.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  const cd = (10 - (sum % 10)) % 10;
  return String(cd);
}

function generatePan(prefix = '411111') {
  const base = prefix + String(Date.now()).slice(-9);
  const fifteen = base.slice(0, 15);
  const cd = computeLuhnCheckDigit(fifteen);
  return fifteen + cd;
}

describe('Payments and meta endpoints', () => {
  const apiKey = process.env.API_KEY;
  let agent;

  const pan = generatePan();

  before(async () => {
    const mod = await import('../../src/app.js');
    const app = mod.default;
    agent = request(app);
    await waitForDb({ timeoutMs: 60000, intervalMs: 500 });
  });

  it('Provisions a card for payments', async () => {
    const res = await agent
      .post('/api/v1/cards')
      .set('x-api-key', apiKey)
      .set('Accept', 'application/json')
      .send({
        numero: pan,
        nombre: 'Pago Prueba',
        fecha_venc: '203101',
        cvv: '123',
        limite: '300.00',
      });
    assert.equal(res.status, 201, res.text);
  });

  it('POST /api/v1/cards/:pan/payments creates payment and increases available', async () => {
    const idem = 'idem-test-001';
    const res1 = await agent
      .post(`/api/v1/cards/${pan}/payments`)
      .set('x-api-key', apiKey)
      .set('Idempotency-Key', idem)
      .set('Accept', 'application/json')
      .send({ monto: '100.00', referencia: 'TESTPAY' });
    assert.equal(res1.status, 201, res1.text);
    assert.equal(res1.body.monto, '100.00');
    const firstDisponible = res1.body.disponible;

    const res2 = await agent
      .post(`/api/v1/cards/${pan}/payments`)
      .set('x-api-key', apiKey)
      .set('Idempotency-Key', idem)
      .set('Accept', 'application/json')
      .send({ monto: '100.00', referencia: 'TESTPAY' });
    assert.equal(res2.status, 200, res2.text);
    assert.equal(res2.body.monto, '100.00');
    assert.equal(res2.body.disponible, firstDisponible);
  });

  it('GET /metadata returns metadata (JSON)', async () => {
    const res = await agent.get('/metadata').set('Accept', 'application/json');
    assert.equal(res.status, 200);
    assert.equal(res.body.emisor, 'VISA');
    assert.deepEqual(res.body.formatos, ['JSON', 'XML']);
  });

  it('GET /healthz returns ok', async () => {
    const res = await agent.get('/healthz');
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
  });

  it('GET /readyz returns readiness boolean', async () => {
    const res = await agent.get('/readyz');
    assert.equal([200, 503].includes(res.status), true);
    assert.equal(typeof res.body.ready, 'boolean');
  });
});
