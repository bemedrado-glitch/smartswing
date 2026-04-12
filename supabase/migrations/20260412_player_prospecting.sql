-- Player prospecting fields: player_type, consent_status, federation data, club linkage
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS player_type TEXT
  CHECK (player_type IN ('club', 'academy', 'player', 'coach', 'federation'))
  DEFAULT 'club';

ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS consent_status TEXT
  CHECK (consent_status IN ('public_record', 'opt_in', 'pending_consent', 'opted_out'))
  DEFAULT 'public_record';

ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS data_source TEXT;  -- 'google_places', 'itf_ranking', 'usta_ranking', 'atp_ranking', 'wta_ranking', 'organic_signup', 'manual'
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS federation_id TEXT;          -- ITF/USTA/ATP/WTA player ID
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS ranking_tier TEXT;           -- 'top100', 'top500', 'top1000', 'national', 'regional', 'amateur'
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS ranking_position INT;        -- numeric ranking
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS nationality TEXT;
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS club_affiliation_id UUID;    -- FK to marketing_contacts (the club row)
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS club_affiliation_name TEXT;  -- denormalized for display
ALTER TABLE marketing_contacts ADD COLUMN IF NOT EXISTS federation_profile_url TEXT; -- link to public profile

-- UTM tracking on lead_captures (some already exist, add missing)
ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS utm_source TEXT;
ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS utm_medium TEXT;
ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS utm_campaign TEXT;
ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS utm_term TEXT;
ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS utm_content TEXT;
ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS page_url TEXT;
ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS referrer TEXT;
ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS landing_page TEXT;
ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS session_id TEXT;
ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS player_type TEXT;
ALTER TABLE lead_captures ADD COLUMN IF NOT EXISTS consent_status TEXT DEFAULT 'opt_in';

-- Indexes for federation prospecting
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_player_type ON marketing_contacts(player_type);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_ranking_tier ON marketing_contacts(ranking_tier);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_consent_status ON marketing_contacts(consent_status);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_data_source ON marketing_contacts(data_source);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_club_affiliation ON marketing_contacts(club_affiliation_id);
CREATE INDEX IF NOT EXISTS idx_marketing_contacts_nationality ON marketing_contacts(nationality);
CREATE INDEX IF NOT EXISTS idx_lead_captures_utm_source ON lead_captures(utm_source);
CREATE INDEX IF NOT EXISTS idx_lead_captures_session_id ON lead_captures(session_id);
