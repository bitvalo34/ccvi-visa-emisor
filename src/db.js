// src/db.js
import { Pool } from 'pg';

// Si hay DATABASE_URL o TEST_DATABASE_URL, úsala como conexión completa.
// Si no, usa variables separadas (entorno local / docker-compose).
const dbUrl = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
const hasUrl = !!dbUrl;

export const pool = hasUrl
  ? new Pool({
      connectionString: dbUrl,
      // SSL opcional. El driver pg soporta la propiedad `ssl` en el Pool.
      // PGSSL=true => usa TLS sin validar CA (útil en entornos académicos/demos).
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    })
  : new Pool({
      host: process.env.POSTGRES_HOST || process.env.PGHOST || 'db',
      port: Number(process.env.POSTGRES_PORT || process.env.PGPORT || 5432),
      database: process.env.POSTGRES_DB || process.env.PGDATABASE || 'ccvi',
      user: process.env.POSTGRES_USER || process.env.PGUSER || 'app',
      password: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || 'app',
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });

// Ping simple para /readyz
export async function checkDb() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    return true;
  } finally {
    client.release();
  }
}

// Helper de transacción (BEGIN/COMMIT/ROLLBACK)
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors
    }
    throw e;
  } finally {
    client.release();
  }
}
