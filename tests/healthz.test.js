import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';

test('GET /healthz -> 200 { ok: true }', async () => {
  const res = await request(app).get('/healthz');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});
