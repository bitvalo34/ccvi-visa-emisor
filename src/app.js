// src/app.js
import express from 'express';
import crypto from 'node:crypto';
import { checkDb, withTransaction, pool } from './db.js';
import swaggerUi from 'swagger-ui-express';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'node:url';
import { sendPayload, sendError, decideFormat } from './utils/xml.js';
import { xmlBody as xmlBodyMiddleware } from './middleware/xml-body.js';
import cardsRouter from './routes/cards.js';
import pino from 'pino';
import pinoHttp from 'pino-http';

import { normalizeAuthorizationInput, validateAuthorizationInput } from './middleware/normalize.js';
import { requireApiKey } from './middleware/auth.js';

const app = express();
// --- base path (allow serving behind /VISA or any prefix without breaking local tests) ---
const rawBase = process.env.BASE_PATH || '';
const BASE_PATH = rawBase ? '/' + rawBase.replace(/^\/+|\/+$/g, '') : '';
// --- logging (pino) ---
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'req.headers["idempotency-key"]',
      'req.body.cvv',
      'req.body.num_seguridad',
      'req.body.tarjeta',
      'req.body.numero',
      'responseBody.cvv',
      'responseBody.tarjeta',
      'responseBody.numero',
    ],
    censor: '[REDACTED]',
  },
});
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignorePaths: ['/healthz', '/readyz'] },
    genReqId: (req) => req.headers['idempotency-key'] || crypto.randomUUID(),
    customLogLevel(req, res, err) {
      if (err || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
  }),
);
app.use(express.json()); // JSON
app.use(express.text({ type: ['application/xml', 'text/xml'], limit: '1mb' })); // XML crudo
app.set('json spaces', 2);

// OpenAPI (ruta robusta y manejo de errores)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const specPath = path.resolve(__dirname, '..', 'docs', 'openapi.yaml');

let openapiDoc;
try {
  openapiDoc = yaml.load(fs.readFileSync(specPath, 'utf8'));
} catch (e) {
  console.warn(`No se pudo cargar OpenAPI en ${specPath}: ${e.message}`);
}

if (openapiDoc) {
  app.use(`${BASE_PATH}/docs`, swaggerUi.serve, swaggerUi.setup(openapiDoc));
  app.get(`${BASE_PATH}/docs.json`, (_req, res) => res.json(openapiDoc));
}

// --- helpers de seguridad/negocio ---
const ISSUER = process.env.ISSUER_NAME || 'VISA';
const IDEM_TTL_HOURS = Number(process.env.IDEMPOTENCY_TTL_HOURS || 24);

const CVV_PEPPER = process.env.CVV_PEPPER || 'dev-pepper-change-me';
function hmacCvv(cvv) {
  return crypto.createHmac('sha256', CVV_PEPPER).update(String(cvv)).digest('hex');
}

function maskPan(pan) {
  const last4 = pan.slice(-4);
  return `****-****-****-${last4}`;
}

function isFreshIdem(isoDate) {
  const ttlMs = IDEM_TTL_HOURS * 60 * 60 * 1000;
  return Date.now() - new Date(isoDate).getTime() < ttlMs;
}

// --- Core de autorización reutilizable (POST moderno y GET legacy) ---
async function processAuthorization({ tarjeta, cvv, monto, tienda, idempotencyKey }) {
  const amount = Number(monto);
  // 1) Idempotencia: misma key + mismo payload => misma respuesta (200)
  if (idempotencyKey) {
    const idem = await checkIdempotency(idempotencyKey);
    if (idem) {
      if (
        idem.tarjeta_numero !== tarjeta ||
        Number(idem.monto) !== amount ||
        idem.comercio !== tienda
      ) {
        return {
          statusCode: 409,
          payload: {
            code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PARAMETERS',
            previous: {
              tarjeta: maskPan(idem.tarjeta_numero),
              monto: idem.monto,
              tienda: idem.comercio,
            },
          },
        };
      }
      if (isFreshIdem(idem.creada_en)) {
        const numeroOut = idem.status === 'APROBADO' ? (idem.autorizacion_numero ?? '0') : '0';
        return {
          statusCode: 200,
          payload: {
            emisor: ISSUER,
            tarjeta: maskPan(tarjeta),
            status: idem.status,
            numero: numeroOut,
            creada_en: idem.creada_en,
          },
        };
      }
    }
  }

  // 2) Transacción con verificación de CVV y saldo en DB (trigger decide resultado)
  const result = await withTransaction(async (client) => {
    const { rows: cardRows } = await client.query(
      `SELECT cvv_hmac FROM emisor.tarjetas WHERE numero = $1`,
      [tarjeta],
    );
    if (cardRows.length === 0) {
      return {
        status: 'DENEGADO',
        autorizacion_numero: '000000',
        creada_en: new Date().toISOString(),
      };
    }
    const expected = String(cardRows[0].cvv_hmac || '');
    const provided = hmacCvv(cvv);
    if (expected !== provided) {
      const { rows } = await client.query(
        `INSERT INTO emisor.transacciones
           (tarjeta_numero, tipo, monto, comercio, idempotency_key, status, autorizacion_numero, detalle_denegacion)
         VALUES ($1, 'consumo', $2, $3, NULLIF($4,''), 'DENEGADO', '000000', 'INVALID_CVV')
         RETURNING status, autorizacion_numero, creada_en`,
        [tarjeta, amount, tienda, idempotencyKey || null],
      );
      return rows[0];
    }
    const { rows } = await client.query(
      `INSERT INTO emisor.transacciones
         (tarjeta_numero, tipo, monto, comercio, idempotency_key)
       VALUES ($1, 'consumo', $2, $3, NULLIF($4,'')) 
       RETURNING status, autorizacion_numero, creada_en`,
      [tarjeta, amount, tienda, idempotencyKey || null],
    );
    return rows[0];
  });

  const numeroOut = result.status === 'APROBADO' ? (result.autorizacion_numero ?? '0') : '0';
  return {
    statusCode: 201,
    payload: {
      emisor: ISSUER,
      tarjeta: maskPan(tarjeta),
      status: result.status,
      numero: numeroOut,
      creada_en: result.creada_en,
    },
  };
}

