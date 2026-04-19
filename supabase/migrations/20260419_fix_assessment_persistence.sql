-- Fix: assessments cloud sync silently fails for every analysis.
-- Migration: 20260419_fix_assessment_persistence.sql
--
-- ROOT CAUSE 1:
-- idx_assessments_external_id was a PARTIAL unique index:
--   CREATE UNIQUE INDEX ... ON assessments(external_id) WHERE external_id IS NOT NULL
-- PostgreSQL refuses partial indexes for ON CONFLICT (...). Browser code in
-- app-data.js syncAssessmentToCloud uses .upsert({...}, {onConflict:'external_id'})
-- which returned silently:
--   42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
-- Result: 0 rows in assessments table since launch despite videos uploading.
--
-- FIX 1: replace the partial unique index with a true UNIQUE CONSTRAINT.
-- (Allows multiple NULLs by default — preserves the original intent of the
--  WHERE clause for rows where external_id is unset.)
--
-- ROOT CAUSE 2:
-- analysis-reports bucket allowed_mime_types was ['application/pdf','application/json','text/plain'].
-- app-data.js uploads HTML reports as Blob with type='text/html'. Bucket silently rejected.
-- Result: 0 files in analysis-reports bucket.
--
-- FIX 2: add 'text/html' to allowed_mime_types.
--
-- Applied to production 2026-04-19 via Supabase MCP. Browser upsert verified
-- post-fix: error changed from 42P10 to 42501 (expected RLS rejection for anon),
-- proving the ON CONFLICT now finds the constraint and would succeed for an
-- authenticated user.

DROP INDEX IF EXISTS idx_assessments_external_id;

ALTER TABLE assessments
  ADD CONSTRAINT assessments_external_id_unique UNIQUE (external_id);

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['application/pdf','application/json','text/plain','text/html']
 WHERE id = 'analysis-reports';
