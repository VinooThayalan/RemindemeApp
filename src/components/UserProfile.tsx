import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { View } from '../lib/types';
import {
  User, LogOut, Briefcase, Users, Check, Edit2, X, Bell,
  ShieldCheck, Star,
} from 'lucide-react';

interface Props {
  onNavigate: (view: View) => void;
}

export function UserProfile({ onNavigate }: Props) {
  const { user, profile, signOut, refreshProfile } = useAuth();
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [eventCount, setEventCount] = useState(0);
  const [reminderCount, setReminderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingOrganizer, setTogglingOrganizer] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [followersRes, followingRes, eventsRes, remindersRes] = await Promise.all([
        supabase.from('followers').select('id', { count: 'exact', head: true }).eq('following_id', user.id),
        supabase.from('followers').select('id', { count: 'exact', head: true }).eq('follower_id', user.id),
        supabase.from('events').select('id', { count: 'exact', head: true }).eq('created_by', user.id),
        supabase.from('event_reminders').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);
      setFollowerCount(followersRes.count ?? 0);
      setFollowingCount(followingRes.count ?? 0);
      setEventCount(eventsRes.count ?? 0);
      setReminderCount(remindersRes.count ?? 0);
      setLoading(false);
    };
    load();
  }, [user]);

  useEffect(() => {
    if (profile?.display_name) setDisplayName(profile.display_name);
  }, [profile]);

  const handleSaveName = async () => {
    if (!user || !displayName.trim()) return;
    setSaving(true);
    await supabase
      .from('user_profiles')
      .update({ display_name: displayName.trim() })
      .eq('id', user.id);
    await refreshProfile();
    setSaving(false);
    setEditing(false);
  };

  const handleToggleOrganizer = async () => {
    if (!user || !profile) return;
    setTogglingOrganizer(true);
    const newVal = !profile.is_organizer;
    await supabase
      .from('user_profiles')
      .update({ is_organizer: newVal })
      .eq('id', user.id);
    await refreshProfile();
    setTogglingOrganizer(false);
  };

  const roleLabel = () => {
    if (profile?.role === 'admin') return 'Super Admin';
    if (profile?.is_organizer) return 'Organizer';
    return 'Member';
  };

  const roleColor = () => {
    if (profile?.role === 'admin') return 'text-amber-400 bg-amber-900/30 border-amber-700/50';
    if (profile?.is_organizer) return 'text-sky-400 bg-sky-900/30 border-sky-700/50';
    return 'text-slate-400 bg-slate-800 border-slate-700';
  };

  return (
    <div className="pb-28">
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800">
        <div className="px-5 pt-5 pb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white tracking-tight">Profile</h1>
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-red-400 hover:bg-red-900/20 border border-slate-700 text-xs font-medium transition"
          >
            <LogOut size={13} /> Sign out
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        {/* Avatar + name */}
        <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-6 flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-500 flex items-center justify-center text-white font-bold text-2xl shrink-0">
            {(profile?.display_name ?? user?.email ?? 'U')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex items-center gap-2">
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-slate-700 border border-slate-600 text-white text-sm focus:border-sky-500 focus:outline-none"
                  autoFocus
                />
                <button onClick={handleSaveName} disabled={saving} className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400 hover:bg-sky-500/30 transition">
                  <Check size={15} />
                </button>
                <button onClick={() => setEditing(false)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 transition">
                  <X size={15} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="font-bold text-white text-lg truncate">{profile?.display_name ?? 'Your Name'}</p>
                <button onClick={() => setEditing(true)} className="p-1 rounded-md hover:bg-slate-700 text-slate-500 transition">
                  <Edit2 size={13} />
                </button>
              </div>
            )}
            <p className="text-slate-500 text-sm truncate">{user?.email}</p>
            <div className={`inline-flex items-center gap-1.5 mt-2 px-2.5 py-1 rounded-full text-xs font-semibold border ${roleColor()}`}>
              {profile?.role === 'admin' ? <ShieldCheck size={11} /> : profile?.is_organizer ? <Star size={11} /> : <User size={11} />}
              {roleLabel()}
            </div>
          </div>
        </div>

        {/* Stats */}
        {!loading && (
          <div className="grid grid-cols-2 gap-3">
            <StatCard value={followerCount} label="Followers" icon={<Users size={18} />} />
            <StatCard value={followingCount} label="Following" icon={<Users size={18} />} />
            {(profile?.is_organizer || profile?.role === 'admin') && (
              <StatCard value={eventCount} label="Events Posted" icon={<Bell size={18} />} />
            )}
            <StatCard value={reminderCount} label="Event Reminders" icon={<Bell size={18} />} />
          </div>
        )}

        {/* Organizer toggle — only for non-admin users */}
        {profile?.role !== 'admin' && (
          <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-sky-900/50 flex items-center justify-center shrink-0">
                  <Briefcase size={17} className="text-sky-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Organizer Mode</p>
                  <p className="text-slate-500 text-xs mt-0.5">Post events to the community feed</p>
                </div>
              </div>
              <button
                onClick={handleToggleOrganizer}
                disabled={togglingOrganizer}
                className={`w-11 h-6 rounded-full transition-colors duration-200 relative shrink-0 ${
                  profile?.is_organizer ? 'bg-sky-500' : 'bg-slate-700'
                }`}
              >
                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${profile?.is_organizer ? 'translate-x-5' : ''}`} />
              </button>
            </div>
            {profile?.is_organizer && (
              <div className="mt-3 pt-3 border-t border-slate-700 flex items-center gap-2 text-xs text-sky-400">
                <Check size={12} />
                You can now post events. Tap the + button to get started.
              </div>
            )}
          </div>
        )}

        {/* Admin shortcut */}
        {profile?.role === 'admin' && (
          <button
            onClick={() => onNavigate('admin')}
            className="w-full rounded-2xl bg-amber-900/20 border border-amber-700/40 p-5 flex items-center gap-4 hover:bg-amber-900/30 transition text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-900/50 flex items-center justify-center shrink-0">
              <ShieldCheck size={20} className="text-amber-400" />
            </div>
            <div>
              <p className="text-amber-300 font-semibold text-sm">Admin Dashboard</p>
              <p className="text-amber-600 text-xs mt-0.5">View users, events, and reports</p>
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

function StatCard({ value, label, icon }: { value: number; label: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-4 flex items-center gap-3">
      <div className="text-slate-500">{icon}</div>
      <div>
        <p className="text-2xl font-bold text-white leading-none">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}
