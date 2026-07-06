-- ============================================================
-- UCIL SYSTEM UPDATE 7 — STORAGE INITIALIZATION & GAP BUG FIX
-- ============================================================
-- Run AFTER: update6.sql
--
-- What this covers:
--  A. Initialize the private 'evidence-files' storage bucket
--  B. Re-create storage RLS policies with drop protection
--  C. Alter public.gaps.clause_ref to allow default value (bypasses Edge Function issue)
-- ============================================================


-- ── A. INITIALIZE STORAGE BUCKET ─────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence-files', 
  'evidence-files', 
  false, 
  52428800, -- 50MB file size limit
  ARRAY[
    'application/pdf', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 
    'text/plain'
  ]
)
ON CONFLICT (id) DO NOTHING;


-- ── B. RE-CREATE STORAGE POLICIES ────────────────────────────
DROP POLICY IF EXISTS "Allow authenticated upload to evidence-files" ON storage.objects;
CREATE POLICY "Allow authenticated upload to evidence-files" 
ON storage.objects 
FOR INSERT 
TO authenticated 
WITH CHECK (bucket_id = 'evidence-files');

DROP POLICY IF EXISTS "Allow authenticated read from evidence-files" ON storage.objects;
CREATE POLICY "Allow authenticated read from evidence-files" 
ON storage.objects 
FOR SELECT 
TO authenticated 
USING (bucket_id = 'evidence-files');


-- ── C. BYPASS EDGE FUNCTION GAPS BUG ─────────────────────────
ALTER TABLE public.gaps ALTER COLUMN clause_ref SET DEFAULT '—';
