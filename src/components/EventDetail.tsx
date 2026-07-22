import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Event, EventReminder, EventInvitation, UserProfile, SubEvent, RsvpStatus } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { formatFullDate, formatCountdown, toLocalInput, formatInTimezone, timezoneLabel } from '../lib/time';
import {
  ChevronLeft, MapPin, Ticket, Users, FileText, Bell, Trash2,
  ExternalLink, Flag, EyeOff, X, Check, UserPlus, UserCheck, Share2, Clock, Globe,
  Globe2, Lock, UsersRound, Mail, Plus, Copy,
  ListTree, Circle, CheckCircle2, CalendarClock,
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
  const [invitations, setInvitations] = useState<EventInvitation[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [subEvents, setSubEvents] = useState<SubEvent[]>([]);
  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus | null>(null);
  const [rsvpCounts, setRsvpCounts] = useState<Record<RsvpStatus, number>>({ going: 0, maybe: 0, not_going: 0 });
  const [subEventReminders, setSubEventReminders] = useState<Set<string>>(new Set());
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [subReminderLoading, setSubReminderLoading] = useState<string | null>(null);

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

      if (isOwner && event.visibility === 'closed') {
        const { data: inviteData } = await supabase
          .from('event_invitations')
          .select('*')
          .eq('event_id', event.id)
          .order('created_at', { ascending: false });
        setInvitations((inviteData as EventInvitation[]) ?? []);
      }

      const [subRes, rsvpAllRes, myRsvpRes, subRemRes] = await Promise.all([
        supabase.from('sub_events').select('*').eq('event_id', event.id).order('sort_order', { ascending: true }),
        supabase.from('event_rsvps').select('status').eq('event_id', event.id),
        user ? supabase.from('event_rsvps').select('*').eq('event_id', event.id).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null, error: null }),
        user ? supabase.from('event_reminders').select('remind_at').eq('user_id', user.id) : Promise.resolve({ data: null, error: null }),
      ]);

      if (subRes.data) setSubEvents(subRes.data as SubEvent[]);
      if (rsvpAllRes.data) {
        const counts = { going: 0, maybe: 0, not_going: 0 } as Record<RsvpStatus, number>;
        rsvpAllRes.data.forEach((r: { status: RsvpStatus }) => { counts[r.status]++; });
        setRsvpCounts(counts);
      }
      if (myRsvpRes.data) setRsvpStatus((myRsvpRes.data as { status: RsvpStatus }).status);

      if (subRemRes.data && subRes.data) {
        const reminderTimes = new Set((subRemRes.data as { remind_at: string }[]).map((r) => r.remind_at));
        const matched = new Set<string>();
        (subRes.data as SubEvent[]).forEach((s) => {
          if (reminderTimes.has(s.start_time)) matched.add(s.id);
        });
        setSubEventReminders(matched);
      }
    };
    load();
  }, [user, event.id, event.created_by, isOwner, event.visibility]);

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

  const handleRsvp = async (status: RsvpStatus) => {
    if (!user) return;
    setRsvpLoading(true);
    const newStatus = rsvpStatus === status ? null : status;
    if (newStatus) {
      await supabase.from('event_rsvps').upsert({ event_id: event.id, user_id: user.id, status: newStatus }, { onConflict: 'event_id,user_id' });
    } else {
      await supabase.from('event_rsvps').delete().eq('event_id', event.id).eq('user_id', user.id);
    }
    const { data: allRsvp } = await supabase.from('event_rsvps').select('status').eq('event_id', event.id);
    const counts = { going: 0, maybe: 0, not_going: 0 } as Record<RsvpStatus, number>;
    allRsvp?.forEach((r: { status: RsvpStatus }) => { counts[r.status]++; });
    setRsvpCounts(counts);
    setRsvpStatus(newStatus);
    setRsvpLoading(false);
  };

  const toggleSubEventReminder = async (sub: SubEvent) => {
    if (!user) return;
    setSubReminderLoading(sub.id);
    if (subEventReminders.has(sub.id)) {
      await supabase.from('event_reminders').delete().eq('event_id', event.id).eq('user_id', user.id).eq('remind_at', sub.start_time);
      setSubEventReminders((prev) => { const n = new Set(prev); n.delete(sub.id); return n; });
    } else {
      await supabase.from('event_reminders').insert({ event_id: event.id, remind_at: sub.start_time, notes: sub.title });
      setSubEventReminders((prev) => new Set(prev).add(sub.id));
    }
    setSubReminderLoading(null);
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

  const shareLink = event.share_token
    ? `${window.location.origin}?event=${event.share_token}`
    : '';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-950 pb-10">
      {/* Hero */}
      {event.image_url ? (
        <div className="relative h-64 overflow-hidden">
          <img src={event.image_url} alt={event.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-black/40 to-transparent" />
          <TopBar onBack={onBack} event={event} user={user} onHide={handleHide} onReport={() => setShowReportModal(true)} />
          <div className="absolute bottom-4 left-4 right-4">
            <div className="mb-2"><EventVisibilityBadge visibility={event.visibility} /></div>
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
            <div className="mb-2"><EventVisibilityBadge visibility={event.visibility} /></div>
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
              <p className="font-semibold text-slate-200 text-sm">{formatInTimezone(event.event_date, event.timezone)}</p>
              {event.end_date && (
                <div className="flex items-start gap-1.5 mt-1">
                  <Clock size={12} className="text-slate-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-slate-400">
                    <span className="text-slate-500">Ends: </span>
                    {formatInTimezone(event.end_date, event.timezone)}
                  </p>
                </div>
              )}
              {event.timezone && (
                <div className="flex items-center gap-1.5 mt-1">
                  <Globe size={11} className="text-slate-500 shrink-0" />
                  <p className="text-xs text-slate-500">{timezoneLabel(event.timezone)}</p>
                </div>
              )}
              {!isPast && (
                <p className="text-sm font-semibold text-sky-400 mt-1">{formatCountdown(event.event_date)}</p>
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

        {/* RSVP section */}
        {user && !isPast && (
          <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wide font-medium mb-3">
              <Users size={14} />
              <span>RSVP</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'going', label: 'Going', color: 'emerald', count: rsvpCounts.going },
                { value: 'maybe', label: 'Maybe', color: 'amber', count: rsvpCounts.maybe },
                { value: 'not_going', label: "Can't go", color: 'red', count: rsvpCounts.not_going },
              ] as { value: RsvpStatus; label: string; color: string; count: number }[]).map((opt) => {
                const active = rsvpStatus === opt.value;
                const colorClasses: Record<string, { active: string; idle: string; text: string }> = {
                  emerald: { active: 'bg-emerald-500/30 border-emerald-500 text-emerald-300', idle: 'bg-slate-900 border-slate-700 text-slate-400 hover:border-emerald-600/50', text: 'text-emerald-400' },
                  amber: { active: 'bg-amber-500/30 border-amber-500 text-amber-300', idle: 'bg-slate-900 border-slate-700 text-slate-400 hover:border-amber-600/50', text: 'text-amber-400' },
                  red: { active: 'bg-red-500/30 border-red-500 text-red-300', idle: 'bg-slate-900 border-slate-700 text-slate-400 hover:border-red-600/50', text: 'text-red-400' },
                };
                const c = colorClasses[opt.color];
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleRsvp(opt.value)}
                    disabled={rsvpLoading}
                    className={`rounded-xl border py-3 px-2 text-center transition disabled:opacity-50 ${active ? c.active : c.idle}`}
                  >
                    <p className="text-sm font-semibold">{opt.label}</p>
                    <p className={`text-xs mt-0.5 ${active ? c.text : 'text-slate-500'}`}>{opt.count}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Sub-events list */}
        {subEvents.length > 0 && (
          <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wide font-medium mb-3">
              <ListTree size={14} className="text-sky-400" />
              <span>Sub-events</span>
            </div>
            <p className="text-xs text-slate-500 mb-3">Tap to set individual reminders for each segment.</p>
            <div className="space-y-2">
              {subEvents.map((sub) => {
                const hasReminder = subEventReminders.has(sub.id);
                const subPast = new Date(sub.start_time).getTime() <= Date.now();
                return (
                  <button
                    key={sub.id}
                    onClick={() => toggleSubEventReminder(sub)}
                    disabled={subReminderLoading === sub.id || subPast || !user}
                    className="w-full flex items-start gap-3 rounded-xl border p-3 text-left transition disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: hasReminder ? 'rgba(56,189,248,0.08)' : 'rgba(15,23,42,0.6)',
                      borderColor: hasReminder ? 'rgba(56,189,248,0.5)' : 'rgba(51,65,85,0.6)',
                    }}
                  >
                    <div className="shrink-0 mt-0.5">
                      {hasReminder
                        ? <CheckCircle2 size={18} className="text-sky-400" />
                        : <Circle size={18} className="text-slate-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-200">{sub.title}</p>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                        <CalendarClock size={11} />
                        <span>{formatInTimezone(sub.start_time, event.timezone)}</span>
                      </div>
                      {sub.description && (
                        <p className="text-xs text-slate-500 mt-1">{sub.description}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
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

        {/* Closed group: share link & invitations management */}
        {isOwner && event.visibility === 'closed' && (
          <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wide font-medium">
              <UsersRound size={14} className="text-amber-400" />
              <span>Closed Group</span>
            </div>

            {shareLink && (
              <div>
                <p className="text-xs text-slate-500 mb-1.5">Share this link to invite people:</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-400 truncate">
                    {shareLink}
                  </div>
                  <button
                    onClick={handleCopyLink}
                    className="shrink-0 p-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition"
                  >
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            )}

            {invitations.length > 0 && (
              <div className="pt-2 border-t border-slate-700/60">
                <p className="text-xs text-slate-500 mb-2">Invited ({invitations.length})</p>
                <div className="space-y-1.5">
                  {invitations.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-slate-300 truncate">{inv.email}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        inv.status === 'accepted'
                          ? 'bg-emerald-900/40 text-emerald-400'
                          : 'bg-slate-700 text-slate-400'
                      }`}>
                        {inv.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => setShowInviteModal(true)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 text-sm font-semibold transition"
            >
              <Mail size={14} /> Invite by email
            </button>
          </div>
        )}

        {/* Private event: share link for owner */}
        {isOwner && event.visibility === 'private' && (
          <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 uppercase tracking-wide font-medium mb-2">
              <Lock size={14} className="text-sky-400" />
              <span>Private Event</span>
            </div>
            <p className="text-sm text-slate-400">
              {event.shared_with_followers
                ? 'This event is visible to your followers.'
                : 'This event is only visible to you.'}
            </p>
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

      {/* Invite Modal */}
      {showInviteModal && isOwner && (
        <InviteModal
          eventId={event.id}
          existingEmails={invitations.map((i) => i.email)}
          onClose={() => setShowInviteModal(false)}
          onInvited={(newInvs) => {
            setInvitations([...newInvs, ...invitations]);
            setShowInviteModal(false);
          }}
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

function EventVisibilityBadge({ visibility }: { visibility: string }) {
  if (visibility === 'public') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-900/60 text-emerald-300 text-[10px] font-semibold border border-emerald-700/50 backdrop-blur-sm">
        <Globe2 size={10} /> Public Event
      </span>
    );
  }
  if (visibility === 'closed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-900/60 text-amber-300 text-[10px] font-semibold border border-amber-700/50 backdrop-blur-sm">
        <UsersRound size={10} /> Closed Group
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-sky-900/60 text-sky-300 text-[10px] font-semibold border border-sky-700/50 backdrop-blur-sm">
      <Lock size={10} /> Private Event
    </span>
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

function InviteModal({
  eventId,
  existingEmails,
  onClose,
  onInvited,
}: {
  eventId: string;
  existingEmails: string[];
  onClose: () => void;
  onInvited: (invitations: EventInvitation[]) => void;
}) {
  const { user } = useAuth();
  const [emails, setEmails] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addEmail = () => {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    if (emails.includes(trimmed) || existingEmails.includes(trimmed)) { setInput(''); return; }
    setEmails([...emails, trimmed]);
    setInput('');
  };

  const removeEmail = (email: string) => {
    setEmails(emails.filter((e) => e !== email));
  };

  const handleSend = async () => {
    if (emails.length === 0 || !user) return;
    setSaving(true);
    setError(null);
    const invites = emails.map((email) => ({
      event_id: eventId,
      email,
      invited_by: user.id,
    }));
    const { data, error: err } = await supabase
      .from('event_invitations')
      .insert(invites)
      .select('*');
    setSaving(false);
    if (err) { setError(err.message); return; }
    onInvited((data as EventInvitation[]) ?? []);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">Invite by Email</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition">
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2">
          <input
            type="email"
            placeholder="friend@example.com"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
            className="flex-1 px-3 py-2.5 rounded-lg bg-slate-800 border border-slate-700 focus:border-amber-500 focus:outline-none text-sm text-white placeholder-slate-500 transition"
          />
          <button
            onClick={addEmail}
            className="px-3 py-2.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 text-sm font-medium transition flex items-center gap-1"
          >
            <Plus size={14} /> Add
          </button>
        </div>

        {emails.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {emails.map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-300"
              >
                {email}
                <button onClick={() => removeEmail(email)} className="text-slate-500 hover:text-red-400 transition">
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          onClick={handleSend}
          disabled={saving || emails.length === 0}
          className="w-full py-3 rounded-xl bg-amber-500 text-white font-semibold text-sm hover:bg-amber-400 transition disabled:opacity-50"
        >
          {saving ? 'Sending...' : `Send ${emails.length} Invitation${emails.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}
