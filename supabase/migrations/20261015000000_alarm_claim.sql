-- =========================================================================
-- FASE C6.3C: MIGRACIÓN DEFINITIVA DEL CLAIM ATÓMICO (SQL LOCAL)
-- NO EJECUTAR EN PRODUCCIÓN TODAVÍA.
-- =========================================================================

BEGIN;

-- 1. PRECHECK FAIL-CLOSED (Asegurar que el constraint original es el esperado)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_log_status' AND conrelid = 'public.alarm_log'::regclass
    ) THEN
        RAISE EXCEPTION 'Constraint chk_log_status no existe. Abortando migración para evitar roturas.';
    END IF;
END $$;

-- 2. AÑADIR COLUMNAS
ALTER TABLE public.alarm_log ADD COLUMN claim_token UUID NULL;
ALTER TABLE public.alarm_log ADD COLUMN claimed_at TIMESTAMPTZ NULL;

-- 3. REEMPLAZAR CONSTRAINT DE ESTADO
ALTER TABLE public.alarm_log DROP CONSTRAINT chk_log_status;
ALTER TABLE public.alarm_log ADD CONSTRAINT chk_log_status 
  CHECK (status IN ('pending', 'sent', 'failed', 'obsolete', 'processing'));

-- 4. AÑADIR COHERENCIA DE PROCESSING
ALTER TABLE public.alarm_log ADD CONSTRAINT chk_log_processing_coherence
CHECK (
  (
    status = 'processing'
    AND claim_token IS NOT NULL
    AND claimed_at IS NOT NULL
  )
  OR
  (
    status <> 'processing'
    AND claim_token IS NULL
    AND claimed_at IS NULL
  )
);

-- 5. FUNCIÓN RPC DE CLAIM
CREATE OR REPLACE FUNCTION public.claim_alarm_group(
    p_ids UUID[],
    p_claim_token UUID
)
RETURNS TABLE (claimed_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
AS $func$
DECLARE
    v_expected_count integer;
    v_locked_count integer;
    v_eligible_count integer;
    v_updated_count integer;
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

    -- Validar IDs duplicados
    IF (SELECT count(DISTINCT unnest) FROM unnest(p_ids)) <> v_expected_count THEN
        RAISE EXCEPTION 'duplicate_ids';
    END IF;

    -- Bloquear y comprobar
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

    IF v_locked_count <> v_expected_count THEN
        RAISE EXCEPTION 'partial_availability';
    END IF;

    IF v_eligible_count <> v_expected_count THEN
        RAISE EXCEPTION 'invalid_status_in_group';
    END IF;

    -- Actualizar atómicamente
    UPDATE public.alarm_log
    SET status = 'processing',
        claim_token = p_claim_token,
        claimed_at = now()
    WHERE id = ANY(p_ids);

    -- Comprobación ultra-defensiva del ROW_COUNT
    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> v_expected_count THEN
        RAISE EXCEPTION 'update_row_count_mismatch';
    END IF;

    RETURN QUERY SELECT v_expected_count;
END;
$func$;

-- 6. PERMISOS
REVOKE EXECUTE ON FUNCTION public.claim_alarm_group(UUID[], UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_alarm_group(UUID[], UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_alarm_group(UUID[], UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_alarm_group(UUID[], UUID) TO service_role;

COMMIT;


-- =========================================================================
-- POSTCHECKS READ-ONLY (Ejecutar manualmente DESPUÉS de la migración)
-- =========================================================================
/*
-- A. Columnas
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'alarm_log';

-- B. Constraints
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'public.alarm_log'::regclass;

-- C. Función
SELECT proname, proargnames, prosrc 
FROM pg_proc 
WHERE proname = 'claim_alarm_group';

-- D. Privilegios
SELECT grantee, privilege_type 
FROM information_schema.routine_privileges 
WHERE routine_name = 'claim_alarm_group';
*/


-- =========================================================================
-- ROLLBACK CONCEPTUAL
-- (Ejecutar solo si la migración falla parcialmente o se desea revertir)
-- =========================================================================
/*
BEGIN;

-- 1. Precheck para abortar si hay processing varados
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.alarm_log WHERE status = 'processing') THEN
        RAISE EXCEPTION 'Cannot rollback: rows exist in processing state';
    END IF;
END $$;

-- 2. Eliminar Función
DROP FUNCTION IF EXISTS public.claim_alarm_group(UUID[], UUID);

-- 3. Restaurar Constraints
ALTER TABLE public.alarm_log DROP CONSTRAINT IF EXISTS chk_log_processing_coherence;
ALTER TABLE public.alarm_log DROP CONSTRAINT IF EXISTS chk_log_status;
ALTER TABLE public.alarm_log ADD CONSTRAINT chk_log_status 
  CHECK (status IN ('pending', 'sent', 'failed', 'obsolete'));

-- 4. Eliminar Columnas
ALTER TABLE public.alarm_log DROP COLUMN IF EXISTS claim_token;
ALTER TABLE public.alarm_log DROP COLUMN IF EXISTS claimed_at;

COMMIT;
*/
