ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS hubspot_contact_id TEXT,
  ADD COLUMN IF NOT EXISTS hubspot_deal_id TEXT,
  ADD COLUMN IF NOT EXISTS hubspot_sync_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS hubspot_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS hubspot_last_synced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS leads_hubspot_sync_status_idx
  ON leads (hubspot_sync_status);

