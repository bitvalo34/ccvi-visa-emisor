// src/server.js
import app from './app.js';

// usa PORT o 3000 por defecto
const port = Number.parseInt(process.env.PORT ?? '3000', 10);

const server = app.listen(port, () => {
  console.log(`✅ API ready on :${port}`);
});

// errores al arrancar (EADDRINUSE, EACCES, etc.)
server.on('error', (err) => {
  console.error('❌ No se pudo iniciar el servidor:', err);
  process.exit(1);
});

// apagado elegante
const shutdown = (signal) => {
  console.log(`\n${signal} recibido. Cerrando...`);
  server.close((closeErr) => {
    if (closeErr) {
      console.error('Error al cerrar:', closeErr);
      process.exit(1);
    }
    console.log('🟢 Servidor cerrado correctamente.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
