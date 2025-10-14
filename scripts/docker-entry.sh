#!/usr/bin/env sh
# EDITADITO: entrypoint robusto para asegurar dependencias instaladas antes de iniciar
set -e
cd /usr/src/app

# EDITADITO: función para resolver un módulo; si falla, salimos con código 1
need_install=false
resolve() {
  node -e "require.resolve(process.argv[1])" "$1" >/dev/null 2>&1 || need_install=true
}

# EDITADITO: comprobar si node_modules existe y si faltan módulos críticos
if [ ! -d node_modules ]; then
  need_install=true
fi

# EDITADITO: verificar algunos paquetes que usamos
resolve swagger-ui-express
resolve fast-xml-parser
resolve xmlbuilder2
resolve js-yaml

# EDITADITO: si cambió el lockfile, reinstalar
if command -v sha256sum >/dev/null 2>&1; then
  cur_hash=$(sha256sum package-lock.json | awk '{print $1}')
  prev_hash=""
  if [ -f node_modules/.lockhash ]; then
    prev_hash=$(cat node_modules/.lockhash 2>/dev/null || true)
  fi
  if [ "$cur_hash" != "$prev_hash" ]; then
    need_install=true
  fi
fi

if [ "$need_install" = true ]; then
  echo "//EDITADITO npm ci ejecutándose dentro del contenedor..."
  npm ci --prefer-offline --no-audit --no-fund
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum package-lock.json | awk '{print $1}' > node_modules/.lockhash || true
  fi
fi

exec node src/server.js
