-- ============================================================
-- UCIL SYSTEM UPDATE 9 — DUPLICATE GAP CODE PROTECTION TRIGGER
-- ============================================================
-- Run AFTER: update8.sql
--
-- What this covers:
--  A. BEFORE INSERT trigger on public.gaps to automatically resolve duplicate gap codes
--     (prevents Edge Function crashes when multiple unmatched clauses are created in the same millisecond)
-- ============================================================


-- ── A. SAFE UNIQUE GAP CODE GENERATION TRIGGER ──────────────
CREATE OR REPLACE FUNCTION public.make_gap_code_unique()
RETURNS TRIGGER AS $$
DECLARE
  v_num INT := 1;
  v_code TEXT;
BEGIN
  v_code := NEW.gap_code;
  -- Append incrementing suffix if the generated gap code already exists
  WHILE EXISTS(SELECT 1 FROM public.gaps WHERE gap_code = v_code) LOOP
    v_code := NEW.gap_code || '-' || v_num;
    v_num := v_num + 1;
  END LOOP;
  NEW.gap_code := v_code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_make_gap_code_unique ON public.gaps;
CREATE TRIGGER trg_make_gap_code_unique
  BEFORE INSERT ON public.gaps
  FOR EACH ROW EXECUTE FUNCTION public.make_gap_code_unique();
