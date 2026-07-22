/*
# Add event visibility levels, invitations, and share tokens

## Overview
Introduces three event types with different visibility rules:
1. **Public events** — visible to everyone in the feed and calendar.
2. **Closed group events** — visible only to creator + invited users (by email) or via share link token.
3. **Private events** — visible to creator; optionally shared with their followers.

## Modified Tables
### events
- Added `visibility` (text, NOT NULL, default 'public') — 'public' | 'closed' | 'private'
- Added `shared_with_followers` (boolean, NOT NULL, default false) — for private events
- Added `share_token` (text, nullable, UNIQUE) — token for closed-group share links

## New Tables
### event_invitations
Email-based invitations to closed-group events.
- event_id, email, invited_by, status ('pending'|'accepted'), created_at
- Unique on (event_id, email)

## Security
- events SELECT policy replaced with visibility-aware rules
- event_invitations: creator can manage; invited users can see/update their own
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'visibility') THEN
    ALTER TABLE events ADD COLUMN visibility text NOT NULL DEFAULT 'public'
      CHECK (visibility IN ('public', 'closed', 'private'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'shared_with_followers') THEN
    ALTER TABLE events ADD COLUMN shared_with_followers boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'share_token') THEN
    ALTER TABLE events ADD COLUMN share_token text UNIQUE DEFAULT gen_random_uuid();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_events_visibility ON events (visibility);
CREATE INDEX IF NOT EXISTS idx_events_share_token ON events (share_token);

-- ─── EVENT INVITATIONS TABLE ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_invitations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email      text NOT NULL,
  invited_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, email)
);

ALTER TABLE event_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_event_invitations" ON event_invitations;
CREATE POLICY "select_event_invitations" ON event_invitations FOR SELECT
  TO authenticated USING (
    invited_by = auth.uid()
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_event_invitations" ON event_invitations;
CREATE POLICY "insert_event_invitations" ON event_invitations FOR INSERT
  TO authenticated WITH CHECK (invited_by = auth.uid());

DROP POLICY IF EXISTS "update_event_invitations" ON event_invitations;
CREATE POLICY "update_event_invitations" ON event_invitations FOR UPDATE
  TO authenticated USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  ) WITH CHECK (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_event_invitations" ON event_invitations;
CREATE POLICY "delete_event_invitations" ON event_invitations FOR DELETE
  TO authenticated USING (invited_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_event_invitations_event_id ON event_invitations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_invitations_email ON event_invitations(email);

-- ─── REPLACE EVENTS SELECT POLICY ────────────────────────────────────────────
DROP POLICY IF EXISTS "anon_select_events" ON events;
DROP POLICY IF EXISTS "select_visible_events" ON events;

CREATE POLICY "select_visible_events" ON events FOR SELECT
  TO anon, authenticated USING (
    visibility = 'public'
    OR created_by = auth.uid()
    OR (
      visibility = 'closed'
      AND EXISTS (
        SELECT 1 FROM event_invitations
        WHERE event_invitations.event_id = events.id
        AND event_invitations.email = (
          SELECT email FROM auth.users WHERE id = auth.uid()
        )
      )
    )
    OR (
      visibility = 'closed'
      AND share_token = current_setting('app.share_token', true)
    )
    OR (
      visibility = 'private'
      AND shared_with_followers = true
      AND EXISTS (
        SELECT 1 FROM followers
        WHERE followers.follower_id = auth.uid()
        AND followers.following_id = events.created_by
      )
    )
  );

DROP POLICY IF EXISTS "insert_own_events" ON events;
CREATE POLICY "insert_own_events" ON events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = created_by);