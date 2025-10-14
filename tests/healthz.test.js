import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';

const rawBase = process.env.BASE_PATH || '';
const BASE_PATH = rawBase ? '/' + rawBase.replace(/^\/+|\/+$/g, '') : '';

test('GET /healthz -> 200 { ok: true }', async () => {
  const res = await request(app).get(`${BASE_PATH}/healthz`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});