// --- XML helpers & content negotiation (usar utils/xml.js) ---
app.use(xmlBodyMiddleware);
app.use((req, res, next) => {
  if (req._xmlParseError) {
    return sendError(req, res, 400, 'INVALID_XML', { reason: 'Malformed XML' });
  }
  return next();
});

app.get(`${BASE_PATH}/metadata`, (req, res) => {
  const publicBase = process.env.PUBLIC_BASE_URL || `http://localhost:3000${BASE_PATH}`;
  const body = {
    emisor_id: process.env.ISSUER_ID || 'VISA-EMISOR-LOCAL',
    emisor: process.env.ISSUER_NAME || 'VISA',
    host: publicBase,
    formatos: ['JSON', 'XML'],
    scripts: { autorizacion: `${BASE_PATH}/autorizacion` },
  };
  // Si tienes sendPayload (JSON/XML), úsalo; si no, res.json(body)
  return typeof sendPayload === 'function'
    ? sendPayload(req, res, 'metadata', body, 200)
    : res.status(200).json(body);
});

// --- health ---
app.get(`${BASE_PATH}/healthz`, (_req, res) => res.json({ ok: true }));

app.get(`${BASE_PATH}/readyz`, async (_req, res) => {
  try {
    await checkDb();
    res.json({ ready: true });
  } catch (err) {
    res.status(503).json({ ready: false, error: err?.message ?? 'db unavailable' });
  }
});

// ===== Legacy: GET /autorizacion =====
app.get(
  `${BASE_PATH}/autorizacion`,
  normalizeAuthorizationInput,
  validateAuthorizationInput,
  async (req, res) => {
    const { tarjeta, cvv, monto, tienda, idempotencyKey } = req.normalized;
    try {
      const result = await processAuthorization({ tarjeta, cvv, monto, tienda, idempotencyKey });
      // Legacy: siempre 200 OK; incluimos payload con status APROBADO/DENEGADO
      if (result.statusCode === 409) {
        // Mantener semántica legacy: 200 con código en cuerpo (no 409) para GET
        const body = {
          code: 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PARAMETERS',
          previous: result.payload.previous,
        };
        if (decideFormat(req) === 'XML') {
          return sendPayload(req, res, 'error', body, 200);
        }
        return res.status(200).json({ error: body });
      }
      const payload = result.payload;
      if (decideFormat(req) === 'XML') {
        return sendPayload(req, res, 'autorizacion', payload, 200);
      }
      return res.status(200).json({ autorización: payload });
    } catch {
      return sendError(req, res, 500, 'INTERNAL_ERROR');
    }
  },
);

// ========== POST /api/v1/authorizations ==========
app.post(
  `${BASE_PATH}/api/v1/authorizations`,
  requireApiKey,
  normalizeAuthorizationInput,
  validateAuthorizationInput,
  async (req, res) => {
    const { tarjeta, cvv, monto, tienda, idempotencyKey } = req.normalized;
    try {
      const result = await processAuthorization({ tarjeta, cvv, monto, tienda, idempotencyKey });
      if (result.statusCode === 409) {
        return sendError(
          req,
          res,
          409,
          'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PARAMETERS',
          result.payload,
        );
      }
      return sendPayload(req, res, 'authorization', result.payload, result.statusCode);
    } catch (err) {
      console.error('Error en autorización:', { msg: err?.message });
      return sendError(req, res, 500, 'INTERNAL_ERROR');
    }
  },
);

// ========== Cards API ==========
app.use(`${BASE_PATH}/api/v1/cards`, cardsRouter);

// ----- helpers específicos del endpoint -----
async function checkIdempotency(key) {
  const { rows } = await pool.query(
    `SELECT tarjeta_numero, comercio, monto, status, autorizacion_numero, creada_en
       FROM emisor.transacciones
      WHERE idempotency_key = $1
      ORDER BY creada_en ASC
      LIMIT 1`,
    [key],
  );
  return rows[0] || null;
}

// 404 JSON
app.use((req, res) => {
  return sendError(req, res, 404, 'Not Found', { path: req.path });
});

export default app;
