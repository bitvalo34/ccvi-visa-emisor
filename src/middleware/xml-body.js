// src/middleware/xml-body.js
import { XMLParser } from 'fast-xml-parser';

// Configuración: sin atributos/NS, recorte de valores
const parser = new XMLParser({
  ignoreAttributes: true,
  attributeNamePrefix: '',
  trimValues: true,
  allowBooleanAttributes: true,
});

export function xmlBody(req, _res, next) {
  const ct = String(req.headers['content-type'] || '').toLowerCase();

  // Solo intentamos parsear si el body viene como texto XML
  if (
    (ct.includes('application/xml') || ct.includes('text/xml')) &&
    typeof req.body === 'string' &&
    req.body.trim().length
  ) {
    try {
      const parsed = parser.parse(req.body);
      // Detectar raíces conocidas
      const rootAuth = parsed.authorization || parsed.autorizacion;
      const rootCard = parsed.card || parsed.tarjeta;
      const rootPay = parsed.payment || parsed.pago;

      // Helpers
      const pick = (obj, keys, def = '') =>
        (Array.isArray(keys) ? keys : [keys]).reduce((v, k) => obj?.[k] ?? v, undefined) ?? def;

      if (rootCard) {
        // Soporta crear/actualizar tarjeta
        req.body = {
          numero: pick(rootCard, ['numero', 'number', 'pan'], ''),
          nombre: pick(rootCard, ['nombre', 'name'], ''),
          fecha_venc: pick(rootCard, ['fecha_venc', 'vencimiento', 'exp'], ''),
          cvv: pick(rootCard, ['cvv', 'num_seguridad'], ''),
          limite: pick(rootCard, ['limite', 'limit'], ''),
          disponible: pick(rootCard, ['disponible', 'available'], undefined),
          estado: pick(rootCard, ['estado', 'status'], undefined),
        };
        // Normalizar opcionales vacíos a undefined para evitar validaciones erróneas
        if (req.body.disponible != null && String(req.body.disponible).trim() === '') {
          req.body.disponible = undefined;
        }
        if (req.body.estado != null && String(req.body.estado).trim() === '') {
          req.body.estado = undefined;
        }
      } else if (rootPay) {
        // Soporta pagos
        const idem = pick(rootPay, ['idempotencyKey', 'idempotency_key', 'idemKey'], '');
        req.body = {
          monto: pick(rootPay, ['monto', 'amount'], ''),
          referencia: pick(rootPay, ['referencia', 'reference'], ''),
          idempotencyKey: String(idem || ''),
        };
      } else if (rootAuth) {
        // Autorizaciones
        req.body = {
          tarjeta: pick(rootAuth, ['tarjeta', 'card'], ''),
          nombre: pick(rootAuth, ['nombre', 'name'], ''),
          fecha_venc: pick(rootAuth, ['fecha_venc', 'vencimiento', 'exp'], ''),
          cvv: pick(rootAuth, ['cvv', 'num_seguridad'], ''),
          monto: pick(rootAuth, ['monto', 'amount'], ''),
          tienda: pick(rootAuth, ['tienda', 'merchant'], ''),
          formato: pick(rootAuth, ['formato'], ''),
        };
      } else {
        // Fallback: no raíz conocida, no transformar para no romper otros flujos
        req.body = parsed;
      }
    } catch (e) {
      // No rompemos el flujo: marcamos el error y dejamos que el handler responda 400 si corresponde
      req._xmlParseError = e;
    }
  }

  next(); // middleware Express: siempre continuar la cadena si no finalizamos la respuesta
}
