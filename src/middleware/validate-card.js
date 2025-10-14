// src/middleware/validate-card.js
import { sendValidationError } from '../utils/xml.js';

const digits = (n) => new RegExp(`^\\d{${n}}$`);

export function validateCreateCard(req, res, next) {
  const b = req.body || {};
  const errors = [];
  const nombre = String((b.nombre ?? b.nombre_titular) || '').trim();
  const limiteVal = b.limite ?? b.monto_autorizado;
  if (!digits(16).test(String(b.numero || '').replace(/\D+/g, '')))
    errors.push({ field: 'numero', reason: 'INVALID_PAN' });
  if (!nombre) errors.push({ field: 'nombre', reason: 'REQUIRED' });
  if (!digits(6).test(String(b.fecha_venc || '')))
    errors.push({ field: 'fecha_venc', reason: 'INVALID_FORMAT' });
  if (!digits(3).test(String(b.cvv || ''))) errors.push({ field: 'cvv', reason: 'INVALID_FORMAT' });
  if (!/^\d+(\.\d{1,2})?$/.test(String(limiteVal || '')))
    errors.push({ field: 'limite', reason: 'INVALID_AMOUNT' });
  if (b.disponible != null && !/^\d+(\.\d{1,2})?$/.test(String(b.disponible)))
    errors.push({ field: 'disponible', reason: 'INVALID_AMOUNT' });
  if (errors.length) return sendValidationError(req, res, errors);
  next();
}

export function validatePatchCard(req, res, next) {
  const b = req.body || {};
  const errors = [];
  if (
    b.estado != null &&
    !['activa', 'bloqueada', 'ACTIVA', 'BLOQUEADA'].includes(String(b.estado))
  ) {
    errors.push({ field: 'estado', reason: 'INVALID_VALUE' });
  }
  if (b.disponible != null && !/^\d+(\.\d{1,2})?$/.test(String(b.disponible))) {
    errors.push({ field: 'disponible', reason: 'INVALID_AMOUNT' });
  }
  if (errors.length) return sendValidationError(req, res, errors);
  next();
}

export function validatePayment(req, res, next) {
  const b = req.body || {};
  const errors = [];
  if (!/^\d+(\.\d{1,2})?$/.test(String(b.monto || '')) || Number(b.monto) <= 0) {
    errors.push({ field: 'monto', reason: 'INVALID_AMOUNT' });
  }
  if (errors.length) return sendValidationError(req, res, errors);
  next();
}
