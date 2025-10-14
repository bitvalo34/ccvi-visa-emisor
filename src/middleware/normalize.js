// src/middleware/normalize.js
import { sendValidationError } from '../utils/xml.js';
const DIACRITICS = /[\u0300-\u036f]/g;

export function normalizeName(s = '') {
  return s
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[\s'’\-.·,]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

function cleanDigits(s = '') {
  return String(s).replace(/\D+/g, '');
}

function normalizeFechaVenc(raw = '') {
  const s = String(raw).trim();
  if (/^\d{6}$/.test(s)) return s; // YYYYMM
  if (/^\d{4}$/.test(s)) {
    // MMYY
    const mm = s.slice(0, 2),
      yy = s.slice(2);
    const yyyy = Number(yy) <= 79 ? '20' + yy : '19' + yy;
    return yyyy + mm;
  }
  if (/^\d{2}\/\d{2}$/.test(s)) {
    const [mm, yy] = s.split('/');
    const yyyy = Number(yy) <= 79 ? '20' + yy : '19' + yy;
    return yyyy + mm;
  }
  return s;
}

function isValidYYYYMM(yymm) {
  if (!/^\d{6}$/.test(yymm)) return false;
  const m = Number(yymm.slice(4, 6));
  if (m < 1 || m > 12) return false;
  return true;
}

function luhnOk(pan) {
  let sum = 0,
    dbl = false;
  for (let i = pan.length - 1; i >= 0; i--) {
    let d = pan.charCodeAt(i) - 48;
    if (dbl) {
      d = d * 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

export function normalizeAuthorizationInput(req, _res, next) {
  const src = req.method === 'GET' ? req.query || {} : req.body || {};
  // mapeo multi-aliased para asegurar el mismo shape tras JSON o XML
  const tarjeta = cleanDigits(src.tarjeta || src.card || '');
  const nombre = normalizeName(src.nombre || src.name || '');
  const cvv = cleanDigits(src.num_seguridad || src.cvv || '');
  const fecha = normalizeFechaVenc(src.fecha_venc || src.vencimiento || src.exp || '');
  const monto = String(src.monto ?? src.amount ?? '').trim();
  const tienda = (src.tienda || src.merchant || '')
    .replace(/\s+/g, '')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toUpperCase();

  // Idempotency-Key: header (case-insensitive en Express) + fallback desde body/query, tamaño máximo 255
  const idemHeader = req.get('Idempotency-Key');
  const idemBody = src.idempotencyKey || src.idempotency_key;
  let idemKey = String(idemHeader ?? idemBody ?? '').trim();
  if (idemKey && idemKey.length > 255) idemKey = idemKey.slice(0, 255);
  if (!idemKey) idemKey = null;

  // negociación legacy por query (también usado por /autorizacion)
  const formato = String(src.formato || '')
    .trim()
    .toUpperCase();

  req.normalized = {
    tarjeta,
    nombre,
    cvv,
    fecha_venc: fecha,
    monto,
    tienda,
    idempotencyKey: idemKey,
    formato,
  };
  next();
}

export function validateAuthorizationInput(req, res, next) {
  const { tarjeta, nombre, cvv, fecha_venc, monto } = req.normalized || {};
  const errors = [];

  if (!(tarjeta.length === 16 && /^\d{16}$/.test(tarjeta) && luhnOk(tarjeta))) {
    errors.push({ field: 'tarjeta', reason: 'INVALID_FORMAT_OR_LUHN' });
  }
  if (!nombre || nombre.length < 2)
    errors.push({ field: 'nombre', reason: 'EMPTY_AFTER_NORMALIZATION' });
  if (!/^\d{6}$/.test(fecha_venc) || !isValidYYYYMM(fecha_venc))
    errors.push({ field: 'fecha_venc', reason: 'INVALID_FORMAT' });
  if (!/^\d{3}$/.test(cvv)) errors.push({ field: 'cvv', reason: 'INVALID_FORMAT' });
  if (!/^\d+(\.\d{1,2})?$/.test(monto) || Number(monto) <= 0)
    errors.push({ field: 'monto', reason: 'INVALID_AMOUNT' });

  if (errors.length) {
    // 422 Unprocessable Content (semántica inválida) – RFC 9110
    return sendValidationError(req, res, errors);
  }
  next();
}
