BEGIN;

-- =========================================================================
-- 1. PRECHECKS OBLIGATORIOS
-- =========================================================================
DO $$
DECLARE
    v_constraint_def text;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alarm_log' AND column_name='id' AND data_type='uuid') THEN RAISE EXCEPTION 'Columna id no existe o no es UUID'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alarm_log' AND column_name='status' AND data_type='text') THEN RAISE EXCEPTION 'Columna status no existe o no es text'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alarm_log' AND column_name='retry_count' AND data_type='integer') THEN RAISE EXCEPTION 'Columna retry_count no existe o no es integer'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alarm_log' AND column_name='last_attempt_at' AND data_type='timestamp with time zone') THEN RAISE EXCEPTION 'Columna last_attempt_at no existe o no es TIMESTAMPTZ'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alarm_log' AND column_name='sent_at' AND data_type='timestamp with time zone') THEN RAISE EXCEPTION 'Columna sent_at no existe o no es TIMESTAMPTZ'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alarm_log' AND column_name='claim_token' AND data_type='uuid') THEN RAISE EXCEPTION 'Columna claim_token no existe o no es UUID'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alarm_log' AND column_name='claimed_at' AND data_type='timestamp with time zone') THEN RAISE EXCEPTION 'Columna claimed_at no existe o no es TIMESTAMPTZ'; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='alarm_log' AND column_name='error_message' AND data_type='character varying') THEN RAISE EXCEPTION 'Columna error_message no existe o no es VARCHAR'; END IF;

    SELECT pg_get_constraintdef(oid) INTO v_constraint_def
    FROM pg_constraint 
    WHERE conname = 'chk_log_status' AND conrelid = 'public.alarm_log'::regclass;

    IF v_constraint_def IS NULL OR v_constraint_def NOT LIKE '%processing%' THEN
        RAISE EXCEPTION 'Constraint chk_log_status no existe o no admite processing.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_log_processing_coherence' AND conrelid = 'public.alarm_log'::regclass) THEN
        RAISE EXCEPTION 'Constraint chk_log_processing_coherence no existe';
    END IF;

    IF to_regprocedure('public.claim_alarm_group(uuid[],uuid)') IS NULL THEN
        RAISE EXCEPTION 'Falta public.claim_alarm_group(uuid[],uuid)';
    END IF;

    IF to_regprocedure('public.complete_alarm_group_success(uuid[],uuid)') IS NULL THEN
        RAISE EXCEPTION 'Falta public.complete_alarm_group_success(uuid[],uuid). No se puede endurecer si no existe.';
    END IF;

    IF to_regprocedure('public.complete_alarm_group_failure(uuid[],uuid,text)') IS NULL THEN
        RAISE EXCEPTION 'Falta public.complete_alarm_group_failure(uuid[],uuid,text). No se puede endurecer si no existe.';
    END IF;
END $$;

-- =========================================================================
-- 2. RPC SUCCESS (HARDENED)
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
    v_requested_found_count integer;
    v_eligible_count integer;
    v_updated_count integer;
    v_token_locked_count integer;
BEGIN
    IF p_claim_token IS NULL THEN RAISE EXCEPTION 'null_token'; END IF;

    v_expected_count := array_length(p_ids, 1);
    IF v_expected_count IS NULL OR v_expected_count = 0 THEN RAISE EXCEPTION 'empty_array'; END IF;

    IF (SELECT count(DISTINCT unnest) FROM unnest(p_ids)) <> v_expected_count THEN
        RAISE EXCEPTION 'duplicate_ids';
    END IF;

    WITH locked_rows AS (
        SELECT id, status, claim_token
        FROM public.alarm_log
        WHERE id = ANY(p_ids)
           OR (status = 'processing' AND claim_token = p_claim_token)
        FOR UPDATE
    )
    SELECT 
        count(*) FILTER (WHERE id = ANY(p_ids)),
        count(*) FILTER (WHERE status = 'processing' AND claim_token = p_claim_token AND id = ANY(p_ids)),
        count(*) FILTER (WHERE status = 'processing' AND claim_token = p_claim_token)
    INTO v_requested_found_count, v_eligible_count, v_token_locked_count
    FROM locked_rows;

    IF v_requested_found_count <> v_expected_count THEN RAISE EXCEPTION 'missing_ids'; END IF;
    IF v_eligible_count <> v_expected_count THEN RAISE EXCEPTION 'invalid_status_or_token'; END IF;
    IF v_token_locked_count <> v_expected_count THEN RAISE EXCEPTION 'incomplete_claim_group'; END IF;

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
    IF v_updated_count <> v_expected_count THEN RAISE EXCEPTION 'update_row_count_mismatch'; END IF;

    RETURN QUERY SELECT v_expected_count;
END;
$func$;

-- =========================================================================
-- 3. RPC FAILURE (HARDENED)
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
    v_requested_found_count integer;
    v_eligible_count integer;
    v_updated_count integer;
    v_token_locked_count integer;
    v_safe_error_message VARCHAR(450);
BEGIN
    IF p_claim_token IS NULL THEN RAISE EXCEPTION 'null_token'; END IF;

    v_expected_count := array_length(p_ids, 1);
    IF v_expected_count IS NULL OR v_expected_count = 0 THEN RAISE EXCEPTION 'empty_array'; END IF;

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
           OR (status = 'processing' AND claim_token = p_claim_token)
        FOR UPDATE
    )
    SELECT 
        count(*) FILTER (WHERE id = ANY(p_ids)),
        count(*) FILTER (WHERE status = 'processing' AND claim_token = p_claim_token AND id = ANY(p_ids)),
        count(*) FILTER (WHERE status = 'processing' AND claim_token = p_claim_token)
    INTO v_requested_found_count, v_eligible_count, v_token_locked_count
    FROM locked_rows;

    IF v_requested_found_count <> v_expected_count THEN RAISE EXCEPTION 'missing_ids'; END IF;
    IF v_eligible_count <> v_expected_count THEN RAISE EXCEPTION 'invalid_status_or_token'; END IF;
    IF v_token_locked_count <> v_expected_count THEN RAISE EXCEPTION 'incomplete_claim_group'; END IF;

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
    IF v_updated_count <> v_expected_count THEN RAISE EXCEPTION 'update_row_count_mismatch'; END IF;

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
