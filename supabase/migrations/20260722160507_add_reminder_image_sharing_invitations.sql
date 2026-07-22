/*
# Add image, sharing, and invitations to personal reminders

## Overview
Transforms personal reminders into shareable, image-backed reminders
that can be created by scanning a poster. Adds:
1. `image_url` — stores the captured poster image
2. `shared_with_followers` — when true, visible to creator's followers
3. `share_token` — unique token for link-based sharing
4. `reminder_invitations` table — email-based invitation to share a reminder

## Modified Tables
### reminders
- `image_url` (text, nullable) — poster image URL in Storage
- `shared_with_followers` (boolean, default false)
- `share_token` (text, nullable, UNIQUE, default gen_random_uuid())

## New Tables
### reminder_invitations
- reminder_id, email, invited_by, status, created_at
- Unique on (reminder_id, email)

## Security
- reminders SELECT: owner + followers (if shared) + invited users + share token
- reminder_invitations: creator manages; invited users see/accept their own
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reminders' AND column_name = 'image_url') THEN
    ALTER TABLE reminders ADD COLUMN image_url text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reminders' AND column_name = 'shared_with_followers') THEN
    ALTER TABLE reminders ADD COLUMN shared_with_followers boolean NOT NULL DEFAULT false;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'reminders' AND column_name = 'share_token') THEN
    ALTER TABLE reminders ADD COLUMN share_token text UNIQUE DEFAULT gen_random_uuid();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reminders_share_token ON reminders (share_token);

CREATE TABLE IF NOT EXISTS reminder_invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id uuid NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  email       text NOT NULL,
  invited_by  uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at  timestamptz DEFAULT now(),
  UNIQUE(reminder_id, email)
);

ALTER TABLE reminder_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_reminder_invitations" ON reminder_invitations;
CREATE POLICY "select_reminder_invitations" ON reminder_invitations FOR SELECT
  TO authenticated USING (
    invited_by = auth.uid()
    OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "insert_reminder_invitations" ON reminder_invitations;
CREATE POLICY "insert_reminder_invitations" ON reminder_invitations FOR INSERT
  TO authenticated WITH CHECK (invited_by = auth.uid());

DROP POLICY IF EXISTS "update_reminder_invitations" ON reminder_invitations;
CREATE POLICY "update_reminder_invitations" ON reminder_invitations FOR UPDATE
  TO authenticated USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  ) WITH CHECK (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "delete_reminder_invitations" ON reminder_invitations;
CREATE POLICY "delete_reminder_invitations" ON reminder_invitations FOR DELETE
  TO authenticated USING (invited_by = auth.uid());

CREATE INDEX IF NOT EXISTS idx_reminder_invitations_reminder_id ON reminder_invitations(reminder_id);
CREATE INDEX IF NOT EXISTS idx_reminder_invitations_email ON reminder_invitations(email);

DROP POLICY IF EXISTS "select_own_reminders" ON reminders;
DROP POLICY IF EXISTS "select_visible_reminders" ON reminders;

CREATE POLICY "select_visible_reminders" ON reminders FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR (
      shared_with_followers = true
      AND EXISTS (
        SELECT 1 FROM followers
        WHERE followers.follower_id = auth.uid()
        AND followers.following_id = reminders.user_id
      )
    )
    OR EXISTS (
      SELECT 1 FROM reminder_invitations
      WHERE reminder_invitations.reminder_id = reminders.id
      AND reminder_invitations.email = (
        SELECT email FROM auth.users WHERE id = auth.uid()
      )
    )
    OR share_token = current_setting('app.share_token', true)
  );