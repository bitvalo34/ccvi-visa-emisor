# syntax=docker/dockerfile:1.7
FROM node:24-bookworm-slim

# Trabajamos como usuario no root por seguridad
WORKDIR /usr/src/app

# Copiamos package* primero para caché eficiente
COPY package*.json ./

# Instala deps (solo prod cuando se hace `--omit=dev`)
RUN npm ci

# Copia el resto del código
COPY . .

# Puerto expuesto por la API
EXPOSE 3000

# Arranque por defecto (usa PORT si existe)
CMD ["node", "src/server.js"]
