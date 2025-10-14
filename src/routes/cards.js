// src/routes/cards.js
import { Router } from 'express';
import crypto from 'node:crypto';
import { pool, withTransaction } from '../db.js'; // asumiendo que ya lo tienes
import { requireApiKey } from '../middleware/auth.js';
import { sendPayload, sendError } from '../utils/xml.js';
import {
  validateCreateCard,
  validatePatchCard,
  validatePayment,
} from '../middleware/validate-card.js';

const router = Router();
const ISSUER = process.env.ISSUER_NAME || 'VISA';
const CVV_PEPPER = process.env.CVV_PEPPER || 'dev-pepper-change-me';

// util pequeño
const cleanDigits = (s = '') => String(s).replace(/\D+/g, '');
const maskPan = (pan) => `${pan.slice(0, 0)}****-****-****-${pan.slice(-4)}`;

/**
 * POST /api/v1/cards
 * Crea una tarjeta emitida por VISA.
 * Body: { numero(16), nombre, fecha_venc(yyyymm), cvv(3), limite, disponible?, estado? }
 */
router.post(
  '/',
  requireApiKey,
  expressEnsureNoXmlParseError,
  validateCreateCard,
  async (req, res) => {
    try {
      const src = req.body || {};
      const numero = cleanDigits(src.numero);
      // nombre_titular_normalizado se genera en DB; insertamos nombre_titular crudo
      const fecha_venc = String(src.fecha_venc);
      const cvv = String(src.cvv);
      const limite = Number(src.limite ?? src.monto_autorizado);
      const disponible = src.disponible != null ? Number(src.disponible) : limite;
      const estado =
        (src.estado || 'activa').toLowerCase() === 'bloqueada' ? 'bloqueada' : 'activa';

      // HMAC del CVV (no almacenar en claro)
      const hmac = crypto.createHmac('sha256', CVV_PEPPER);
      hmac.update(cvv);
      const cvv_hmac = hmac.digest('hex');

      const { rows } = await pool.query(
        `INSERT INTO emisor.tarjetas
          (numero, nombre_titular, fecha_venc, cvv_hmac, monto_autorizado, monto_disponible, estado)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING numero, nombre_titular_normalizado, fecha_venc, monto_autorizado, monto_disponible, estado, creada_en`,
        [
          numero,
          src.nombre ?? src.nombre_titular,
          fecha_venc,
          cvv_hmac,
          limite,
          disponible,
          estado,
        ],
      );

      const out = rows[0];
      return sendPayload(
        req,
        res,
        'card',
        {
          emisor: ISSUER,
          numero: out.numero,
          nombre_titular: out.nombre_titular_normalizado,
          fecha_venc: out.fecha_venc,
          monto_autorizado: Number(out.monto_autorizado),
          monto_disponible: Number(out.monto_disponible),
          estado: out.estado,
          creada_en: out.creada_en,
        },
        201,
      );
    } catch (err) {
      if (String(err?.message || '').includes('duplicate key')) {
        return sendError(req, res, 409, 'CARD_ALREADY_EXISTS');
      }
      return sendError(req, res, 500, 'INTERNAL_ERROR');
    }
  },
);

/**
 * GET /api/v1/cards
 * Lista todas las tarjetas con campos que espera el frontend.
 */
