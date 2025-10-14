// scripts/seed.js — versión final para tu proyecto
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

// Carga .env sólo si el paquete dotenv está instalado; si no, sigue sin fallar.
try {
  const { config } = await import('dotenv');
  config();
} catch {
  // Ignoramos: el script usa defaults y/o variables de entorno del contenedor.
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Preferimos el pool de ../src/db.js; si no existe, creamos uno local.
let pool;
try {
  const dbmod = await import('../src/db.js');
  pool = dbmod.pool ?? dbmod.default ?? dbmod;
} catch {
  const { Pool } = await import('pg');
  pool = new Pool({
    host: process.env.POSTGRES_HOST || process.env.PGHOST || 'db',
    port: Number(process.env.POSTGRES_PORT || process.env.PGPORT || 5432),
    user: process.env.POSTGRES_USER || process.env.PGUSER || 'app',
    password: process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || 'app',
    database: process.env.POSTGRES_DB || process.env.PGDATABASE || 'ccvi',
    ssl: false,
  });
}

const PEPPER = process.env.CVV_PEPPER || 'dev-pepper-change-me';

function hmacCVV(cvv) {
  return crypto.createHmac('sha256', PEPPER).update(String(cvv)).digest('hex');
}

async function readJson(relPath) {
  const p = path.join(__dirname, 'data', relPath);
  const txt = await fs.readFile(p, 'utf8');
  return JSON.parse(txt);
}

async function upsertCard(client, c) {
  // OJO: nombre_titular_normalizado es columna GENERADA, no se escribe desde app
  const q = `
    INSERT INTO emisor.tarjetas
      (numero, nombre_titular, fecha_venc, cvv_hmac,
       monto_autorizado, monto_disponible, estado, creada_en, actualizada_en)
    VALUES ($1,$2,$3,$4,$5,$6,$7, now(), now())
    ON CONFLICT (numero) DO UPDATE
      SET nombre_titular   = EXCLUDED.nombre_titular,
          fecha_venc       = EXCLUDED.fecha_venc,
          cvv_hmac         = EXCLUDED.cvv_hmac,
          monto_autorizado = EXCLUDED.monto_autorizado,
          monto_disponible = EXCLUDED.monto_disponible,
          estado           = EXCLUDED.estado,
          actualizada_en   = now()
  `;
  await client.query(q, [
    c.numero,
    c.nombre,
    c.fecha_venc,
    hmacCVV(c.cvv),
    c.monto_autorizado,
    c.monto_disponible,
    c.estado,
  ]);
}

async function insertPayment(client, p) {
  // BEFORE INSERT trigger aplica negocio: suma disponible con tope, status APROBADO, etc.
  await client.query(
    `INSERT INTO emisor.transacciones
       (tarjeta_numero, tipo, monto, comercio)
     VALUES ($1, 'pago', $2, $3)`,
    [p.tarjeta, p.monto, p.comercio || 'PAGO-BANCO'],
  );
}

async function main() {
  const cards = await readJson('cards.json'); // arreglo de tarjetas
  const pays = await readJson('payments.json').catch(() => []); // pagos opcionales

  const client = await pool.connect();
  try {
    // Limpieza segura (primero transacciones, luego tarjetas)
    await client.query('BEGIN');
    await client.query('TRUNCATE emisor.transacciones RESTART IDENTITY CASCADE');
    await client.query('TRUNCATE emisor.tarjetas RESTART IDENTITY CASCADE');
    await client.query('COMMIT');

    // Inserción/actualización de tarjetas
    await client.query('BEGIN');
    for (const c of cards) {
      await upsertCard(client, c);
    }
    await client.query('COMMIT');

    // Pagos iniciales (si existen)
    if (Array.isArray(pays) && pays.length) {
      await client.query('BEGIN');
      for (const p of pays) {
        await insertPayment(client, p);
      }
      await client.query('COMMIT');
    }

    console.log(
      `Seed OK: ${cards.length} tarjetas, ${Array.isArray(pays) ? pays.length : 0} pagos.`,
    );
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // intentionally ignore rollback errors
    }
    console.error('Error en seed:', e.message || e);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Fallo inesperado en seed:', e);
  process.exitCode = 1;
});
