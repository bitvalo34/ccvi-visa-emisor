-- scripts/sql/003_add_eliminada.sql
-- Agrega valor 'eliminada' al enum emisor.card_estado para soportar soft delete de tarjetas.
-- Idempotente: IF NOT EXISTS evita error si ya fue agregado.
DO $$
BEGIN
  IF NOT EXISTS (
     SELECT 1 FROM pg_type t
     JOIN pg_enum e ON t.oid = e.enumtypid
     WHERE t.typname = 'card_estado' AND e.enumlabel = 'eliminada'
  ) THEN
    ALTER TYPE emisor.card_estado ADD VALUE 'eliminada';
  END IF;
END $$;

-- Nota: transacciones sobre tarjetas con estado <> 'activa' ya se deniegan en tg_transacciones_apply.
