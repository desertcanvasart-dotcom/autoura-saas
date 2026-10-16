-- ============================================
-- 427: rate limits that survive a restart and are shared across servers
-- ============================================
-- lib/rate-limit.ts counts in each server's memory: every deploy resets the
-- counts, and with more than one replica each keeps its own. For the limits
-- where that matters — a company's hourly AI ceiling (cost) and invitation
-- sending (abuse) — the count lives here instead (lib/rate-limit-shared.ts).
-- Server-only: the service role calls rate_limit_take(); no one else can.

BEGIN;

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  count INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_buckets FROM anon, authenticated;

-- One atomic step: start a new window if the old one has passed, else count
-- one more. Returns whether this request is within the limit.
CREATE OR REPLACE FUNCTION public.rate_limit_take(p_key TEXT, p_limit INTEGER, p_window_seconds INTEGER)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_start TIMESTAMPTZ;
BEGIN
  INSERT INTO rate_limit_buckets AS b (key, window_start, count)
  VALUES (p_key, NOW(), 1)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE WHEN b.window_start + make_interval(secs => p_window_seconds) <= NOW() THEN 1 ELSE b.count + 1 END,
        window_start = CASE WHEN b.window_start + make_interval(secs => p_window_seconds) <= NOW() THEN NOW() ELSE b.window_start END
  RETURNING b.count, b.window_start INTO v_count, v_start;

  -- Now and then, drop buckets nobody has used for a day.
  IF random() < 0.01 THEN
    DELETE FROM rate_limit_buckets WHERE window_start < NOW() - INTERVAL '1 day';
  END IF;

  RETURN QUERY SELECT v_count <= p_limit, GREATEST(p_limit - v_count, 0), v_start + make_interval(secs => p_window_seconds);
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_take(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;

COMMIT;
