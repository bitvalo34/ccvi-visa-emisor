# Etapa única para desarrollo (para prod haríamos multi-stage)
FROM node:24-bookworm-slim

# Evita prompts y reduce tamaño
ENV NODE_ENV=development

WORKDIR /usr/src/app

# Instala dependencias según lockfile
COPY package*.json ./
RUN npm ci --prefer-offline --no-audit --no-fund

# Copia el resto del código
COPY . .

EXPOSE 3000

CMD ["node","src/server.js"]
