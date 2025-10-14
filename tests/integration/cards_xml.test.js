import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { waitForDb } from '../helpers/wait-db.js';

// Basic env setup (same pattern as JSON tests)
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

describe('Cards admin endpoints (XML)', () => {
  const apiKey = process.env.API_KEY;
  let agent;
  const pan = generatePan();

  before(async () => {
    const mod = await import('../../src/app.js');
    const app = mod.default;
    agent = request(app);
    await waitForDb({ timeoutMs: 60000, intervalMs: 500 });
  });

  it('POST /api/v1/cards creates a card (XML)', async () => {
    const payload = {
      card: {
        numero: pan,
        nombre: 'XML Prueba',
        fecha_venc: '203201',
        cvv: '123',
        limite: '1000.00',
      },
    };
    const xml = builder.build(payload);
    const res = await agent
      .post('/api/v1/cards')
      .set('x-api-key', apiKey)
      .set('Accept', 'application/xml')
      .set('Content-Type', 'application/xml')
      .send(xml);

    assert.equal(res.status, 201, res.text);
    assert.equal(res.type.includes('xml'), true);
    const body = parser.parse(res.text);
    assert.ok(body.card);
    assert.equal(body.card.emisor, 'VISA');
    assert.match(String(body.card.numero), /\*{4}-\*{4}-\*{4}-\d{4}/);
  });

  it('GET /api/v1/cards/:numero returns XML with correct fields', async () => {
    const res = await agent
      .get(`/api/v1/cards/${pan}`)
      .set('x-api-key', apiKey)
      .set('Accept', 'application/xml');

    assert.equal(res.status, 200, res.text);
    const body = parser.parse(res.text);
    assert.equal(body.card.emisor, 'VISA');
    assert.equal(String(body.card.limite), '1000'); // number serialized may lose decimals
  });

  it('PATCH /api/v1/cards/:numero updates disponible (XML)', async () => {
    const patchXml = builder.build({ card: { disponible: '900.00' } });
    const res = await agent
      .patch(`/api/v1/cards/${pan}`)
      .set('x-api-key', apiKey)
      .set('Accept', 'application/xml')
      .set('Content-Type', 'application/xml')
      .send(patchXml);

    assert.equal(res.status, 200, res.text);
    const body = parser.parse(res.text);
    assert.equal(String(body.card.disponible), '900');
  });

  it('PATCH /api/v1/cards/:numero updates estado (XML)', async () => {
    const patchXml = builder.build({ card: { estado: 'bloqueada' } });
    const res = await agent
      .patch(`/api/v1/cards/${pan}`)
      .set('x-api-key', apiKey)
      .set('Accept', 'application/xml')
      .set('Content-Type', 'application/xml')
      .send(patchXml);

    assert.equal(res.status, 200, res.text);
    const body = parser.parse(res.text);
    assert.equal(body.card.estado, 'bloqueada');
  });
});
