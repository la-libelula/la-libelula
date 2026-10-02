-- =========================================================================
-- FASE C6.3B: PREPARACIÓN DEL CLAIM ATÓMICO (SQL LOCAL)
-- NO EJECUTAR EN PRODUCCIÓN TODAVÍA.
-- =========================================================================

-- 1. IDENTIFICACIÓN DEL CONSTRAINT ACTUAL
-- Si no sabemos el nombre exacto del CHECK constraint de la columna status,
-- el administrador puede ejecutar esta consulta READ-ONLY para encontrarlo:
/*
  SELECT conname
  FROM pg_constraint
  WHERE conrelid = 'alarm_log'::regclass 
    AND contype = 'c' 
    AND pg_get_constraintdef(oid) LIKE '%status%';
*/
-- Supongamos que se llama 'alarm_log_status_check':

-- ALTER TABLE alarm_log DROP CONSTRAINT IF EXISTS alarm_log_status_check;
-- ALTER TABLE alarm_log ADD CONSTRAINT alarm_log_status_check 
--   CHECK (status IN ('pending', 'failed', 'sent', 'obsolete', 'processing'));

-- 2. AÑADIR COLUMNAS DE PROPIEDAD
-- ALTER TABLE alarm_log ADD COLUMN claim_token UUID NULL;
-- ALTER TABLE alarm_log ADD COLUMN claimed_at TIMESTAMPTZ NULL;

-- 3. FUNCIÓN RPC PARA CLAIM ATÓMICO (GRUPO COMPLETO)
/*
CREATE OR REPLACE FUNCTION claim_alarm_group(
    p_ids UUID[],
    p_claim_token UUID
)
RETURNS SETOF alarm_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_found_count INT;
    v_eligible_count INT;
BEGIN
    -- Validar array no vacío
    IF array_length(p_ids, 1) IS NULL THEN
        RAISE EXCEPTION 'empty_array';
    END IF;

    -- Bloquear filas y contar (FOR UPDATE impide que otro worker las lea concurrentemente)
    SELECT COUNT(*) INTO v_found_count
    FROM alarm_log
    WHERE id = ANY(p_ids)
    FOR UPDATE;

    IF v_found_count <> array_length(p_ids, 1) THEN
        RAISE EXCEPTION 'partial_availability';
    END IF;

    -- Comprobar que TODAS son elegibles (pending o failed)
    SELECT COUNT(*) INTO v_eligible_count
    FROM alarm_log
    WHERE id = ANY(p_ids)
      AND status IN ('pending', 'failed');

    IF v_eligible_count <> array_length(p_ids, 1) THEN
        RAISE EXCEPTION 'invalid_status_in_group';
    END IF;

    -- Actualizar TODAS atómicamente
    RETURN QUERY
    UPDATE alarm_log
    SET status = 'processing',
        claim_token = p_claim_token,
        claimed_at = now()
    WHERE id = ANY(p_ids)
    RETURNING *;
END;
$$;
*/

-- 4. SEGURIDAD DE LA FUNCIÓN
/*
REVOKE EXECUTE ON FUNCTION claim_alarm_group(UUID[], UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION claim_alarm_group(UUID[], UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION claim_alarm_group(UUID[], UUID) FROM authenticated;

-- Solo el rol de servicio (backend) puede ejecutarla
GRANT EXECUTE ON FUNCTION claim_alarm_group(UUID[], UUID) TO service_role;
*/
