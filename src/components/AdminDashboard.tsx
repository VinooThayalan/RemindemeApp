import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { formatDateTime } from '../lib/time';
import { Users, Calendar, Flag, ShieldCheck, TrendingUp, Bell } from 'lucide-react';

interface UserRow {
  id: string;
  display_name: string | null;
  role: string;
  is_organizer: boolean;
  created_at: string;
  event_count: number;
  reminder_count: number;
}

interface EventRow {
  id: string;
  name: string;
  event_date: string;
  location: string | null;
  created_by: string;
  reminder_count: number;
  report_count: number;
  creator_name: string | null;
}

interface ReportRow {
  id: string;
  reason: string;
  created_at: string;
  event_id: string;
  event_name: string | null;
  reporter_name: string | null;
}

type Tab = 'users' | 'events' | 'reports';

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [users, setUsers] = useState<UserRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    const { data: profiles } = await supabase.from('user_profiles').select('*').order('created_at');
    if (!profiles) return;

    const userIds = profiles.map((p) => p.id);
    const [eventsRes, remindersRes] = await Promise.all([
      supabase.from('events').select('created_by').in('created_by', userIds),
      supabase.from('event_reminders').select('user_id').in('user_id', userIds),
    ]);

    const eventsByUser: Record<string, number> = {};
    const remindersByUser: Record<string, number> = {};
    eventsRes.data?.forEach((e) => { eventsByUser[e.created_by] = (eventsByUser[e.created_by] ?? 0) + 1; });
    remindersRes.data?.forEach((r) => { remindersByUser[r.user_id] = (remindersByUser[r.user_id] ?? 0) + 1; });

    setUsers(profiles.map((p) => ({
      id: p.id,
      display_name: p.display_name,
      role: p.role,
      is_organizer: p.is_organizer,
      created_at: p.created_at,
      event_count: eventsByUser[p.id] ?? 0,
      reminder_count: remindersByUser[p.id] ?? 0,
    })));
  }, []);

  const loadEvents = useCallback(async () => {
    const { data: eventsData } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: false });
    if (!eventsData) return;

    const eventIds = eventsData.map((e) => e.id);
    const creatorIds = [...new Set(eventsData.map((e) => e.created_by))];

    const [remindersRes, reportsRes, profilesRes] = await Promise.all([
      supabase.from('event_reminders').select('event_id').in('event_id', eventIds),
      supabase.from('event_reports').select('event_id').in('event_id', eventIds),
      supabase.from('user_profiles').select('id, display_name').in('id', creatorIds),
    ]);

    const remindersByEvent: Record<string, number> = {};
    const reportsByEvent: Record<string, number> = {};
    const profileMap: Record<string, string | null> = {};

    remindersRes.data?.forEach((r) => { remindersByEvent[r.event_id] = (remindersByEvent[r.event_id] ?? 0) + 1; });
    reportsRes.data?.forEach((r) => { reportsByEvent[r.event_id] = (reportsByEvent[r.event_id] ?? 0) + 1; });
    profilesRes.data?.forEach((p) => { profileMap[p.id] = p.display_name; });

    setEvents(eventsData.map((e) => ({
      id: e.id,
      name: e.name,
      event_date: e.event_date,
      location: e.location,
      created_by: e.created_by,
      reminder_count: remindersByEvent[e.id] ?? 0,
      report_count: reportsByEvent[e.id] ?? 0,
      creator_name: profileMap[e.created_by] ?? null,
    })).sort((a, b) => b.reminder_count - a.reminder_count));
  }, []);

  const loadReports = useCallback(async () => {
    const { data: reportsData } = await supabase
      .from('event_reports')
      .select('*')
      .order('created_at', { ascending: false });
    if (!reportsData) return;

    const eventIds = [...new Set(reportsData.map((r) => r.event_id))];
    const reporterIds = [...new Set(reportsData.map((r) => r.reporter_id))];

    const [eventsRes, profilesRes] = await Promise.all([
      supabase.from('events').select('id, name').in('id', eventIds),
      supabase.from('user_profiles').select('id, display_name').in('id', reporterIds),
    ]);

    const eventMap: Record<string, string> = {};
    const profileMap: Record<string, string | null> = {};
    eventsRes.data?.forEach((e) => { eventMap[e.id] = e.name; });
    profilesRes.data?.forEach((p) => { profileMap[p.id] = p.display_name; });

    setReports(reportsData.map((r) => ({
      id: r.id,
      reason: r.reason,
      created_at: r.created_at,
      event_id: r.event_id,
      event_name: eventMap[r.event_id] ?? null,
      reporter_name: profileMap[r.reporter_id] ?? null,
    })));
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([loadUsers(), loadEvents(), loadReports()]);
      setLoading(false);
    };
    loadAll();
  }, [loadUsers, loadEvents, loadReports]);

  const topEventsByReminders = [...events].sort((a, b) => b.reminder_count - a.reminder_count).slice(0, 5);
  const totalReports = reports.length;

  const tabs: { id: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'users', label: 'Users', icon: <Users size={15} />, count: users.length },
    { id: 'events', label: 'Events', icon: <Calendar size={15} />, count: events.length },
    { id: 'reports', label: 'Reports', icon: <Flag size={15} />, count: totalReports },
  ];

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800">
        <div className="px-5 pt-5 pb-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-900/50 flex items-center justify-center">
            <ShieldCheck size={16} className="text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white leading-none">Admin Dashboard</h1>
            <p className="text-xs text-slate-500 mt-0.5">Platform overview</p>
          </div>
        </div>
        <div className="flex gap-1 px-4 pb-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition ${
                activeTab === tab.id
                  ? 'bg-amber-900/30 text-amber-400 border border-amber-700/50'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.icon}
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                activeTab === tab.id ? 'bg-amber-900/50 text-amber-400' : 'bg-slate-800 text-slate-500'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="max-w-3xl mx-auto px-4 pt-6 space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-800/60 animate-pulse" />)}
        </div>
      ) : (
        <div className="max-w-3xl mx-auto px-4 pt-4">
          {activeTab === 'users' && (
            <div className="space-y-3">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <MiniStat label="Total Users" value={users.length} />
                <MiniStat label="Organizers" value={users.filter((u) => u.is_organizer || u.role === 'organizer').length} />
                <MiniStat label="Admins" value={users.filter((u) => u.role === 'admin').length} />
              </div>
              {users.map((u) => (
                <div key={u.id} className="rounded-xl bg-slate-800/80 border border-slate-700/60 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {(u.display_name ?? 'U')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-200 text-sm">{u.display_name ?? 'Unnamed'}</p>
                        <RoleBadge role={u.role} isOrganizer={u.is_organizer} />
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">Joined {formatDateTime(u.created_at)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Calendar size={10} /> {u.event_count}</span>
                        <span className="flex items-center gap-1"><Bell size={10} /> {u.reminder_count}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'events' && (
            <div className="space-y-4">
              {/* Top events */}
              {topEventsByReminders.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={14} className="text-amber-400" />
                    <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Top by Reminders</h2>
                  </div>
                  <div className="space-y-2 mb-5">
                    {topEventsByReminders.map((e, i) => (
                      <div key={e.id} className="rounded-xl bg-amber-900/10 border border-amber-700/30 p-3 flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-amber-900/50 flex items-center justify-center text-amber-400 font-bold text-xs shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-200 font-semibold text-sm truncate">{e.name}</p>
                          <p className="text-slate-500 text-xs">{formatDateTime(e.event_date)}</p>
                        </div>
                        <div className="flex items-center gap-2 text-xs shrink-0">
                          <span className="flex items-center gap-1 text-cyan-400"><Bell size={10} />{e.reminder_count}</span>
                          {e.report_count > 0 && (
                            <span className="flex items-center gap-1 text-red-400"><Flag size={10} />{e.report_count}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">All Events</h2>
              {events.map((e) => (
                <div key={e.id} className="rounded-xl bg-slate-800/80 border border-slate-700/60 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-200 text-sm">{e.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{formatDateTime(e.event_date)}</p>
                      {e.location && <p className="text-xs text-slate-600 mt-0.5">{e.location}</p>}
                      {e.creator_name && (
                        <p className="text-xs text-slate-500 mt-1">by {e.creator_name}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0 text-xs">
                      <span className="flex items-center gap-1 text-cyan-400"><Bell size={10} />{e.reminder_count} reminders</span>
                      {e.report_count > 0 && (
                        <span className="flex items-center gap-1 text-red-400"><Flag size={10} />{e.report_count} reports</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {events.length === 0 && (
                <div className="text-center py-12 text-slate-500">No events yet</div>
              )}
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 mb-4">
                <MiniStat label="Total Reports" value={reports.length} />
                <MiniStat label="Unique Events" value={new Set(reports.map((r) => r.event_id)).size} />
              </div>
              {reports.map((r) => (
                <div key={r.id} className="rounded-xl bg-slate-800/80 border border-red-900/30 p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-red-900/40 flex items-center justify-center shrink-0">
                      <Flag size={14} className="text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {r.event_name && (
                        <p className="font-semibold text-slate-200 text-sm truncate">{r.event_name}</p>
                      )}
                      <p className="text-xs text-red-400 mt-0.5">{r.reason}</p>
                      <p className="text-xs text-slate-600 mt-1">
                        Reported by {r.reporter_name ?? 'Unknown'} &middot; {formatDateTime(r.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
              {reports.length === 0 && (
                <div className="text-center py-12 text-slate-500">No reports yet</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-slate-800/80 border border-slate-700/60 p-3 text-center">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function RoleBadge({ role, isOrganizer }: { role: string; isOrganizer: boolean }) {
  if (role === 'admin') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-900/40 text-amber-400 border border-amber-700/50">
        Admin
      </span>
    );
  }
  if (isOrganizer || role === 'organizer') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-900/40 text-sky-400 border border-sky-700/50">
        Organizer
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-700 text-slate-400">
      User
    </span>
  );
}
