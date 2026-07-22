import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Event, SubEvent } from '../lib/types';
import { useAuth } from '../context/AuthContext';
import { formatFullDate, formatInTimezone } from '../lib/time';
import {
  ChevronLeft, Eye, Users, Bell, Ticket, BarChart3,
  TrendingUp, Calendar, CheckCircle2, Circle, Wifi, MapPin,
  Globe2, Lock, UsersRound,
} from 'lucide-react';

interface EventInsightsProps {
  event: Event;
  onBack: () => void;
}

interface SubEventReminderCount {
  sub_event_id: string;
  title: string;
  start_time: string;
  reminder_count: number;
}

export function EventInsights({ event, onBack }: EventInsightsProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [viewCount, setViewCount] = useState(0);
  const [uniqueViewers, setUniqueViewers] = useState(0);
  const [rsvpCounts, setRsvpCounts] = useState({ going: 0, maybe: 0, not_going: 0 });
  const [reminderCount, setReminderCount] = useState(0);
  const [subEvents, setSubEvents] = useState<SubEvent[]>([]);
  const [subEventReminderCounts, setSubEventReminderCounts] = useState<SubEventReminderCount[]>([]);
  const [recentViews, setRecentViews] = useState<{ viewed_at: string; viewer_id: string | null }[]>([]);
  const [dailyViews, setDailyViews] = useState<{ date: string; count: number }[]>([]);

  const isOwner = user?.id === event.created_by;
  const isOnline = event.event_mode === 'online';

  useEffect(() => {
    if (!isOwner) return;
    const load = async () => {
      setLoading(true);

      const [viewsRes, rsvpRes, reminderRes, subRes] = await Promise.all([
        supabase.from('event_views').select('viewer_id, viewed_at').eq('event_id', event.id).order('viewed_at', { ascending: false }),
        supabase.from('event_rsvps').select('status').eq('event_id', event.id),
        supabase.from('event_reminders').select('remind_at, notes').eq('event_id', event.id),
        supabase.from('sub_events').select('*').eq('event_id', event.id).order('sort_order', { ascending: true }),
      ]);

      if (viewsRes.data) {
        setViewCount(viewsRes.data.length);
        const uniqueIds = new Set(viewsRes.data.map((v: { viewer_id: string | null }) => v.viewer_id).filter(Boolean));
        setUniqueViewers(uniqueIds.size);
        setRecentViews(viewsRes.data.slice(0, 10).map((v: { viewer_id: string | null; viewed_at: string }) => ({
          viewed_at: v.viewed_at,
          viewer_id: v.viewer_id,
        })));

        // Build daily view chart (last 14 days)
        const dayMap: Record<string, number> = {};
        const now = new Date();
        for (let i = 13; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const key = d.toISOString().slice(0, 10);
          dayMap[key] = 0;
        }
        viewsRes.data.forEach((v: { viewed_at: string }) => {
          const key = v.viewed_at.slice(0, 10);
          if (key in dayMap) dayMap[key]++;
        });
        setDailyViews(Object.entries(dayMap).map(([date, count]) => ({ date, count })));
      }

      if (rsvpRes.data) {
        const counts = { going: 0, maybe: 0, not_going: 0 };
        rsvpRes.data.forEach((r: { status: 'going' | 'maybe' | 'not_going' }) => {
          counts[r.status]++;
        });
        setRsvpCounts(counts);
      }

      if (reminderRes.data) {
        setReminderCount(reminderRes.data.length);
      }

      if (subRes.data) {
        const subEventsData = subRes.data as SubEvent[];
        setSubEvents(subEventsData);

        // Count reminders matching each sub-event's start_time
        if (reminderRes.data && subEventsData.length > 0) {
          const timeCounts: Record<string, number> = {};
          reminderRes.data.forEach((r: { remind_at: string }) => {
            timeCounts[r.remind_at] = (timeCounts[r.remind_at] || 0) + 1;
          });
          setSubEventReminderCounts(subEventsData.map((s) => ({
            sub_event_id: s.id,
            title: s.title,
            start_time: s.start_time,
            reminder_count: timeCounts[s.start_time] || 0,
          })));
        }
      }

      setLoading(false);
    };
    load();
  }, [event.id, event.created_by, isOwner]);

  if (!isOwner) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <p>Only the event organizer can view insights.</p>
      </div>
    );
  }

  const maxDailyViews = Math.max(...dailyViews.map((d) => d.count), 1);
  const totalRsvps = rsvpCounts.going + rsvpCounts.maybe + rsvpCounts.not_going;
  const rsvpRate = viewCount > 0 ? Math.round((totalRsvps / viewCount) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg hover:bg-slate-800 transition"
          >
            <ChevronLeft size={22} className="text-slate-300" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-sky-400 shrink-0" />
              <h1 className="text-base font-bold text-white truncate">Insights</h1>
            </div>
            <p className="text-xs text-slate-500 truncate">{event.name}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-slate-700 border-t-sky-400 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Event summary card */}
            <div className="rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900 border border-slate-700/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-white">{event.name}</h2>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      event.visibility === 'public' ? 'bg-emerald-900/40 text-emerald-400 border-emerald-800/40' :
                      event.visibility === 'closed' ? 'bg-amber-900/40 text-amber-400 border-amber-800/40' :
                      'bg-sky-900/40 text-sky-400 border-sky-800/40'
                    }`}>
                      {event.visibility === 'public' && <Globe2 size={9} />}
                      {event.visibility === 'closed' && <UsersRound size={9} />}
                      {event.visibility === 'private' && <Lock size={9} />}
                      {event.visibility === 'public' ? 'Public' : event.visibility === 'closed' ? 'Closed' : 'Private'}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      isOnline ? 'bg-sky-900/40 text-sky-400 border-sky-800/40' : 'bg-emerald-900/40 text-emerald-400 border-emerald-800/40'
                    }`}>
                      {isOnline ? <Wifi size={9} /> : <MapPin size={9} />}
                      {isOnline ? 'Online' : 'In Person'}
                    </span>
                  </div>
                </div>
                {event.image_url && (
                  <img
                    src={event.image_url}
                    alt={event.name}
                    className="w-14 h-14 rounded-xl object-cover shrink-0 border border-slate-700"
                  />
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-3">
                <Calendar size={12} />
                <span>{formatFullDate(event.event_date)}</span>
              </div>
            </div>

            {/* Key metrics grid */}
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                icon={<Eye size={18} />}
                label="Total Views"
                value={viewCount}
                subtext={`${uniqueViewers} unique viewers`}
                color="sky"
              />
              <MetricCard
                icon={<Bell size={18} />}
                label="Reminders Set"
                value={reminderCount}
                subtext="Across all segments"
                color="amber"
              />
              <MetricCard
                icon={<Users size={18} />}
                label="RSVPs"
                value={totalRsvps}
                subtext={`${rsvpRate}% conversion rate`}
                color="emerald"
              />
              <MetricCard
                icon={<Ticket size={18} />}
                label="Ticket Link"
                value={event.ticket_url ? 'Yes' : 'No'}
                subtext={event.ticket_url ? 'Available' : 'Not set'}
                color="slate"
              />
            </div>

            {/* RSVP breakdown */}
            <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-4">
              <div className="flex items-center gap-2 mb-4">
                <Users size={16} className="text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-200">RSVP Breakdown</h3>
              </div>
              <div className="space-y-3">
                <RsvpBar label="Going" count={rsvpCounts.going} total={totalRsvps} color="bg-emerald-500" textColor="text-emerald-400" />
                <RsvpBar label="Maybe" count={rsvpCounts.maybe} total={totalRsvps} color="bg-amber-500" textColor="text-amber-400" />
                <RsvpBar label="Can't Go" count={rsvpCounts.not_going} total={totalRsvps} color="bg-red-500" textColor="text-red-400" />
              </div>
            </div>

            {/* Views over time chart */}
            {dailyViews.length > 0 && (
              <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={16} className="text-sky-400" />
                  <h3 className="text-sm font-bold text-slate-200">Views (Last 14 Days)</h3>
                </div>
                <div className="flex items-end justify-between gap-1 h-32">
                  {dailyViews.map((d) => (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group">
                      <div
                        className="w-full rounded-t bg-gradient-to-t from-sky-600 to-sky-400 transition-all duration-300 hover:from-sky-500 hover:to-sky-300 relative"
                        style={{ height: `${(d.count / maxDailyViews) * 100}%`, minHeight: d.count > 0 ? '4px' : '2px' }}
                      >
                        {d.count > 0 && (
                          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-sky-400 font-bold opacity-0 group-hover:opacity-100 transition">
                            {d.count}
                          </span>
                        )}
                      </div>
                      <span className="text-[8px] text-slate-600">{d.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sub-event reminder breakdown */}
            {subEvents.length > 0 && (
              <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Bell size={16} className="text-amber-400" />
                  <h3 className="text-sm font-bold text-slate-200">Sub-event Reminders</h3>
                </div>
                <div className="space-y-2.5">
                  {subEventReminderCounts.map((s) => (
                    <div key={s.sub_event_id} className="flex items-center gap-3">
                      <div className="shrink-0">
                        {s.reminder_count > 0
                          ? <CheckCircle2 size={16} className="text-sky-400" />
                          : <Circle size={16} className="text-slate-600" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 truncate">{s.title}</p>
                        <p className="text-[10px] text-slate-500">{formatInTimezone(s.start_time, event.timezone)}</p>
                      </div>
                      <span className={`text-sm font-bold ${s.reminder_count > 0 ? 'text-sky-400' : 'text-slate-600'}`}>
                        {s.reminder_count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent views list */}
            {recentViews.length > 0 && (
              <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Eye size={16} className="text-slate-400" />
                  <h3 className="text-sm font-bold text-slate-200">Recent Views</h3>
                </div>
                <div className="space-y-2">
                  {recentViews.map((v, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center">
                          <span className="text-[10px] text-slate-400 font-semibold">
                            {v.viewer_id ? 'U' : 'A'}
                          </span>
                        </div>
                        <span className="text-slate-400">
                          {v.viewer_id ? 'Registered user' : 'Anonymous'}
                        </span>
                      </div>
                      <span className="text-slate-600">
                        {new Date(v.viewed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon, label, value, subtext, color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  subtext: string;
  color: 'sky' | 'amber' | 'emerald' | 'slate';
}) {
  const colorMap = {
    sky: 'text-sky-400 bg-sky-900/30',
    amber: 'text-amber-400 bg-amber-900/30',
    emerald: 'text-emerald-400 bg-emerald-900/30',
    slate: 'text-slate-400 bg-slate-700/30',
  };
  return (
    <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${colorMap[color]}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs font-semibold text-slate-400 mt-0.5">{label}</p>
      <p className="text-[10px] text-slate-600 mt-0.5">{subtext}</p>
    </div>
  );
}

function RsvpBar({
  label, count, total, color, textColor,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
  textColor: string;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-semibold ${textColor}`}>{label}</span>
        <span className="text-xs text-slate-500">{count}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-900 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
