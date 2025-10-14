// scripts/check-balance.js - quick CLI to query card balance by PAN
// Loads .env if available, prefers DATABASE_URL/TEST_DATABASE_URL, and
// avoids using docker service name 'db' when running on host.
try {
  const { config } = await import('dotenv');
  config();
} catch {
  // ignore if dotenv not installed
}

// Try to reuse app pool
let pool;
try {
  const dbmod = await import('../src/db.js');
  pool = dbmod.pool ?? dbmod.default ?? dbmod;
} catch {
  const { Pool } = await import('pg');
  const connStr = process.env.DATABASE_URL || process.env.TEST_DATABASE_URL;
  if (connStr) {
    pool = new Pool({
      connectionString: connStr,
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
    });
  } else {
    const rawHost = process.env.POSTGRES_HOST || process.env.PGHOST || '';
    const host = !rawHost || rawHost === 'db' ? '127.0.0.1' : rawHost;
    pool = new Pool({
      host,
      port: Number(process.env.POSTGRES_PORT || process.env.PGPORT || 5432),
      user: process.env.POSTGRES_USER || process.env.PGUSER || 'app',
      password: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || 'app',
      database: process.env.POSTGRES_DB || process.env.PGDATABASE || 'ccvi',
      ssl: false,
    });
  }
}

function cleanDigits(s = '') {
  return String(s).replace(/\D+/g, '');
}

const panArg = process.argv[2];
if (!panArg) {
  console.error('Usage: node scripts/check-balance.js <PAN_16_DIGITS>');
  process.exit(1);
}
const pan = cleanDigits(panArg);
if (pan.length !== 16) {
  console.error('Invalid PAN. Provide 16 digits.');
  process.exit(1);
}

const q = `SELECT numero, monto_autorizado, monto_disponible, estado, nombre_titular_normalizado
           FROM emisor.tarjetas WHERE numero=$1`;

const client = await pool.connect();
try {
  const { rows } = await client.query(q, [pan]);
  if (!rows.length) {
    console.log(JSON.stringify({ found: false }));
  } else {
    const r = rows[0];
    console.log(
      JSON.stringify(
        {
          found: true,
          numero: r.numero,
          nombre: r.nombre_titular_normalizado,
          limite: Number(r.monto_autorizado),
          disponible: Number(r.monto_disponible),
          estado: r.estado,
        },
        null,
        2,
      ),
    );
  }
} catch (e) {
  console.error('Error querying balance:', e.message || e);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end().catch(() => {});
}
