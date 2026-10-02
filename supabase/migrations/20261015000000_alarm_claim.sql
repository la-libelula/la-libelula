-- =========================================================================
-- FASE C6.3B.1: HARDENING DEL SQL DE CLAIM ATÓMICO (SQL LOCAL)
-- NO EJECUTAR EN PRODUCCIÓN TODAVÍA.
-- =========================================================================

-- 1. IDENTIFICACIÓN DEL CONSTRAINT ACTUAL
/*
  SELECT conname
  FROM pg_constraint
  WHERE conrelid = 'public.alarm_log'::regclass 
    AND contype = 'c' 
    AND pg_get_constraintdef(oid) LIKE '%status%';
*/

-- ALTER TABLE public.alarm_log DROP CONSTRAINT IF EXISTS alarm_log_status_check;
-- ALTER TABLE public.alarm_log ADD CONSTRAINT alarm_log_status_check 
--   CHECK (status IN ('pending', 'failed', 'sent', 'obsolete', 'processing'));

-- 2. AÑADIR COLUMNAS DE PROPIEDAD
-- ALTER TABLE public.alarm_log ADD COLUMN claim_token UUID NULL;
-- ALTER TABLE public.alarm_log ADD COLUMN claimed_at TIMESTAMPTZ NULL;

-- 3. FUNCIÓN RPC PARA CLAIM ATÓMICO (GRUPO COMPLETO)
/*
CREATE OR REPLACE FUNCTION public.claim_alarm_group(
    p_ids UUID[],
    p_claim_token UUID
)
RETURNS TABLE (claimed_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_expected_count integer;
    v_locked_count integer;
    v_eligible_count integer;
BEGIN
    -- Validar Token
    IF p_claim_token IS NULL THEN
        RAISE EXCEPTION 'null_token';
    END IF;

    -- Validar array no vacío
    v_expected_count := array_length(p_ids, 1);
    IF v_expected_count IS NULL OR v_expected_count = 0 THEN
        RAISE EXCEPTION 'empty_array';
    END IF;

    -- Validar IDs duplicados (compara longitud vs elementos únicos)
    IF (SELECT count(DISTINCT unnest) FROM unnest(p_ids)) <> v_expected_count THEN
        RAISE EXCEPTION 'duplicate_ids';
    END IF;

    -- Bloquear filas específicas y comprobar validez
    WITH locked_rows AS (
        SELECT id, status
        FROM public.alarm_log
        WHERE id = ANY(p_ids)
        FOR UPDATE
    )
    SELECT 
        count(*), 
        count(*) FILTER (WHERE status IN ('pending', 'failed'))
    INTO v_locked_count, v_eligible_count
    FROM locked_rows;

    -- Comprobar si todas las filas existían
    IF v_locked_count <> v_expected_count THEN
        RAISE EXCEPTION 'partial_availability';
    END IF;

    -- Comprobar si todas eran elegibles
    IF v_eligible_count <> v_expected_count THEN
        RAISE EXCEPTION 'invalid_status_in_group';
    END IF;

    -- Actualizar TODAS atómicamente
    UPDATE public.alarm_log
    SET status = 'processing',
        claim_token = p_claim_token,
        claimed_at = now()
    WHERE id = ANY(p_ids);

    -- Devolver solo el count
    RETURN QUERY SELECT v_expected_count;
END;
$$;
*/

-- 4. SEGURIDAD DE LA FUNCIÓN
/*
REVOKE EXECUTE ON FUNCTION public.claim_alarm_group(UUID[], UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_alarm_group(UUID[], UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_alarm_group(UUID[], UUID) FROM authenticated;

-- Solo el rol de servicio (backend) puede ejecutarla
GRANT EXECUTE ON FUNCTION public.claim_alarm_group(UUID[], UUID) TO service_role;
*/
