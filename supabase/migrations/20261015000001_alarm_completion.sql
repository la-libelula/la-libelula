BEGIN;

-- =========================================================================
-- 1. PRECHECKS OBLIGATORIOS
-- =========================================================================
DO $$
DECLARE
    v_constraint_def text;
BEGIN
    -- A, B, C, D: Existencia de columnas y tipos exactos
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alarm_log' AND column_name='id') THEN RAISE EXCEPTION 'Columna id no existe'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alarm_log' AND column_name='status') THEN RAISE EXCEPTION 'Columna status no existe'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alarm_log' AND column_name='retry_count') THEN RAISE EXCEPTION 'Columna retry_count no existe'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alarm_log' AND column_name='last_attempt_at') THEN RAISE EXCEPTION 'Columna last_attempt_at no existe'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alarm_log' AND column_name='sent_at') THEN RAISE EXCEPTION 'Columna sent_at no existe'; END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alarm_log' AND column_name='claim_token' AND data_type='uuid') THEN RAISE EXCEPTION 'Columna claim_token no existe o no es UUID'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alarm_log' AND column_name='claimed_at' AND data_type='timestamp with time zone') THEN RAISE EXCEPTION 'Columna claimed_at no existe o no es TIMESTAMPTZ'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alarm_log' AND column_name='error_message' AND data_type='character varying') THEN RAISE EXCEPTION 'Columna error_message no existe o no es VARCHAR'; END IF;

    -- E: chk_log_status admite processing
    SELECT pg_get_constraintdef(oid) INTO v_constraint_def
    FROM pg_constraint 
    WHERE conname = 'chk_log_status' AND conrelid = 'public.alarm_log'::regclass;

    IF v_constraint_def IS NULL OR v_constraint_def NOT LIKE '%processing%' THEN
        RAISE EXCEPTION 'Constraint chk_log_status no existe o no admite processing. Def: %', v_constraint_def;
    END IF;

    -- F: chk_log_processing_coherence existe
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_log_processing_coherence' AND conrelid = 'public.alarm_log'::regclass) THEN
        RAISE EXCEPTION 'Constraint chk_log_processing_coherence no existe';
    END IF;

    -- G: public.claim_alarm_group(UUID[],UUID) existe
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'claim_alarm_group'
    ) THEN
        RAISE EXCEPTION 'Funcin claim_alarm_group no existe. Falta paso previo.';
    END IF;

    -- H: Funciones no existen previamente
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname IN ('complete_alarm_group_success', 'complete_alarm_group_failure')
    ) THEN
        RAISE EXCEPTION 'Las funciones complete_alarm_group_... YA existen. Abortando sobreescritura silenciosa.';
    END IF;
END $$;

