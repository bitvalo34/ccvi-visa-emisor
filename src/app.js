// src/app.js
import express from 'express';
import { checkDb } from './db.js';

const app = express();
app.use(express.json());

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

// /readyz verifica conexión real a la DB
app.get('/readyz', async (_req, res) => {
  try {
    await checkDb();
    res.json({ ready: true });
  } catch (err) {
    // no disponible aún: devolvemos 503 para que orquestadores/monitores lo capten
    res.status(503).json({ ready: false, error: err?.message ?? 'db unavailable' });
  }
});

export default app;
