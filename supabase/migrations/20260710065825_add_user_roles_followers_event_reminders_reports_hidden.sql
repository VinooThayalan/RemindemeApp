/*
# RemindMe — Multi-Role Users, Followers, Event Reminders, Reports & Hidden Events

## Summary
Expands the RemindMe platform with a full social layer and moderation tooling.

## New Tables

### user_profiles
Extends auth.users with app-specific data:
- display_name, username (unique handle)
- role: 'user' | 'organizer' | 'admin' (admin set via DB only)
- is_organizer: boolean toggle — normal users can self-activate organizer mode to post events
- avatar_url: optional profile image

### followers
Social follow graph between users:
- follower_id → following_id (unique pair, both reference auth.users)

### event_reminders
Reminders tied to a specific event (separate from standalone personal reminders):
- event_id + user_id (unique: one reminder per user per event)
- remind_at, notes, is_public
- is_public = true → visible to the user's followers so they can "set for me"

### event_reports
User-submitted content reports on events:
- event_id + reporter_id (unique: one report per user per event)
- reason text field

### hidden_events
"Don't show me" preferences per user per event:
- event_id + user_id (unique pair)

## Security
- RLS enabled on all new tables
- user_profiles: all authenticated users can read all profiles; own-row update only
- followers: authenticated users can view all; can only insert/delete own follows
- event_reminders: users see own + public from people they follow + admins see all
- event_reports: users see own; admins see all
- hidden_events: own rows only

## Trigger
on_auth_user_created fires AFTER INSERT on auth.users and auto-creates a user_profile row (using email prefix as default display_name) so every user always has a profile.
*/

-- ─── USER PROFILES ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id            uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  text,
  username      text UNIQUE,
  role          text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'organizer', 'admin')),
  is_organizer  boolean NOT NULL DEFAULT false,
  avatar_url    text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_all_profiles" ON user_profiles;
CREATE POLICY "authenticated_select_all_profiles" ON user_profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_profile" ON user_profiles;
CREATE POLICY "insert_own_profile" ON user_profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON user_profiles;
CREATE POLICY "update_own_profile" ON user_profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "delete_own_profile" ON user_profiles;
CREATE POLICY "delete_own_profile" ON user_profiles FOR DELETE
  TO authenticated USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ─── FOLLOWERS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS followers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

ALTER TABLE followers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_select_followers" ON followers;
CREATE POLICY "authenticated_select_followers" ON followers FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_follows" ON followers;
CREATE POLICY "insert_own_follows" ON followers FOR INSERT
  TO authenticated WITH CHECK (follower_id = auth.uid());

DROP POLICY IF EXISTS "delete_own_follows" ON followers;
CREATE POLICY "delete_own_follows" ON followers FOR DELETE
  TO authenticated USING (follower_id = auth.uid());

-- ─── EVENT REMINDERS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_reminders (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  remind_at  timestamptz NOT NULL,
  notes      text,
  is_public  boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE event_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_and_followed_event_reminders" ON event_reminders;
CREATE POLICY "select_own_and_followed_event_reminders" ON event_reminders FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR (
      is_public = true
      AND EXISTS (
        SELECT 1 FROM followers
        WHERE follower_id = auth.uid() AND following_id = event_reminders.user_id
      )
    )
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "insert_own_event_reminders" ON event_reminders;
CREATE POLICY "insert_own_event_reminders" ON event_reminders FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_event_reminders" ON event_reminders;
CREATE POLICY "update_own_event_reminders" ON event_reminders FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_event_reminders" ON event_reminders;
CREATE POLICY "delete_own_event_reminders" ON event_reminders FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- ─── EVENT REPORTS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_reports (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  reason      text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(event_id, reporter_id)
);

ALTER TABLE event_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_and_admin_reports" ON event_reports;
CREATE POLICY "select_own_and_admin_reports" ON event_reports FOR SELECT
  TO authenticated USING (
    reporter_id = auth.uid()
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "insert_own_reports" ON event_reports;
CREATE POLICY "insert_own_reports" ON event_reports FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = reporter_id);

-- ─── HIDDEN EVENTS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hidden_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE hidden_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_hidden_events" ON hidden_events;
CREATE POLICY "select_own_hidden_events" ON hidden_events FOR SELECT
  TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "insert_own_hidden_events" ON hidden_events;
CREATE POLICY "insert_own_hidden_events" ON hidden_events FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_hidden_events" ON hidden_events;
CREATE POLICY "delete_own_hidden_events" ON hidden_events FOR DELETE
  TO authenticated USING (user_id = auth.uid());

-- ─── INDEXES ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_followers_follower_id  ON followers(follower_id);
CREATE INDEX IF NOT EXISTS idx_followers_following_id ON followers(following_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_event_id ON event_reminders(event_id);
CREATE INDEX IF NOT EXISTS idx_event_reminders_user_id  ON event_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_event_reports_event_id   ON event_reports(event_id);
CREATE INDEX IF NOT EXISTS idx_hidden_events_user_id    ON hidden_events(user_id);
