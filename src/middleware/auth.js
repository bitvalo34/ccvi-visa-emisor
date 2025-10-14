// src/middleware/auth.js
export function requireApiKey(req, res, next) {
  const configured = (process.env.API_KEY || '').trim();
  const provided = (req.get('x-api-key') || '').trim();
  if (!configured) {
    return res.status(500).json({ error: 'API key no configurada en el servidor' });
  }
  if (!provided || provided !== configured) {
    return res.status(401).json({ error: 'API key inválida o ausente' });
  }
  next();
}
