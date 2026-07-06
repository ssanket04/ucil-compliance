-- ============================================================
-- UCIL SYSTEM UPDATE 11 — DYNAMIC ROUTING & DISCOVERED QUEUE
-- ============================================================
-- Run AFTER: update10.sql
--
-- What this covers:
--  A. Add default owner and domain head tracking columns to the public.domains table
--  B. Create the public.discovered_circulars table to act as a staging queue for scraped circulars
--  C. Create a database trigger to automatically cascade domain head assignments to controls
-- ============================================================


-- ── A. UPDATE DOMAINS COLUMN REGISTRATION ────────────────────
ALTER TABLE public.domains
  ADD COLUMN IF NOT EXISTS default_owner_id UUID REFERENCES public.users(id),
  ADD COLUMN IF NOT EXISTS domain_head_id UUID REFERENCES public.users(id);


-- ── B. CREATE DISCOVERED CIRCULARS STAGING QUEUE ──────────────
CREATE TABLE IF NOT EXISTS public.discovered_circulars (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  circular_id  TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  issuer       TEXT NOT NULL,
  source_url   TEXT,
  scraped_at   TIMESTAMPTZ DEFAULT NOW(),
  status       TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Ingested', 'Dismissed')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);


-- ── C. CREATE CASCADE DOMAIN OWNERSHIP TRIGGER ────────────────
CREATE OR REPLACE FUNCTION public.cascade_domain_ownership()
RETURNS TRIGGER AS $$
BEGIN
  -- If a domain head changes, automatically update the domain_head_id of all controls in that domain
  IF NEW.domain_head_id IS DISTINCT FROM OLD.domain_head_id THEN
    UPDATE public.controls 
    SET domain_head_id = NEW.domain_head_id 
    WHERE domain_id = NEW.id;
  END IF;
  
  -- If a default owner changes, optionally update controls that are currently unassigned
  IF NEW.default_owner_id IS DISTINCT FROM OLD.default_owner_id THEN
    UPDATE public.controls 
    SET owner_id = NEW.default_owner_id 
    WHERE domain_id = NEW.id AND owner_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cascade_domain_ownership ON public.domains;
CREATE TRIGGER trg_cascade_domain_ownership
  AFTER UPDATE ON public.domains
  FOR EACH ROW EXECUTE FUNCTION public.cascade_domain_ownership();