-- =========================================================================
-- 2. RPC SUCCESS
-- =========================================================================
CREATE OR REPLACE FUNCTION public.complete_alarm_group_success(
    p_ids UUID[],
    p_claim_token UUID
)
RETURNS TABLE (updated_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
AS $func$
DECLARE
    v_expected_count integer;
    v_locked_count integer;
    v_eligible_count integer;
    v_updated_count integer;
BEGIN
    IF p_claim_token IS NULL THEN
        RAISE EXCEPTION 'null_token';
    END IF;

    v_expected_count := array_length(p_ids, 1);
    IF v_expected_count IS NULL OR v_expected_count = 0 THEN
        RAISE EXCEPTION 'empty_array';
    END IF;

    IF (SELECT count(DISTINCT unnest) FROM unnest(p_ids)) <> v_expected_count THEN
        RAISE EXCEPTION 'duplicate_ids';
    END IF;

    WITH locked_rows AS (
        SELECT id, status, claim_token
        FROM public.alarm_log
        WHERE id = ANY(p_ids)
        FOR UPDATE
    )
    SELECT 
        count(*), 
        count(*) FILTER (WHERE status = 'processing' AND claim_token = p_claim_token)
    INTO v_locked_count, v_eligible_count
    FROM locked_rows;

    IF v_locked_count <> v_expected_count THEN
        RAISE EXCEPTION 'missing_ids';
    END IF;

    IF v_eligible_count <> v_expected_count THEN
        RAISE EXCEPTION 'invalid_status_or_token';
    END IF;

    UPDATE public.alarm_log
    SET status = 'sent',
        sent_at = now(),
        last_attempt_at = now(),
        retry_count = COALESCE(retry_count, 0) + 1,
        error_message = NULL,
        claim_token = NULL,
        claimed_at = NULL
    WHERE id = ANY(p_ids);

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> v_expected_count THEN
        RAISE EXCEPTION 'update_row_count_mismatch';
    END IF;

    RETURN QUERY SELECT v_expected_count;
END;
$func$;

-- =========================================================================
-- 3. RPC FAILURE
-- =========================================================================
CREATE OR REPLACE FUNCTION public.complete_alarm_group_failure(
    p_ids UUID[],
    p_claim_token UUID,
    p_error_message TEXT
)
RETURNS TABLE (updated_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
AS $func$
DECLARE
    v_expected_count integer;
    v_locked_count integer;
    v_eligible_count integer;
    v_updated_count integer;
    v_safe_error_message VARCHAR(450);
BEGIN
    IF p_claim_token IS NULL THEN
        RAISE EXCEPTION 'null_token';
    END IF;

    v_expected_count := array_length(p_ids, 1);
    IF v_expected_count IS NULL OR v_expected_count = 0 THEN
        RAISE EXCEPTION 'empty_array';
    END IF;

    IF (SELECT count(DISTINCT unnest) FROM unnest(p_ids)) <> v_expected_count THEN
        RAISE EXCEPTION 'duplicate_ids';
    END IF;
    
    IF p_error_message IS NULL OR btrim(p_error_message) = '' THEN
        v_safe_error_message := 'Unknown error during completion';
    ELSE
        v_safe_error_message := LEFT(p_error_message, 450);
    END IF;

    WITH locked_rows AS (
        SELECT id, status, claim_token
        FROM public.alarm_log
        WHERE id = ANY(p_ids)
        FOR UPDATE
    )
    SELECT 
        count(*), 
        count(*) FILTER (WHERE status = 'processing' AND claim_token = p_claim_token)
    INTO v_locked_count, v_eligible_count
    FROM locked_rows;

    IF v_locked_count <> v_expected_count THEN
        RAISE EXCEPTION 'missing_ids';
    END IF;

    IF v_eligible_count <> v_expected_count THEN
        RAISE EXCEPTION 'invalid_status_or_token';
    END IF;

    UPDATE public.alarm_log
    SET status = 'failed',
        sent_at = NULL,
        last_attempt_at = now(),
        retry_count = COALESCE(retry_count, 0) + 1,
        error_message = v_safe_error_message,
        claim_token = NULL,
        claimed_at = NULL
    WHERE id = ANY(p_ids);

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count <> v_expected_count THEN
        RAISE EXCEPTION 'update_row_count_mismatch';
    END IF;

    RETURN QUERY SELECT v_expected_count;
END;
$func$;

-- =========================================================================
-- 4. PERMISOS
-- =========================================================================
REVOKE EXECUTE ON FUNCTION public.complete_alarm_group_success(UUID[], UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_alarm_group_success(UUID[], UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_alarm_group_success(UUID[], UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_alarm_group_success(UUID[], UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.complete_alarm_group_failure(UUID[], UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_alarm_group_failure(UUID[], UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_alarm_group_failure(UUID[], UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_alarm_group_failure(UUID[], UUID, TEXT) TO service_role;

COMMIT;


-- =========================================================================
-- POSTCHECKS READ-ONLY (Ejecutar MANUALMENTE como query separada)
-- =========================================================================
/*
-- 1. Verificar metadatos y seguridad de las dos funciones:
SELECT 
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as returns,
    p.prosecdef as is_security_definer,
    a.rolname as owner,
    p.proacl as privileges
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
LEFT JOIN pg_authid a ON p.proowner = a.oid
WHERE n.nspname = 'public' 
  AND p.proname IN ('complete_alarm_group_success', 'complete_alarm_group_failure');

-- 2. Verificar que public, anon y authenticated NO pueden ejecutar, pero service_role s:
SELECT 
    routine_name,
    grantee,
    privilege_type 
FROM information_schema.routine_privileges 
WHERE routine_name IN ('complete_alarm_group_success', 'complete_alarm_group_failure')
  AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
ORDER BY routine_name, grantee;

-- 3. Verificar recuento global de estados:
SELECT status, count(*) 
FROM public.alarm_log 
GROUP BY status;

-- 4. Verificar total absoluto de alarmas y procesamiento activo (debera ser 0):
SELECT 
    count(*) as total_alarmas,
    count(*) FILTER (WHERE status = 'processing') as total_processing
FROM public.alarm_log;
*/
