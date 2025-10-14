import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';

// Set env before importing app
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
    // Also set PG* aliases for any indirect consumer
    process.env.PGHOST = process.env.POSTGRES_HOST;
    process.env.PGPORT = process.env.POSTGRES_PORT;
    process.env.PGDATABASE = process.env.POSTGRES_DB;
    process.env.PGUSER = process.env.POSTGRES_USER;
    process.env.PGPASSWORD = process.env.POSTGRES_PASSWORD;
  } catch {
    // ignore URL parse errors; fallback envs will be used
  }
} else {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://app:app@127.0.0.1:5432/ccvi';
  // Ensure host-based vars point to localhost to avoid using docker service names from .env
  process.env.POSTGRES_HOST = '127.0.0.1';
  process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || '5432';
  process.env.POSTGRES_DB = process.env.POSTGRES_DB || 'ccvi';
  process.env.POSTGRES_USER = process.env.POSTGRES_USER || 'app';
  process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'app';
}

import { waitForDb } from '../helpers/wait-db.js';

function computeLuhnCheckDigit(panWithoutLast) {
  let sum = 0;
  let dbl = true; // since we append the check digit, start doubling from the right position
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
  const base = prefix + String(Date.now()).slice(-9); // ensure 15 digits total
  const fifteen = base.slice(0, 15);
  const cd = computeLuhnCheckDigit(fifteen);
  return fifteen + cd;
}

describe('Cards admin endpoints', () => {
  const apiKey = process.env.API_KEY;
  let agent;
  const pan = generatePan();

  before(async () => {
    // Import the app only after env is configured to avoid ESM import hoisting issues
    const mod = await import('../../src/app.js');
    const app = mod.default;
    agent = request(app);
    await waitForDb({ timeoutMs: 60000, intervalMs: 500 });
  });

  it('POST /api/v1/cards creates a card (JSON)', async () => {
    const res = await agent
      .post('/api/v1/cards')
      .set('x-api-key', apiKey)
      .set('Accept', 'application/json')
      .send({
        numero: pan,
        nombre: 'Prueba Uno',
        fecha_venc: '203001',
        cvv: '123',
        limite: '1000.00',
      });

    assert.equal(res.status, 201, res.text);
    assert.equal(res.type.includes('json'), true);
    assert.equal(res.body.emisor, 'VISA');
    assert.match(res.body.numero, /\*{4}-\*{4}-\*{4}-\d{4}/);
    // created card response validated above
  });

  it('GET /api/v1/cards/:numero retrieves card (JSON)', async () => {
    const res = await agent
      .get(`/api/v1/cards/${pan}`)
      .set('x-api-key', apiKey)
      .set('Accept', 'application/json');

    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.limite, 1000);
  });

  it('PATCH /api/v1/cards/:numero updates disponible within limit (JSON)', async () => {
    const res = await agent
      .patch(`/api/v1/cards/${pan}`)
      .set('x-api-key', apiKey)
      .set('Accept', 'application/json')
      .send({ disponible: '900.00' });

    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.disponible, 900);
  });

  it('PATCH /api/v1/cards/:numero updates estado (JSON)', async () => {
    const res = await agent
      .patch(`/api/v1/cards/${pan}`)
      .set('x-api-key', apiKey)
      .set('Accept', 'application/json')
      .send({ estado: 'bloqueada' });

    assert.equal(res.status, 200, res.text);
    assert.equal(res.body.estado, 'bloqueada');
  });

  it('PATCH /api/v1/cards/:numero rejects disponible > limite (422)', async () => {
    const res = await agent
      .patch(`/api/v1/cards/${pan}`)
      .set('x-api-key', apiKey)
      .set('Accept', 'application/json')
      .send({ disponible: '5000.00' });

    assert.equal(res.status, 422, res.text);
  });
});
