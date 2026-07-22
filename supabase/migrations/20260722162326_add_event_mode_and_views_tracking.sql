/*
# Add event_mode (online/offline) and event_views tracking table

## Modified Tables
### events
- Added `event_mode` (text, NOT NULL, default 'offline') — 'online' | 'offline'

## New Tables
### event_views
Tracks each time a user views an event detail page.
- event_id, viewer_id (nullable for anon), viewed_at
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'event_mode') THEN
    ALTER TABLE events ADD COLUMN event_mode text NOT NULL DEFAULT 'offline'
      CHECK (event_mode IN ('online', 'offline'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_event_mode ON events (event_mode);

-- ─── EVENT VIEWS TABLE ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS event_views (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  viewer_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE event_views ENABLE ROW LEVEL SECURITY;

-- Organizer can see views for their own events
DROP POLICY IF EXISTS "select_event_views" ON event_views;
CREATE POLICY "select_event_views" ON event_views FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_views.event_id
      AND events.created_by = auth.uid()
    )
  );

-- Anyone (authenticated or anon) can record a view
DROP POLICY IF EXISTS "insert_event_views" ON event_views;
CREATE POLICY "insert_event_views" ON event_views FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "delete_event_views" ON event_views;
CREATE POLICY "delete_event_views" ON event_views FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_views.event_id
      AND events.created_by = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_event_views_event_id ON event_views(event_id);
CREATE INDEX IF NOT EXISTS idx_event_views_viewed_at ON event_views(viewed_at);