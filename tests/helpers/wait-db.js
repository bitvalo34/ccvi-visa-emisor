import { Client } from 'pg';

export async function waitForDb({ timeoutMs = 30000, intervalMs = 500 } = {}) {
  const start = Date.now();
  let lastErr;
  const hasConnStr = !!process.env.DATABASE_URL;
  while (Date.now() - start < timeoutMs) {
    const cfg = hasConnStr
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.POSTGRES_HOST || '127.0.0.1',
          port: Number(process.env.POSTGRES_PORT || 5432),
          database: process.env.POSTGRES_DB || 'ccvi',
          user: process.env.POSTGRES_USER || 'app',
          password: process.env.POSTGRES_PASSWORD || 'app',
        };
    const client = new Client(cfg);
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return true;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  const msg = lastErr?.message || 'unknown error';
  throw new Error(`DB not ready after ${timeoutMs}ms: ${msg}`);
}
