-- scripts/sql/002_business.sql

-- Touch de updated_at en tarjetas
CREATE OR REPLACE FUNCTION emisor.tg_touch_tarjetas()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizada_en := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_tarjetas_touch ON emisor.tarjetas;
CREATE TRIGGER tg_tarjetas_touch
BEFORE UPDATE ON emisor.tarjetas
FOR EACH ROW EXECUTE FUNCTION emisor.tg_touch_tarjetas();


-- Índice extra para búsquedas por idempotency_key (no-único, parcial)
CREATE INDEX IF NOT EXISTS ix_tx_idem
  ON emisor.transacciones (idempotency_key)
  WHERE idempotency_key IS NOT NULL;


-- Lógica de autorización/abonos en transacciones
CREATE OR REPLACE FUNCTION emisor.tg_transacciones_apply()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tar emisor.tarjetas%ROWTYPE;
  v_mes CHAR(6) := to_char(current_date, 'YYYYMM');
  v_code TEXT;
BEGIN
  IF NEW.status = 'DENEGADO' THEN
    NEW.autorizacion_numero := COALESCE(NEW.autorizacion_numero, '000000');
    RETURN NEW;
  END IF;
  -- Bloqueo fila de la tarjeta para serializar movimientos
  SELECT * INTO v_tar
    FROM emisor.tarjetas
   WHERE numero = NEW.tarjeta_numero
   FOR UPDATE;

  IF NOT FOUND THEN
    NEW.status := 'DENEGADO';
    NEW.detalle_denegacion := 'Tarjeta inexistente';
    NEW.autorizacion_numero := '000000';
    RETURN NEW;
  END IF;

  -- 1) Vencida específico (antes que "no activa")
  IF v_tar.fecha_venc < v_mes THEN
    NEW.status := 'DENEGADO';
    NEW.detalle_denegacion := 'Tarjeta vencida';
    NEW.autorizacion_numero := '000000';
    RETURN NEW;
  END IF;

  -- 2) No activa (bloqueada u otro estado != activa)
  IF v_tar.estado <> 'activa' THEN
    NEW.status := 'DENEGADO';
    NEW.detalle_denegacion := 'Tarjeta no activa';
    NEW.autorizacion_numero := '000000';
    RETURN NEW;
  END IF;

  -- 3) Tipos
  IF NEW.tipo = 'consumo' THEN
    -- Saldo suficiente
    IF NEW.monto > v_tar.monto_disponible THEN
      NEW.status := 'DENEGADO';
      NEW.detalle_denegacion := 'Saldo insuficiente';
      NEW.autorizacion_numero := '000000';
      RETURN NEW;
    END IF;

    -- Aprobada: descuento y número de autorización de 6 dígitos
    UPDATE emisor.tarjetas
       SET monto_disponible = monto_disponible - NEW.monto
     WHERE numero = v_tar.numero;

    NEW.status := 'APROBADO';

    -- Generación robusta de número de autorización (sin colisiones y distinto de 000000)
    LOOP
      v_code := lpad((floor(random()*1000000))::int::text, 6, '0');
      EXIT WHEN v_code <> '000000'
            AND NOT EXISTS (
              SELECT 1
                FROM emisor.transacciones
               WHERE status = 'APROBADO'
                 AND autorizacion_numero = v_code
            );
    END LOOP;
    NEW.autorizacion_numero := v_code;

    RETURN NEW;

  ELSIF NEW.tipo = 'pago' THEN
    -- Aprobada: sumar disponible, capeado al límite autorizado
    UPDATE emisor.tarjetas
       SET monto_disponible = LEAST(monto_autorizado, monto_disponible + NEW.monto)
     WHERE numero = v_tar.numero;

    NEW.status := 'APROBADO';
    -- Genera número de autorización único de 6 dígitos (también para pagos)
    LOOP
      v_code := lpad((floor(random()*1000000))::int::text, 6, '0');
      EXIT WHEN v_code <> '000000'
            AND NOT EXISTS (
              SELECT 1
                FROM emisor.transacciones
              WHERE status = 'APROBADO'
                AND autorizacion_numero = v_code
            );
    END LOOP;
    NEW.autorizacion_numero := v_code;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_transacciones_apply ON emisor.transacciones;
CREATE TRIGGER tg_transacciones_apply
BEFORE INSERT ON emisor.transacciones
FOR EACH ROW EXECUTE FUNCTION emisor.tg_transacciones_apply();
