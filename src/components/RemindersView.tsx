import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Reminder, EventReminder } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { formatCountdown, formatDateTime } from '../lib/time';
import { Bell, MapPin, StickyNote, Trash2, Calendar, Share2, UserCheck, Image as ImageIcon } from 'lucide-react';

export function RemindersView() {
  const { user } = useAuth();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [eventReminders, setEventReminders] = useState<EventReminder[]>([]);
  const [sharedReminders, setSharedReminders] = useState<EventReminder[]>([]);
  const [sharedPersonalReminders, setSharedPersonalReminders] = useState<(Reminder & { sharer_name?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'personal' | 'events' | 'shared'>('personal');

  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [remindersRes, eventRemindersRes, sharedRes, sharedPersonalRes] = await Promise.all([
      supabase.from('reminders').select('*').order('remind_at', { ascending: true }),
      supabase
        .from('event_reminders')
        .select('*, event:events(*)')
        .eq('user_id', user.id)
        .order('remind_at', { ascending: true }),
      supabase
        .from('event_reminders')
        .select('*, event:events(*), user_profile:user_profiles(*)')
        .neq('user_id', user.id)
        .eq('is_public', true)
        .order('created_at', { ascending: false }),
      supabase
        .from('reminders')
        .select('*, sharer:user_profiles!reminders_user_id_fkey(display_name)')
        .neq('user_id', user.id)
        .order('remind_at', { ascending: true }),
    ]);

    if (remindersRes.data) setReminders(remindersRes.data as Reminder[]);
    if (eventRemindersRes.data) setEventReminders(eventRemindersRes.data as EventReminder[]);
    if (sharedRes.data) setSharedReminders(sharedRes.data as EventReminder[]);
    if (sharedPersonalRes.data) {
      const mapped = (sharedPersonalRes.data as any[]).map((r) => ({
        ...r,
        sharer_name: r.sharer?.display_name,
      }));
      setSharedPersonalReminders(mapped);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDeletePersonal = async (id: string) => {
    await supabase.from('reminders').delete().eq('id', id);
    setReminders((prev) => prev.filter((r) => r.id !== id));
  };

  const handleDeleteEventReminder = async (id: string) => {
    await supabase.from('event_reminders').delete().eq('id', id);
    setEventReminders((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSetForMe = async (shared: EventReminder) => {
    if (!user || !shared.event) return;
    const { data } = await supabase
      .from('event_reminders')
      .insert({
        event_id: shared.event_id,
        remind_at: shared.remind_at,
        notes: shared.notes,
        is_public: false,
      })
      .select('*, event:events(*)')
      .maybeSingle();
    if (data) {
      setEventReminders((prev) => [...prev, data as EventReminder]);
      setSharedReminders((prev) => prev.filter((r) => r.id !== shared.id));
    }
  };

  const upcomingPersonal = reminders.filter((r) => new Date(r.remind_at) > new Date());
  const pastPersonal = reminders.filter((r) => new Date(r.remind_at) <= new Date());
  const upcomingEvent = eventReminders.filter((r) => new Date(r.remind_at) > new Date());
  const pastEvent = eventReminders.filter((r) => new Date(r.remind_at) <= new Date());

  const tabCount = {
    personal: reminders.length,
    events: eventReminders.length,
    shared: sharedReminders.length + sharedPersonalReminders.length,
  };

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800">
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-2xl font-bold text-white tracking-tight">Reminders</h1>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 px-4 pb-3">
          {((['personal', 'events', 'shared'] as const)).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold transition relative ${
                activeTab === tab
                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab === 'personal' ? 'Personal' : tab === 'events' ? 'Events' : 'From Following'}
              {tabCount[tab] > 0 && (
                <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeTab === tab ? 'bg-sky-500/30 text-sky-400' : 'bg-slate-700 text-slate-400'
                }`}>
                  {tabCount[tab]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="max-w-2xl mx-auto px-4 pt-4 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-2xl bg-slate-800/60 animate-pulse" />)}
        </div>
      ) : (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          {/* Personal tab */}
          {activeTab === 'personal' && (
            reminders.length === 0 ? (
              <EmptyState icon={<Bell size={28} />} text="No personal reminders" sub="Tap + to set your first reminder" />
            ) : (
              <>
                {upcomingPersonal.length > 0 && (
                  <Section label="Upcoming">
                    {upcomingPersonal.map((r) => (
                      <ReminderCard key={r.id} reminder={r} onDelete={() => handleDeletePersonal(r.id)} />
                    ))}
                  </Section>
                )}
                {pastPersonal.length > 0 && (
                  <Section label="Past">
                    {pastPersonal.map((r) => (
                      <ReminderCard key={r.id} reminder={r} onDelete={() => handleDeletePersonal(r.id)} past />
                    ))}
                  </Section>
                )}
              </>
            )
          )}

          {/* Events tab */}
          {activeTab === 'events' && (
            eventReminders.length === 0 ? (
              <EmptyState icon={<Calendar size={28} />} text="No event reminders" sub="Open an event and tap 'Set Reminder'" />
            ) : (
              <>
                {upcomingEvent.length > 0 && (
                  <Section label="Upcoming">
                    {upcomingEvent.map((r) => (
                      <EventReminderCard key={r.id} reminder={r} onDelete={() => handleDeleteEventReminder(r.id)} />
                    ))}
                  </Section>
                )}
                {pastEvent.length > 0 && (
                  <Section label="Past">
                    {pastEvent.map((r) => (
                      <EventReminderCard key={r.id} reminder={r} onDelete={() => handleDeleteEventReminder(r.id)} past />
                    ))}
                  </Section>
                )}
              </>
            )
          )}

          {/* Shared tab */}
          {activeTab === 'shared' && (
            sharedReminders.length === 0 && sharedPersonalReminders.length === 0 ? (
              <EmptyState
                icon={<Share2 size={28} />}
                text="Nothing shared yet"
                sub="Follow people to see their shared reminders here"
              />
            ) : (
              <div className="space-y-6">
                {sharedPersonalReminders.length > 0 && (
                  <Section label="Shared Reminders">
                    {sharedPersonalReminders.map((r) => (
                      <SharedPersonalReminderCard key={r.id} reminder={r} />
                    ))}
                  </Section>
                )}
                {sharedReminders.length > 0 && (
                  <Section label="Event Reminders from People You Follow">
                    {sharedReminders.map((r) => (
                      <SharedReminderCard key={r.id} reminder={r} onSetForMe={() => handleSetForMe(r)} />
                    ))}
                  </Section>
                )}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">{label}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function EmptyState({ icon, text, sub }: { icon: React.ReactNode; text: string; sub: string }) {
  return (
    <div className="text-center py-20">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 mb-4 text-slate-500">
        {icon}
      </div>
      <p className="text-slate-400 font-medium">{text}</p>
      <p className="text-slate-500 text-sm mt-1">{sub}</p>
    </div>
  );
}

function ReminderCard({ reminder, onDelete, past }: { reminder: Reminder; onDelete: () => void; past?: boolean }) {
  return (
    <div className={`rounded-2xl border transition overflow-hidden ${
      past ? 'bg-slate-800/30 border-slate-800 opacity-60' : 'bg-slate-800/80 border-slate-700/60'
    }`}>
      {reminder.image_url && (
        <div className="relative h-32">
          <img src={reminder.image_url} alt={reminder.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
            reminder.image_url ? 'bg-black/40' : 'bg-sky-900/50'
          }`}>
            {reminder.image_url
              ? <ImageIcon size={17} className="text-sky-300" />
              : <Bell size={17} className="text-sky-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-semibold text-slate-200 ${past ? 'line-through' : ''}`}>{reminder.name}</p>
            <p className="text-sm text-slate-500 mt-0.5">{formatDateTime(reminder.remind_at)}</p>
            {!past && <p className="text-sm font-semibold text-sky-400 mt-1">{formatCountdown(reminder.remind_at)}</p>}
            {reminder.location && (
              <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-1.5">
                <MapPin size={12} /><span className="truncate">{reminder.location}</span>
              </div>
            )}
            {reminder.notes && (
              <div className="flex items-start gap-1.5 text-sm text-slate-500 mt-1">
                <StickyNote size={12} className="mt-0.5 shrink-0" /><span>{reminder.notes}</span>
              </div>
            )}
            {reminder.shared_with_followers && (
              <div className="flex items-center gap-1 text-xs text-sky-600 mt-1.5">
                <Share2 size={10} /> Shared with followers
              </div>
            )}
          </div>
          <button onClick={onDelete} className="shrink-0 p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-900/20 transition">
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function EventReminderCard({ reminder, onDelete, past }: { reminder: EventReminder; onDelete: () => void; past?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 transition ${
      past ? 'bg-slate-800/30 border-slate-800 opacity-60' : 'bg-slate-800/80 border-slate-700/60'
    }`}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-cyan-900/50 flex items-center justify-center">
          <Calendar size={17} className="text-cyan-400" />
        </div>
        <div className="flex-1 min-w-0">
          {reminder.event && (
            <p className="text-xs text-slate-500 font-medium truncate mb-0.5">{reminder.event.name}</p>
          )}
          <p className="text-sm text-slate-500 mt-0.5">{formatDateTime(reminder.remind_at)}</p>
          {!past && <p className="text-sm font-semibold text-cyan-400 mt-1">{formatCountdown(reminder.remind_at)}</p>}
          {reminder.notes && (
            <div className="flex items-start gap-1.5 text-sm text-slate-500 mt-1">
              <StickyNote size={12} className="mt-0.5 shrink-0" /><span>{reminder.notes}</span>
            </div>
          )}
          {reminder.is_public && (
            <div className="flex items-center gap-1 text-xs text-cyan-600 mt-1.5">
              <Share2 size={10} /> Shared with followers
            </div>
          )}
        </div>
        <button onClick={onDelete} className="shrink-0 p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-900/20 transition">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

function SharedPersonalReminderCard({ reminder }: { reminder: Reminder & { sharer_name?: string } }) {
  return (
    <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 overflow-hidden">
      {reminder.image_url && (
        <div className="relative h-32">
          <img src={reminder.image_url} alt={reminder.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent" />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${reminder.image_url ? 'bg-black/40' : 'bg-sky-900/50'}`}>
            <Bell size={17} className="text-sky-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-200">{reminder.name}</p>
            <p className="text-sm text-slate-500 mt-0.5">{formatDateTime(reminder.remind_at)}</p>
            <p className="text-sm font-semibold text-sky-400 mt-1">{formatCountdown(reminder.remind_at)}</p>
            {reminder.location && (
              <div className="flex items-center gap-1.5 text-sm text-slate-500 mt-1.5">
                <MapPin size={12} /><span className="truncate">{reminder.location}</span>
              </div>
            )}
            {reminder.sharer_name && (
              <div className="flex items-center gap-1.5 text-xs text-slate-600 mt-1.5">
                <UserCheck size={10} /> Shared by {reminder.sharer_name}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SharedReminderCard({ reminder, onSetForMe }: { reminder: EventReminder; onSetForMe: () => void }) {
  const [setting, setSetting] = useState(false);
  const [done, setDone] = useState(false);

  const handle = async () => {
    setSetting(true);
    await onSetForMe();
    setSetting(false);
    setDone(true);
  };

  return (
    <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center">
          {reminder.user_profile ? (
            <span className="text-white font-bold text-sm">
              {(reminder.user_profile.display_name ?? 'U')[0].toUpperCase()}
            </span>
          ) : (
            <Bell size={17} className="text-slate-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          {reminder.user_profile && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
              <UserCheck size={10} />
              <span>{reminder.user_profile.display_name ?? 'Someone you follow'}</span>
            </div>
          )}
          {reminder.event && (
            <p className="font-semibold text-slate-200 text-sm truncate">{reminder.event.name}</p>
          )}
          <p className="text-sm text-slate-500 mt-0.5">{formatDateTime(reminder.remind_at)}</p>
          <p className="text-sm font-semibold text-sky-400 mt-1">{formatCountdown(reminder.remind_at)}</p>
          {reminder.notes && (
            <p className="text-xs text-slate-500 mt-1.5 italic">&ldquo;{reminder.notes}&rdquo;</p>
          )}
        </div>
        <button
          onClick={handle}
          disabled={setting || done}
          className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            done
              ? 'bg-emerald-900/30 text-emerald-400 border border-emerald-800/50'
              : 'bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30'
          }`}
        >
          {done ? <><Bell size={11} /> Set!</> : setting ? '...' : <><Bell size={11} /> Set for me</>}
        </button>
      </div>
    </div>
  );
}
