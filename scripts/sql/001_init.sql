-- scripts/sql/001_init.sql
-- Esquema y extensiones
CREATE SCHEMA IF NOT EXISTS emisor;

-- UUIDs y funciones criptográficas
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid(), digest(), etc.

-- Tipos enumerados (evitan strings "mágicos")
CREATE TYPE emisor.card_estado   AS ENUM ('activa', 'bloqueada', 'vencida');
CREATE TYPE emisor.tx_tipo       AS ENUM ('consumo', 'pago');
CREATE TYPE emisor.tx_status     AS ENUM ('APROBADO', 'DENEGADO'); -- PDF exige estos valores

-- Tarjetas
CREATE TABLE IF NOT EXISTS emisor.tarjetas (
  numero                  CHAR(16) PRIMARY KEY,
  nombre_titular          TEXT        NOT NULL,
  -- Normalizado: MAYÚSCULAS sin espacios ni tildes (útil para comparaciones)
  nombre_titular_normalizado TEXT GENERATED ALWAYS AS (
    regexp_replace(upper(nombre_titular), '[^A-Z0-9]', '', 'g')
  ) STORED,
  fecha_venc              CHAR(6)     NOT NULL,      -- yyyymm
  cvv_hmac                TEXT        NOT NULL,      -- no guardes CVV en claro
  monto_autorizado        NUMERIC(12,2) NOT NULL CHECK (monto_autorizado >= 0),
  monto_disponible        NUMERIC(12,2) NOT NULL CHECK (monto_disponible >= 0),
  estado                  emisor.card_estado NOT NULL DEFAULT 'activa',
  creada_en               TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizada_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Validaciones de formato
  CONSTRAINT tarjetas_numero_formato_chk CHECK (numero ~ '^[0-9]{16}$'),
  CONSTRAINT tarjetas_venc_formato_chk   CHECK (fecha_venc ~ '^[0-9]{6}$'),
  -- No vencida (comparando meses)
  CONSTRAINT tarjetas_venc_coherente_chk CHECK (
    to_date(fecha_venc || '01', 'YYYYMMDD') >= date_trunc('month', current_date)
    OR estado = 'vencida'  -- si decides marcarla manualmente
  )
);

CREATE INDEX IF NOT EXISTS ix_tarjetas_nombre_norm
  ON emisor.tarjetas (nombre_titular_normalizado);

-- Transacciones
CREATE TABLE IF NOT EXISTS emisor.transacciones (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarjeta_numero          CHAR(16) NOT NULL REFERENCES emisor.tarjetas(numero),
  tipo                    emisor.tx_tipo   NOT NULL,
  monto                   NUMERIC(12,2)    NOT NULL CHECK (monto > 0),
  comercio                VARCHAR(80)      NOT NULL,
  idempotency_key         VARCHAR(64),             -- nullable
  autorizacion_numero     CHAR(6),                 -- '000000' para denegadas o NULL; 6 dígitos en aprobadas
  status                  emisor.tx_status NOT NULL,
  detalle_denegacion      TEXT,
  creada_en               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tx_autoriz_formato_chk CHECK (autorizacion_numero IS NULL OR autorizacion_numero ~ '^[0-9]{6}$')
);

-- Índices para consultas típicas
CREATE INDEX IF NOT EXISTS ix_tx_tarjeta_fecha
  ON emisor.transacciones (tarjeta_numero, creada_en DESC);

-- Unicidad condicional (parcial) del número de autorización SOLO cuando está APROBADO
CREATE UNIQUE INDEX IF NOT EXISTS ux_tx_autoriz_aprobado
  ON emisor.transacciones (autorizacion_numero)
  WHERE status = 'APROBADO';

-- Idempotencia: evita duplicados si llega la misma combinación con Idempotency-Key
CREATE UNIQUE INDEX IF NOT EXISTS ux_tx_idempotency
  ON emisor.transacciones (tarjeta_numero, comercio, monto, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
