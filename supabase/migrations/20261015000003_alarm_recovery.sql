-- =========================================================================
-- FASE C6.5C.5A: RECOVERY QUIRÚRGICO DE INCIDENTE CLAIM_FAILED
-- NO EJECUTAR EN PRODUCCIÓN TODAVÍA.
-- =========================================================================

BEGIN;

CREATE FUNCTION public.recover_alarm_claim_incident(
    p_log_id UUID,
    p_expected_claim_token UUID
)
RETURNS TABLE (recovered_count integer)
LANGUAGE plpgsql
SECURITY INVOKER
AS $func$
DECLARE
    v_updated_count integer;
BEGIN
    IF p_log_id IS NULL OR p_expected_claim_token IS NULL THEN
        RAISE EXCEPTION 'invalid_parameters';
    END IF;

    UPDATE public.alarm_log
    SET status = 'pending',
        claim_token = NULL,
        claimed_at = NULL
    WHERE id = p_log_id
      AND status = 'processing'
      AND claim_token = p_expected_claim_token
      AND retry_count = 0
      AND last_attempt_at IS NULL
      AND sent_at IS NULL;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    
    RETURN QUERY SELECT v_updated_count;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.recover_alarm_claim_incident(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recover_alarm_claim_incident(UUID, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recover_alarm_claim_incident(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.recover_alarm_claim_incident(UUID, UUID) TO service_role;

COMMIT;
