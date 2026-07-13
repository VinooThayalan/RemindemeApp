/*
# Create events and reminders tables with image storage

## Overview
Sets up the core schema for a reminder/event app with two content types:
1. **Public events** — created by organizers, visible to everyone (including anonymous visitors). Mandatory: name + date/time. Optional: location, map coordinates, ticket purchase link, agenda, participants, poster image.
2. **Personal reminders** — private alarm-style reminders owned by a signed-in user. Mandatory: name + date/time. Optional: location, notes. The app reminds the owner 1 day and 1 hour before.

## New Tables

### events
- `id` (uuid, PK)
- `name` (text, not null) — event title
- `event_date` (timestamptz, not null) — when the event starts
- `location` (text, nullable) — human-readable location
- `map_lat` (numeric, nullable) — latitude
- `map_lng` (numeric, nullable) — longitude
- `ticket_url` (text, nullable) — external ticket purchase link
- `agenda` (text, nullable) — agenda as bullet-point text
- `participants` (text, nullable) — participants description
- `image_url` (text, nullable) — poster image URL (Supabase Storage public URL)
- `created_by` (uuid, not null, default auth.uid()) — organizer who created it
- `created_at` (timestamptz, default now())

### reminders
- `id` (uuid, PK)
- `name` (text, not null) — reminder title
- `remind_at` (timestamptz, not null) — when the reminder fires
- `location` (text, nullable) — optional location
- `notes` (text, nullable) — optional notes
- `user_id` (uuid, not null, default auth.uid()) — owner
- `created_at` (timestamptz, default now())

## Storage
- Creates a public bucket `event-images` for poster/event photos.

## Security (RLS)
- `events`: anyone (anon + authenticated) can SELECT public events. Authenticated users can INSERT/UPDATE/DELETE only events they created.
- `reminders`: authenticated users can CRUD only their own reminders.
- Storage bucket `event-images`: authenticated users can upload; anyone can read (public bucket).

## Notes
1. `created_by` / `user_id` default to `auth.uid()` so client inserts omitting the owner still satisfy RLS.
2. Indexes added on date columns for filter performance.
*/

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_date timestamptz NOT NULL,
  location text,
  map_lat numeric(9,6),
  map_lng numeric(9,6),
  ticket_url text,
  agenda text,
  participants text,
  image_url text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_event_date ON events (event_date);
CREATE INDEX IF NOT EXISTS idx_events_location ON events (location);

ALTER TABLE events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_events" ON events;
CREATE POLICY "anon_select_events" ON events FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_events" ON events;
CREATE POLICY "insert_own_events" ON events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "update_own_events" ON events;
CREATE POLICY "update_own_events" ON events FOR UPDATE
  TO authenticated USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "delete_own_events" ON events;
CREATE POLICY "delete_own_events" ON events FOR DELETE
  TO authenticated USING (auth.uid() = created_by);

CREATE TABLE IF NOT EXISTS reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  remind_at timestamptz NOT NULL,
  location text,
  notes text,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders (remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders (user_id);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_reminders" ON reminders;
CREATE POLICY "select_own_reminders" ON reminders FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_reminders" ON reminders;
CREATE POLICY "insert_own_reminders" ON reminders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_reminders" ON reminders;
CREATE POLICY "update_own_reminders" ON reminders FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_reminders" ON reminders;
CREATE POLICY "delete_own_reminders" ON reminders FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Storage bucket for event images
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-images', 'event-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "anon_read_event_images" ON storage.objects;
CREATE POLICY "anon_read_event_images" ON storage.objects FOR SELECT
  TO anon, authenticated USING (bucket_id = 'event-images');

DROP POLICY IF EXISTS "auth_insert_event_images" ON storage.objects;
CREATE POLICY "auth_insert_event_images" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'event-images');

DROP POLICY IF EXISTS "auth_update_event_images" ON storage.objects;
CREATE POLICY "auth_update_event_images" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'event-images') WITH CHECK (bucket_id = 'event-images');

DROP POLICY IF EXISTS "auth_delete_event_images" ON storage.objects;
CREATE POLICY "auth_delete_event_images" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'event-images');