router.get('/', requireApiKey, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT numero,
              nombre_titular_normalizado,
              fecha_venc,
              monto_autorizado,
              monto_disponible,
              estado,
              creada_en,
              actualizada_en
         FROM emisor.tarjetas
        ORDER BY creada_en DESC`,
    );
    const out = rows.map((r) => ({
      numero: String(r.numero),
      nombre_titular: r.nombre_titular_normalizado,
      fecha_venc: String(r.fecha_venc),
      monto_autorizado: Number(r.monto_autorizado),
      monto_disponible: Number(r.monto_disponible),
      estado: r.estado,
      creada_en: r.creada_en,
      actualizada_en: r.actualizada_en,
    }));
    return res.json(out);
  } catch {
    return sendError(_req, res, 500, 'INTERNAL_ERROR');
  }
});

/**
 * GET /api/v1/cards/:numero
 * Devuelve detalle enmascarado.
 */
router.get('/:numero', requireApiKey, async (req, res) => {
  const numero = cleanDigits(req.params.numero);
  const { rows } = await pool.query(
    `SELECT numero, nombre_titular_normalizado, fecha_venc, monto_autorizado, monto_disponible, estado, creada_en, actualizada_en
     FROM emisor.tarjetas WHERE numero = $1`,
    [numero],
  );
  if (rows.length === 0) return sendError(req, res, 404, 'CARD_NOT_FOUND');
  const c = rows[0];
  return sendPayload(
    req,
    res,
    'card',
    {
      emisor: ISSUER,
      numero: c.numero,
      nombre_titular: c.nombre_titular_normalizado,
      fecha_venc: c.fecha_venc,
      monto_autorizado: Number(c.monto_autorizado),
      monto_disponible: Number(c.monto_disponible),
      estado: c.estado,
      creada_en: c.creada_en,
      actualizada_en: c.actualizada_en,
    },
    200,
  );
});

/**
 * PATCH /api/v1/cards/:numero
 * Permite actualizar 'estado' y/o 'disponible' (set absoluto, validando que 0 <= disponible <= limite)
 */
router.patch(
  '/:numero',
  requireApiKey,
  expressEnsureNoXmlParseError,
  validatePatchCard,
  async (req, res) => {
    const numero = cleanDigits(req.params.numero);
    const estadoReq = req.body?.estado;
    const dispReq = req.body?.disponible;

    try {
      const out = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `SELECT * FROM emisor.tarjetas WHERE numero = $1 FOR UPDATE`,
          [numero],
        );
        if (rows.length === 0) return null;
        const card = rows[0];

        let estado = card.estado;
        let disponible = card.monto_disponible;

        if (estadoReq != null) {
          estado = String(estadoReq).toLowerCase() === 'bloqueada' ? 'bloqueada' : 'activa';
        }
        if (dispReq != null) {
          const d = Number(dispReq);
          if (!Number.isFinite(d) || d < 0 || d > Number(card.monto_autorizado)) {
            throw new Error('INVALID_AVAILABLE');
          }
          disponible = d;
        }
        const { rows: upd } = await client.query(
          `UPDATE emisor.tarjetas SET estado=$2, monto_disponible=$3, actualizada_en=NOW() WHERE numero=$1
           RETURNING numero, nombre_titular_normalizado, fecha_venc, monto_autorizado, monto_disponible, estado, actualizada_en`,
          [numero, estado, disponible],
        );
        return upd[0];
      });

      if (!out) return sendError(req, res, 404, 'CARD_NOT_FOUND');
      return sendPayload(
        req,
        res,
        'card',
        {
          emisor: ISSUER,
          numero: out.numero,
          nombre_titular: out.nombre_titular_normalizado,
          fecha_venc: out.fecha_venc,
          monto_autorizado: Number(out.monto_autorizado),
          monto_disponible: Number(out.monto_disponible),
          estado: out.estado,
          actualizada_en: out.actualizada_en,
        },
        200,
      );
    } catch (err) {
      if (String(err?.message).includes('INVALID_AVAILABLE')) {
        return sendError(req, res, 422, 'INVALID_AVAILABLE', {
          reason: '0 <= disponible <= limite',
        });
      }
      return sendError(req, res, 500, 'INTERNAL_ERROR');
    }
  },
);

/**
 * POST /api/v1/cards/:numero/payments
 * Registra un pago que incrementa disponible (hasta el límite). Inserta transacción tipo 'pago'.
 * Body: { monto, referencia? } — admite Idempotency-Key opcional.
 */
router.post(
  '/:numero/payments',
  requireApiKey,
  expressEnsureNoXmlParseError,
  validatePayment,
  async (req, res) => {
    const numero = cleanDigits(req.params.numero);
    const monto = Number(req.body?.monto);
    const referencia = String(req.body?.referencia || '').slice(0, 64);
    const idemKey =
      String(req.get('Idempotency-Key') || req.body?.idempotencyKey || '').trim() || null;

    try {
      // Idempotencia básica para pagos
      if (idemKey) {
        const { rows: idemRows } = await pool.query(
          `SELECT id, monto, comercio, creada_en FROM emisor.transacciones
             WHERE idempotency_key = $1 AND tarjeta_numero=$2 AND tipo='pago'`,
          [idemKey, numero],
        );
        if (idemRows.length) {
          // Replay → 200 con mismo cuerpo (Stripe-like) :contentReference[oaicite:1]{index=1}
          const last = idemRows[0];
          const { rows: cardRows } = await pool.query(
            `SELECT numero, monto_autorizado, monto_disponible FROM emisor.tarjetas WHERE numero=$1`,
            [numero],
          );
          if (!cardRows.length) return sendError(req, res, 404, 'CARD_NOT_FOUND');
          return sendPayload(
            req,
            res,
            'payment',
            {
              emisor: ISSUER,
              tarjeta: maskPan(numero),
              monto: last.monto,
              disponible: cardRows[0].monto_disponible,
              referencia,
            },
            200,
          );
        }
      }

      const out = await withTransaction(async (client) => {
        // Bloquear la tarjeta (consistencia) :contentReference[oaicite:2]{index=2}
        const { rows } = await client.query(
          `SELECT * FROM emisor.tarjetas WHERE numero=$1 FOR UPDATE`,
          [numero],
        );
        if (!rows.length) return null;

        // Insertar transacción de pago; el trigger debe sumar al disponible (o haz el UPDATE tú si no tienes trigger)
        const { rows: trx } = await client.query(
          `INSERT INTO emisor.transacciones
             (tarjeta_numero, tipo, monto, comercio, idempotency_key, status, detalle_denegacion)
           VALUES ($1, 'pago', $2, $3, NULLIF($4,''), 'APROBADO', NULL)
           RETURNING id, creada_en`,
          [numero, monto, referencia || 'PAYMENT', idemKey || null],
        );

        // Releer disponible
        const { rows: after } = await client.query(
          `SELECT monto_autorizado, monto_disponible FROM emisor.tarjetas WHERE numero=$1`,
          [numero],
        );

        return { creada_en: trx[0].creada_en, disponible: after[0].monto_disponible };
      });

      if (!out) return sendError(req, res, 404, 'CARD_NOT_FOUND');

      return sendPayload(
        req,
        res,
        'payment',
        {
          emisor: ISSUER,
          tarjeta: maskPan(numero),
          monto: monto.toFixed(2),
          disponible: out.disponible,
          referencia,
          creada_en: out.creada_en,
        },
        201,
      );
    } catch {
      return sendError(req, res, 500, 'INTERNAL_ERROR');
    }
  },
);

/**
 * GET /api/v1/cards/:numero/transactions
 * Lista transacciones asociadas a la tarjeta
 */
router.get('/:numero/transactions', requireApiKey, async (req, res) => {
  const numero = cleanDigits(req.params.numero);
  const { rows } = await pool.query(
    `SELECT id, tarjeta_numero, tipo, monto, comercio, idempotency_key, autorizacion_numero, status, detalle_denegacion, creada_en
       FROM emisor.transacciones
      WHERE tarjeta_numero = $1
      ORDER BY creada_en DESC`,
    [numero],
  );
  const out = rows.map((r) => ({
    id: String(r.id),
    tarjeta_numero: String(r.tarjeta_numero),
    tipo: r.tipo,
    monto: Number(r.monto),
    comercio: r.comercio,
    idempotency_key: r.idempotency_key || undefined,
    autorizacion_numero: r.autorizacion_numero || undefined,
    status: r.status,
    detalle_denegacion: r.detalle_denegacion || undefined,
    creada_en: r.creada_en,
  }));
  return res.json(out);
});

export default router;

// --- helpers locales ---
function expressEnsureNoXmlParseError(req, res, next) {
  if (req._xmlParseError) {
    return sendError(req, res, 400, 'INVALID_XML', { reason: 'Malformed XML' });
  }
  return next();
}
