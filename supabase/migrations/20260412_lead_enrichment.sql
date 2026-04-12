-- Lead enrichment fields for prospecting pipeline
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS state_region TEXT;
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS rating NUMERIC(2,1);
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS review_count INT;
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS enrichment_source TEXT;   -- 'google_places', 'manual', 'usta', 'itf', 'federation'
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS enrichment_batch TEXT;    -- batch ID for tracking import runs

ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS country_code TEXT;
ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS enrichment_source TEXT;
ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS enrichment_batch TEXT;

CREATE INDEX IF NOT EXISTS idx_marketing_contacts_country ON marketing_contacts(country);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_city ON marketing_contacts(city);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_enrichment ON marketing_contacts(enrichment_source);
CREATE INDEX IF NOT EXISTS idx_lead_captures_country ON lead_captures(country);
