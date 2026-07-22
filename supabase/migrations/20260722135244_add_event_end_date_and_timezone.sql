/*
# Add end date and timezone to events

## Overview
Expands the events table to support multi-day events and timezone awareness.
Previously events had only a single mandatory `event_date` (start). Now:
1. `event_date` remains the mandatory start date/time.
2. New `end_date` (timestamptz, nullable) — optional end date/time for multi-day events.
3. New `timezone` (text, nullable) — IANA timezone string (e.g. "America/New_York")
   indicating the timezone the organizer specified when creating the event.

## Modified Tables
### events
- Added `end_date timestamptz` (nullable) — when the event ends
- Added `timezone text` (nullable) — IANA timezone identifier for the event's local time

## Security
- No RLS policy changes. Existing policies remain intact.

## Notes
1. Both new columns are nullable so existing event rows remain valid.
2. `event_date` continues to serve as the start date/time.
3. The frontend now captures start date (required), optional start time (defaults to 00:00),
   optional end date/time, and a timezone selector.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'end_date') THEN
    ALTER TABLE events ADD COLUMN end_date timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'timezone') THEN
    ALTER TABLE events ADD COLUMN timezone text;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_end_date ON events (end_date);