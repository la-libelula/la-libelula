BEGIN;

-- =========================================================================
-- FUNCTION: complete_alarm_group_success
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
-- FUNCTION: complete_alarm_group_failure
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
    
    IF p_error_message IS NULL OR p_error_message = '' THEN
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
-- PERMISSIONS
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
