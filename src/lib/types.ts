export interface Event {
  id: string;
  name: string;
  event_date: string;
  location: string | null;
  map_lat: number | null;
  map_lng: number | null;
  ticket_url: string | null;
  agenda: string | null;
  participants: string | null;
  image_url: string | null;
  created_by: string;
  created_at: string;
}

export interface Reminder {
  id: string;
  name: string;
  remind_at: string;
  location: string | null;
  notes: string | null;
  user_id: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  display_name: string | null;
  username: string | null;
  role: 'user' | 'organizer' | 'admin';
  is_organizer: boolean;
  avatar_url: string | null;
  created_at: string;
}

export interface Follower {
  id: string;
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface EventReminder {
  id: string;
  event_id: string;
  user_id: string;
  remind_at: string;
  notes: string | null;
  is_public: boolean;
  created_at: string;
  event?: Event;
  user_profile?: UserProfile;
}

export interface EventReport {
  id: string;
  event_id: string;
  reporter_id: string;
  reason: string;
  created_at: string;
}

export interface HiddenEvent {
  id: string;
  event_id: string;
  user_id: string;
  created_at: string;
}

export type CreateMode = 'reminder' | 'event';
export type View = 'feed' | 'detail' | 'reminders' | 'create' | 'profile' | 'admin' | 'calendar';
