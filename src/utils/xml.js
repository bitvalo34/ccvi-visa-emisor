// src/utils/xml.js
// Utilidades XML + negociación de contenido (JSON/XML)

import { XMLParser } from 'fast-xml-parser';
import { create as createXml } from 'xmlbuilder2';

// Parser XML (sin atributos ni namespaces; trimming activado)
export const xmlParser = new XMLParser({
  ignoreAttributes: true,
  attributeNamePrefix: '',
  trimValues: true,
  allowBooleanAttributes: true,
});

// Decide formato de salida. Prioridad:
// 1) ?formato=XML|JSON (también si vino en el body)
// 2) Encabezado Accept (server-driven negotiation)
// 3) XML por defecto
export function decideFormat(req) {
  const q = String(req.query?.formato ?? req.body?.formato ?? '')
    .trim()
    .toUpperCase();
  if (q === 'XML') return 'XML';
  if (q === 'JSON') return 'JSON';
  const acc = req.accepts?.(['application/xml', 'xml', 'application/json', 'json']);
  if (!acc) return 'XML';
  return acc === 'application/xml' || acc === 'xml' ? 'XML' : 'JSON';
}

// Convierte un objeto JS plano a XML con la raíz indicada.
// Si una propiedad es un array, emite la etiqueta repetida.
export function toXML(rootTag, payload = {}) {
  const doc = createXml({ version: '1.0', encoding: 'UTF-8' }).ele(rootTag);

  const append = (node, key, value) => {
    if (value === undefined || value === null) {
      node.ele(key).txt('');
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((v) => append(node, key, v));
      return;
    }
    if (typeof value === 'object') {
      const child = node.ele(key);
      Object.entries(value).forEach(([k, v]) => append(child, k, v));
      return;
    }
    node.ele(key).txt(String(value));
  };

  Object.entries(payload).forEach(([k, v]) => append(doc, k, v));
  return doc.end({ prettyPrint: true });
}

// Middleware: si el request trae XML en el body, lo parsea y lo mapea
// al shape esperado por el normalizador (tarjeta, nombre, fecha_venc, cvv, monto, tienda, formato).
export function xmlBodyMiddleware(req, res, next) {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  if (
    (ct.includes('application/xml') || ct.includes('text/xml')) &&
    typeof req.body === 'string' &&
    req.body.trim().length
  ) {
    try {
      const parsed = xmlParser.parse(req.body);
      const root = parsed.authorization || parsed.autorizacion || parsed;
      req.body = {
        tarjeta: root.tarjeta ?? root.card ?? '',
        nombre: root.nombre ?? root.name ?? '',
        fecha_venc: root.fecha_venc ?? root.vencimiento ?? root.exp ?? '',
        cvv: root.cvv ?? root.num_seguridad ?? '',
        monto: root.monto ?? root.amount ?? '',
        tienda: root.tienda ?? root.merchant ?? '',
        formato: root.formato ?? '',
      };
    } catch (e) {
      // dejamos una marca para que los controladores puedan responder 400 si quieren
      req._xmlParseError = e;
    }
  }
  return next();
}

// Respuestas negociadas JSON/XML
export function sendPayload(req, res, rootTag, obj, status = 200) {
  const fmt = decideFormat(req);
  if (fmt === 'XML') {
    return res.status(status).type('application/xml').send(toXML(rootTag, obj));
  }
  return res.status(status).json(obj);
}

export function sendError(req, res, status, code, details = {}) {
  const fmt = decideFormat(req);
  if (fmt === 'XML') {
    const xmlErr = { code, ...details };
    return res.status(status).type('application/xml').send(toXML('error', xmlErr));
  }
  const jsonErr = details.fields
    ? { error: { code, fields: details.fields } }
    : { error: { code, ...details } };
  return res.status(status).json(jsonErr);
}

// 422 con lista de campos [{field, reason}]
export function sendValidationError(req, res, fields) {
  const fmt = decideFormat(req);
  if (fmt === 'XML') {
    // Estructura <error><code>VALIDATION_ERROR</code><fields>...</fields></error>
    // EDITADITO: construir nodos explícitamente para evitar 'Last child node is null'
    const root = createXml({ version: '1.0', encoding: 'UTF-8' }).ele('error'); //EDITADITO
    root.ele('code').txt('VALIDATION_ERROR'); //EDITADITO
    const fieldsNode = root.ele('fields'); //EDITADITO

    for (const e of fields) {
      //EDITADITO
      const n = fieldsNode.ele('field'); //EDITADITO
      n.ele('name').txt(e.field); //EDITADITO
      n.ele('reason').txt(e.reason); //EDITADITO
    }
    return res
      .status(422)
      .type('application/xml')
      .send(root.end({ prettyPrint: true })); //EDITADITO
  }
  return res.status(422).json({ error: { code: 'VALIDATION_ERROR', fields } });
}
