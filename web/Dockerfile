# Multi-stage build for Vite React app
# 1) Build stage
FROM node:20-alpine AS build
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN if [ -f package-lock.json ]; then \
			npm ci; \
		else \
			npm install --no-audit --no-fund; \
		fi

# Build-time envs for Vite (client env must start with VITE_)
ARG VITE_API_BASE=/
ARG VITE_API_KEY=
ENV VITE_API_BASE=${VITE_API_BASE}
ENV VITE_API_KEY=${VITE_API_KEY}

# Copy sources and build
COPY . .
RUN npm run build

# 2) Runtime stage (NGINX)
FROM nginx:alpine

# Copy build output to Nginx html directory
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config for SPA + API proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# Use the default nginx start command
CMD ["nginx", "-g", "daemon off;"]
