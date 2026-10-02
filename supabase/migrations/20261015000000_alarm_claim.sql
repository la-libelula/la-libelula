-- =========================================================================
-- FASE C6.3C: MIGRACIÓN DEFINITIVA DEL CLAIM ATÓMICO (SQL LOCAL)
-- NO EJECUTAR EN PRODUCCIÓN TODAVÍA.
-- =========================================================================

BEGIN;

-- 1. PRECHECKS FAIL-CLOSED
DO $$
DECLARE
    v_constraint_def text;
BEGIN
    -- 1.1 Comprobar existencia y definición exacta de chk_log_status
    SELECT pg_get_constraintdef(oid) INTO v_constraint_def
    FROM pg_constraint 
    WHERE conname = 'chk_log_status' AND conrelid = 'public.alarm_log'::regclass;

    IF v_constraint_def IS NULL THEN
        RAISE EXCEPTION 'Constraint chk_log_status no existe. Abortando migración para evitar roturas.';
    END IF;

    -- Validar que la definición actual sea la equivalente a la original comprobada (sin processing)
    -- Se comprueba que incluya los estados originales y NO processing, para soportar variaciones menores de espaciado o casting (::text).
    IF v_constraint_def NOT LIKE '%pending%' OR 
       v_constraint_def NOT LIKE '%sent%' OR 
       v_constraint_def NOT LIKE '%failed%' OR 
       v_constraint_def NOT LIKE '%obsolete%' OR
       v_constraint_def LIKE '%processing%' THEN
        RAISE EXCEPTION 'Constraint chk_log_status tiene una definición inesperada: %. Abortando.', v_constraint_def;
    END IF;

    -- 1.2 Comprobar que NO existen columnas claim_token o claimed_at
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'alarm_log' 
          AND column_name IN ('claim_token', 'claimed_at')
    ) THEN
        RAISE EXCEPTION 'Columnas claim_token o claimed_at ya existen. Abortando posible ejecución repetida o conflictiva.';
    END IF;

    -- 1.3 Comprobar que NO existe la función claim_alarm_group
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'claim_alarm_group'
    ) THEN
        RAISE EXCEPTION 'Función claim_alarm_group ya existe. Abortando posible ejecución repetida.';
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
CREATE FUNCTION public.claim_alarm_group(
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
