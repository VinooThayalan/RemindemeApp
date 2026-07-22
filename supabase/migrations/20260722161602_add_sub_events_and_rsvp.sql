-- Sub-events: scheduled segments within a parent event
CREATE TABLE IF NOT EXISTS sub_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  title       text NOT NULL,
  start_time  timestamptz NOT NULL,
  end_time    timestamptz,
  description text,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE sub_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_sub_events" ON sub_events;
CREATE POLICY "select_sub_events" ON sub_events FOR SELECT
  TO anon, authenticated USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = sub_events.event_id
      AND (
        events.visibility = 'public'
        OR events.created_by = auth.uid()
        OR (
          events.visibility = 'closed'
          AND EXISTS (
            SELECT 1 FROM event_invitations
            WHERE event_invitations.event_id = events.id
            AND event_invitations.email = (SELECT email FROM auth.users WHERE id = auth.uid())
          )
        )
        OR (
          events.visibility = 'closed'
          AND events.share_token = current_setting('app.share_token', true)
        )
        OR (
          events.visibility = 'private'
          AND events.shared_with_followers = true
          AND EXISTS (
            SELECT 1 FROM followers
            WHERE followers.follower_id = auth.uid()
            AND followers.following_id = events.created_by
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "insert_sub_events" ON sub_events;
CREATE POLICY "insert_sub_events" ON sub_events FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = sub_events.event_id
      AND events.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "update_sub_events" ON sub_events;
CREATE POLICY "update_sub_events" ON sub_events FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM events WHERE events.id = sub_events.event_id AND events.created_by = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM events WHERE events.id = sub_events.event_id AND events.created_by = auth.uid())
  );

DROP POLICY IF EXISTS "delete_sub_events" ON sub_events;
CREATE POLICY "delete_sub_events" ON sub_events FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM events WHERE events.id = sub_events.event_id AND events.created_by = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_sub_events_event_id ON sub_events(event_id);
CREATE INDEX IF NOT EXISTS idx_sub_events_start_time ON sub_events(start_time);

-- Event RSVPs: user attendance status for events
CREATE TABLE IF NOT EXISTS event_rsvps (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status     text NOT NULL CHECK (status IN ('going', 'maybe', 'not_going')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE event_rsvps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_event_rsvps" ON event_rsvps;
CREATE POLICY "select_event_rsvps" ON event_rsvps FOR SELECT
  TO anon, authenticated USING (
    EXISTS (
      SELECT 1 FROM events
      WHERE events.id = event_rsvps.event_id
      AND (
        events.visibility = 'public'
        OR events.created_by = auth.uid()
        OR (
          events.visibility = 'closed'
          AND EXISTS (
            SELECT 1 FROM event_invitations
            WHERE event_invitations.event_id = events.id
            AND event_invitations.email = (SELECT email FROM auth.users WHERE id = auth.uid())
          )
        )
        OR (
          events.visibility = 'closed'
          AND events.share_token = current_setting('app.share_token', true)
        )
        OR (
          events.visibility = 'private'
          AND events.shared_with_followers = true
          AND EXISTS (
            SELECT 1 FROM followers
            WHERE followers.follower_id = auth.uid()
            AND followers.following_id = events.created_by
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS "insert_own_rsvp" ON event_rsvps;
CREATE POLICY "insert_own_rsvp" ON event_rsvps FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_rsvp" ON event_rsvps;
CREATE POLICY "update_own_rsvp" ON event_rsvps FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_rsvp" ON event_rsvps;
CREATE POLICY "delete_own_rsvp" ON event_rsvps FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_event_id ON event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_user_id ON event_rsvps(user_id);