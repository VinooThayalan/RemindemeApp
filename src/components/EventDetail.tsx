import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Event, EventReminder, UserProfile } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { formatFullDate, formatCountdown, toLocalInput } from '../lib/time';
import {
  ChevronLeft, MapPin, Ticket, Users, FileText, Bell, Trash2,
  ExternalLink, Flag, EyeOff, X, Check, UserPlus, UserCheck, Share2,
} from 'lucide-react';

interface EventDetailProps {
  event: Event;
  onBack: () => void;
  onEventDeleted: () => void;
}

export function EventDetail({ event, onBack, onEventDeleted }: EventDetailProps) {
  const { user } = useAuth();
  const isOwner = user?.id === event.created_by;

  const [deleting, setDeleting] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [existingReminder, setExistingReminder] = useState<EventReminder | null>(null);
  const [organizerProfile, setOrganizerProfile] = useState<UserProfile | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [reminderRes, profileRes] = await Promise.all([
        supabase
          .from('event_reminders')
          .select('*')
          .eq('event_id', event.id)
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('user_profiles')
          .select('*')
          .eq('id', event.created_by)
          .maybeSingle(),
      ]);
      if (reminderRes.data) setExistingReminder(reminderRes.data as EventReminder);
      if (profileRes.data) setOrganizerProfile(profileRes.data as UserProfile);

      if (!isOwner) {
        const { data: followData } = await supabase
          .from('followers')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', event.created_by)
          .maybeSingle();
        setIsFollowing(!!followData);
      }
    };
    load();
  }, [user, event.id, event.created_by, isOwner]);

  const handleDelete = async () => {
    if (!confirm('Delete this event? This cannot be undone.')) return;
    setDeleting(true);
    const { error } = await supabase.from('events').delete().eq('id', event.id);
    if (error) { alert(error.message); setDeleting(false); return; }
    onEventDeleted();
  };

  const handleHide = async () => {
    if (!user) return;
    await supabase.from('hidden_events').insert({ event_id: event.id });
    setHidden(true);
    setTimeout(() => onBack(), 800);
  };

  const handleFollow = async () => {
    if (!user) return;
    setFollowLoading(true);
    if (isFollowing) {
      await supabase.from('followers').delete()
        .eq('follower_id', user.id).eq('following_id', event.created_by);
      setIsFollowing(false);
    } else {
      await supabase.from('followers').insert({ following_id: event.created_by });
      setIsFollowing(true);
    }
    setFollowLoading(false);
  };

  const agendaItems = event.agenda
    ? event.agenda.split('\n').map((l) => l.replace(/^\s*[•\-*]\s*/, '').trim()).filter(Boolean)
    : [];

  const isPast = new Date(event.event_date).getTime() <= Date.now();

  if (hidden) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-slate-800 mb-3">
            <EyeOff size={24} className="text-slate-400" />
          </div>
          <p className="text-slate-400">Event hidden from your feed</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-10">
      {/* Hero */}
      {event.image_url ? (
        <div className="relative h-64 overflow-hidden">
          <img src={event.image_url} alt={event.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-black/40 to-transparent" />
          <TopBar onBack={onBack} event={event} user={user} onHide={handleHide} onReport={() => setShowReportModal(true)} />
          <div className="absolute bottom-4 left-4 right-4">
            <h1 className="text-2xl font-bold text-white drop-shadow-lg leading-tight">{event.name}</h1>
          </div>
        </div>
      ) : (
        <div className="relative h-48 bg-gradient-to-br from-sky-500 via-cyan-500 to-blue-600">
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }} />
          <TopBar onBack={onBack} event={event} user={user} onHide={handleHide} onReport={() => setShowReportModal(true)} />
          <div className="absolute bottom-4 left-4 right-4">
            <h1 className="text-2xl font-bold text-white drop-shadow-lg leading-tight">{event.name}</h1>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 -mt-2 relative space-y-3">
        {/* Countdown card */}
        <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-5">
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-sky-900/50 flex items-center justify-center">
              <Bell size={22} className="text-sky-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">When</p>
              <p className="font-semibold text-slate-200 text-sm">{formatFullDate(event.event_date)}</p>
              {!isPast && (
                <p className="text-sm font-semibold text-sky-400 mt-0.5">{formatCountdown(event.event_date)}</p>
              )}
            </div>
          </div>
        </div>

        {/* Organizer row */}
        {organizerProfile && !isOwner && (
          <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {(organizerProfile.display_name ?? 'O')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500 font-medium">Organized by</p>
              <p className="text-slate-200 font-semibold text-sm truncate">
                {organizerProfile.display_name ?? 'Unknown'}
              </p>
            </div>
            {user && (
              <button
                onClick={handleFollow}
                disabled={followLoading}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  isFollowing
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    : 'bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30'
                }`}
              >
                {isFollowing ? <UserCheck size={13} /> : <UserPlus size={13} />}
                {isFollowing ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
        )}

        {/* Set Reminder */}
        {user && !isOwner && !isPast && (
          <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-4">
            {existingReminder ? (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0">
                  <Check size={16} className="text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-300 text-sm font-medium">Reminder set</p>
                  <p className="text-slate-500 text-xs">{formatFullDate(existingReminder.remind_at)}</p>
                  {existingReminder.is_public && (
                    <p className="text-cyan-500 text-xs flex items-center gap-1 mt-0.5">
                      <Share2 size={10} /> Shared with followers
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setShowReminderModal(true)}
                  className="text-xs text-slate-400 hover:text-slate-200 transition px-2 py-1 rounded-lg hover:bg-slate-700"
                >
                  Edit
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowReminderModal(true)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 font-semibold text-sm transition"
              >
                <Bell size={16} />
                Set Reminder for This Event
              </button>
            )}
          </div>
        )}

        {/* Details */}
        {event.location && (
          <DetailRow icon={<MapPin size={16} />} label="Location" value={event.location} />
        )}
        {event.ticket_url && (
          <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wide font-medium mb-2">
              <Ticket size={14} />
              <span>Tickets</span>
            </div>
            <a
              href={event.ticket_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-emerald-400 font-medium text-sm hover:text-emerald-300 transition"
            >
              Buy tickets <ExternalLink size={13} />
            </a>
          </div>
        )}
        {event.participants && (
          <DetailRow icon={<Users size={16} />} label="Participants" value={event.participants} />
        )}
        {agendaItems.length > 0 && (
          <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wide font-medium mb-3">
              <FileText size={14} />
              <span>Agenda</span>
            </div>
            <ul className="space-y-2">
              {agendaItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-slate-300">
                  <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-sky-400 mt-1.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Owner actions */}
        {isOwner && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="w-full py-3 rounded-xl bg-red-900/30 text-red-400 font-medium border border-red-800/50 hover:bg-red-900/50 active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Trash2 size={16} />
            {deleting ? 'Deleting...' : 'Delete Event'}
          </button>
        )}
      </div>

      {/* Reminder Modal */}
      {showReminderModal && user && (
        <ReminderModal
          event={event}
          existing={existingReminder}
          onClose={() => setShowReminderModal(false)}
          onSaved={(r) => { setExistingReminder(r); setShowReminderModal(false); }}
          onDeleted={() => { setExistingReminder(null); setShowReminderModal(false); }}
        />
      )}

      {/* Report Modal */}
      {showReportModal && user && (
        <ReportModal
          eventId={event.id}
          onClose={() => setShowReportModal(false)}
        />
      )}
    </div>
  );
}

function TopBar({
  onBack,
  event,
  user,
  onHide,
  onReport,
}: {
  onBack: () => void;
  event: Event;
  user: { id: string } | null;
  onHide: () => void;
  onReport: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const isOwner = user?.id === event.created_by;

  return (
    <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
      <button
        onClick={onBack}
        className="p-2 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition"
      >
        <ChevronLeft size={22} />
      </button>
      {user && !isOwner && (
        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-2 rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
          {showMenu && (
            <div className="absolute right-0 top-10 bg-slate-800 border border-slate-700 rounded-xl shadow-xl overflow-hidden w-44 z-50">
              <button
                onClick={() => { setShowMenu(false); onReport(); }}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 transition"
              >
                <Flag size={14} className="text-red-400" /> Report event
              </button>
              <button
                onClick={() => { setShowMenu(false); onHide(); }}
                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700 transition border-t border-slate-700"
              >
                <EyeOff size={14} className="text-slate-400" /> Don't show me
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReminderModal({
  event,
  existing,
  onClose,
  onSaved,
  onDeleted,
}: {
  event: Event;
  existing: EventReminder | null;
  onClose: () => void;
  onSaved: (r: EventReminder) => void;
  onDeleted: () => void;
}) {
  const eventDefault = toLocalInput(event.event_date);
  const [remindAt, setRemindAt] = useState(existing ? toLocalInput(existing.remind_at) : eventDefault);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [isPublic, setIsPublic] = useState(existing?.is_public ?? false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    const remindAtIso = new Date(remindAt).toISOString();

    if (existing) {
      const { data, error: err } = await supabase
        .from('event_reminders')
        .update({ remind_at: remindAtIso, notes: notes || null, is_public: isPublic })
        .eq('id', existing.id)
        .select()
        .maybeSingle();
      setSaving(false);
      if (err) { setError(err.message); return; }
      if (data) onSaved(data as EventReminder);
    } else {
      const { data, error: err } = await supabase
        .from('event_reminders')
        .insert({ event_id: event.id, remind_at: remindAtIso, notes: notes || null, is_public: isPublic })
        .select()
        .maybeSingle();
      setSaving(false);
      if (err) { setError(err.message); return; }
      if (data) onSaved(data as EventReminder);
    }
  };

  const handleDelete = async () => {
    if (!existing) return;
    setDeleting(true);
    await supabase.from('event_reminders').delete().eq('id', existing.id);
    setDeleting(false);
    onDeleted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            {existing ? 'Edit Reminder' : 'Set Reminder'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition">
            <X size={18} />
          </button>
        </div>
        <p className="text-slate-400 text-sm truncate">{event.name}</p>

        <div>
          <label className="text-xs font-medium text-slate-500 mb-1.5 block">Remind me at</label>
          <input
            type="datetime-local"
            value={remindAt}
            onChange={(e) => setRemindAt(e.target.value)}
            className="w-full px-3 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-slate-200 text-sm transition"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-500 mb-1.5 block">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Add notes..."
            className="w-full px-3 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-slate-200 text-sm transition resize-none"
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer group">
          <div
            onClick={() => setIsPublic(!isPublic)}
            className={`w-10 h-6 rounded-full transition-colors duration-200 relative ${isPublic ? 'bg-sky-500' : 'bg-slate-700'}`}
          >
            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${isPublic ? 'translate-x-4' : ''}`} />
          </div>
          <div>
            <p className="text-slate-200 text-sm font-medium">Share with followers</p>
            <p className="text-slate-500 text-xs">Followers can see and copy this reminder</p>
          </div>
        </label>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3 pt-1">
          {existing && (
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-4 py-2.5 rounded-xl bg-red-900/30 text-red-400 border border-red-800/50 text-sm font-medium hover:bg-red-900/50 transition disabled:opacity-50"
            >
              {deleting ? '...' : 'Remove'}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-sky-500 text-white font-semibold text-sm hover:bg-sky-400 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : existing ? 'Update' : 'Set Reminder'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReportModal({ eventId, onClose }: { eventId: string; onClose: () => void }) {
  const reasons = ['Spam or misleading', 'Inappropriate content', 'Fake event', 'Harmful or dangerous', 'Other'];
  const [selected, setSelected] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async () => {
    if (!selected) return;
    setSubmitting(true);
    await supabase.from('event_reports').insert({ event_id: eventId, reason: selected });
    setSubmitting(false);
    setDone(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl">
        {done ? (
          <div className="text-center py-4">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-900/50 mb-3">
              <Check size={22} className="text-emerald-400" />
            </div>
            <p className="text-slate-200 font-medium">Report submitted</p>
            <p className="text-slate-500 text-sm mt-1">Thank you for keeping the community safe</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-white">Report Event</h2>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition">
                <X size={18} />
              </button>
            </div>
            <p className="text-slate-400 text-sm mb-4">Why are you reporting this event?</p>
            <div className="space-y-2 mb-5">
              {reasons.map((r) => (
                <button
                  key={r}
                  onClick={() => setSelected(r)}
                  className={`w-full text-left px-4 py-3 rounded-xl text-sm transition ${
                    selected === r
                      ? 'bg-red-900/40 text-red-300 border border-red-700/60'
                      : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <button
              onClick={handleSubmit}
              disabled={!selected || submitting}
              className="w-full py-3 rounded-xl bg-red-600 text-white font-semibold text-sm hover:bg-red-500 transition disabled:opacity-40"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wide font-medium mb-2">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-sm text-slate-300">{value}</p>
    </div>
  );
}
