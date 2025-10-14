import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { waitForDb } from '../helpers/wait-db.js';

process.env.API_KEY = process.env.API_KEY || 'test-key';
process.env.CVV_PEPPER = process.env.CVV_PEPPER || 'dev-pepper-change-me';

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
    // ignore
  }
} else {
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://app:app@127.0.0.1:5432/ccvi';
  process.env.POSTGRES_HOST = '127.0.0.1';
  process.env.POSTGRES_PORT = process.env.POSTGRES_PORT || '5432';
  process.env.POSTGRES_DB = process.env.POSTGRES_DB || 'ccvi';
  process.env.POSTGRES_USER = process.env.POSTGRES_USER || 'app';
  process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || 'app';
}

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

const parser = new XMLParser({ ignoreAttributes: false, trimValues: true });
const builder = new XMLBuilder({ ignoreAttributes: false });

describe('Payments endpoint (XML)', () => {
  const apiKey = process.env.API_KEY;
  let agent;
  let pan;

  before(async () => {
    const mod = await import('../../src/app.js');
    const app = mod.default;
    agent = request(app);
    await waitForDb({ timeoutMs: 60000, intervalMs: 500 });

    pan = generatePan();
    // Provision a card
    const cardXml = builder.build({
      card: {
        numero: pan,
        nombre: 'Pago XML',
        fecha_venc: '203201',
        cvv: '123',
        limite: '1000.00',
      },
    });
    const res = await agent
      .post('/api/v1/cards')
      .set('x-api-key', apiKey)
      .set('Accept', 'application/xml')
      .set('Content-Type', 'application/xml')
      .send(cardXml);
    assert.equal(res.status, 201, res.text);
  });

  it('POST /api/v1/cards/:numero/payments creates payment (XML, 201)', async () => {
    const pid = 'idem-xml-' + Date.now();
    const bodyXml = builder.build({ payment: { monto: '100.00', descripcion: 'Pago XML' } });
    const res = await agent
      .post(`/api/v1/cards/${pan}/payments`)
      .set('x-api-key', apiKey)
      .set('Idempotency-Key', pid)
      .set('Accept', 'application/xml')
      .set('Content-Type', 'application/xml')
      .send(bodyXml);

    assert.equal(res.status, 201, res.text);
    const body = parser.parse(res.text);
    assert.ok(body.payment);
    assert.equal(String(body.payment.monto), '100');
    assert.equal(body.payment.estado, 'aplicado');
  });

  it('POST payments with same idempotency returns 200 (XML replay)', async () => {
    const pid = 'idem-xml-' + Date.now();
    const bodyXml = builder.build({ payment: { monto: '50.00', descripcion: 'Pago XML Replay' } });
    const first = await agent
      .post(`/api/v1/cards/${pan}/payments`)
      .set('x-api-key', apiKey)
      .set('Idempotency-Key', pid)
      .set('Accept', 'application/xml')
      .set('Content-Type', 'application/xml')
      .send(bodyXml);
    assert.equal(first.status, 201, first.text);

    const second = await agent
      .post(`/api/v1/cards/${pan}/payments`)
      .set('x-api-key', apiKey)
      .set('Idempotency-Key', pid)
      .set('Accept', 'application/xml')
      .set('Content-Type', 'application/xml')
      .send(bodyXml);

    assert.equal(second.status, 200, second.text);
    const body = parser.parse(second.text);
    assert.ok(body.payment);
    assert.equal(String(body.payment.monto), '50');
  });
});
