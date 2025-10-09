// src/db.js
import { Pool } from 'pg';

// Usa DATABASE_URL; en local puedes arrancar con `node --env-file=.env src/server.js`
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn('[db] DATABASE_URL no está definido; configura tu entorno.');
}

export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// ping simple que usamos en /readyz
export async function checkDb() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1'); // éxito = DB reachable
    return true;
  } finally {
    client.release();
  }
}
