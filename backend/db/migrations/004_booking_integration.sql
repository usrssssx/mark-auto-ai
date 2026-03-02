ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS booking_provider TEXT,
  ADD COLUMN IF NOT EXISTS booking_link TEXT,
  ADD COLUMN IF NOT EXISTS booking_status TEXT NOT NULL DEFAULT 'not_invited',
  ADD COLUMN IF NOT EXISTS booking_invited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meeting_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS meeting_end_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booking_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS leads_booking_status_idx
  ON leads (booking_status);

