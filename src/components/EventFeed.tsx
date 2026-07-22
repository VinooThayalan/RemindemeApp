import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Event } from '../lib/types';
import { formatCountdown, formatDateTime } from '../lib/time';
import { MapPin, Ticket, Users, Calendar, Search, SlidersHorizontal, Bell, Globe2, Lock, UsersRound } from 'lucide-react';

interface EventFeedProps {
  onSelectEvent: (event: Event) => void;
}

export function EventFeed({ onSelectEvent }: EventFeedProps) {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [reminderEventIds, setReminderEventIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true });

    if (locationFilter) query = query.ilike('location', `%${locationFilter}%`);
    if (dateFilter) {
      const start = new Date(dateFilter);
      const end = new Date(dateFilter);
      end.setDate(end.getDate() + 1);
      query = query.gte('event_date', start.toISOString()).lt('event_date', end.toISOString());
    }

    const { data, error } = await query;
    if (!error) setEvents(data || []);
    setLoading(false);
  }, [locationFilter, dateFilter]);

  const fetchUserData = useCallback(async () => {
    if (!user) return;
    const [hiddenRes, reminderRes] = await Promise.all([
      supabase.from('hidden_events').select('event_id').eq('user_id', user.id),
      supabase.from('event_reminders').select('event_id').eq('user_id', user.id),
    ]);
    if (hiddenRes.data) setHiddenIds(new Set(hiddenRes.data.map((r) => r.event_id)));
    if (reminderRes.data) setReminderEventIds(new Set(reminderRes.data.map((r) => r.event_id)));
  }, [user]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useEffect(() => { fetchUserData(); }, [fetchUserData]);

  const filtered = events
    .filter((e) => !hiddenIds.has(e.id))
    .filter((e) => !searchQuery || e.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const upcoming = filtered.filter((e) => new Date(e.event_date).getTime() > Date.now());
  const past = filtered.filter((e) => new Date(e.event_date).getTime() <= Date.now());

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800">
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-2xl font-bold text-white tracking-tight">Discover</h1>
          <p className="text-sm text-slate-400 mt-0.5">Find events near you</p>
        </div>
        <div className="px-5 pb-3 flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-sm text-slate-200 placeholder-slate-500 transition"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`p-2.5 rounded-xl border transition ${
              showFilters ? 'bg-sky-900/50 border-sky-500 text-sky-400' : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>
        {showFilters && (
          <div className="px-5 pb-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Location</label>
              <input
                type="text"
                placeholder="Filter by location"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-sm text-slate-200 placeholder-slate-500 transition"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Date</label>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-sm text-slate-200 transition"
              />
            </div>
            {(locationFilter || dateFilter) && (
              <button
                onClick={() => { setLocationFilter(''); setDateFilter(''); }}
                className="text-sm text-sky-400 font-medium hover:text-sky-300 transition"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 pt-4">
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-2xl bg-slate-800/60 overflow-hidden animate-pulse">
                <div className="h-44 bg-slate-700/60" />
                <div className="p-4 space-y-3">
                  <div className="h-5 bg-slate-700/60 rounded w-3/4" />
                  <div className="h-4 bg-slate-700/60 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 mb-4">
              <Calendar size={28} className="text-slate-500" />
            </div>
            <p className="text-slate-400 font-medium">No events found</p>
            <p className="text-slate-500 text-sm mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <>
            {upcoming.length > 0 && (
              <div className="mb-6">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">
                  Upcoming
                </h2>
                <div className="space-y-4">
                  {upcoming.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      hasReminder={reminderEventIds.has(event.id)}
                      onClick={() => onSelectEvent(event)}
                    />
                  ))}
                </div>
              </div>
            )}
            {past.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">
                  Past Events
                </h2>
                <div className="space-y-4">
                  {past.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      hasReminder={reminderEventIds.has(event.id)}
                      onClick={() => onSelectEvent(event)}
                    />
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

function EventCard({
  event,
  hasReminder,
  onClick,
}: {
  event: Event;
  hasReminder: boolean;
  onClick: () => void;
}) {
  const isPast = new Date(event.event_date).getTime() <= Date.now();

  return (
    <div
      onClick={onClick}
      className="group rounded-2xl bg-slate-800/80 border border-slate-700/60 overflow-hidden hover:border-slate-600 hover:bg-slate-800 active:scale-[0.99] transition-all duration-150 cursor-pointer"
    >
      {event.image_url ? (
        <div className="relative h-44 overflow-hidden">
          <img
            src={event.image_url}
            alt={event.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent" />
          <div className="absolute top-3 right-3 flex gap-2">
            {hasReminder && (
              <div className="px-2.5 py-1 rounded-full bg-cyan-500/90 backdrop-blur-sm text-white text-xs font-semibold flex items-center gap-1">
                <Bell size={10} />
                Reminded
              </div>
            )}
            {!isPast && (
              <div className="px-2.5 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-white text-xs font-semibold">
                {formatCountdown(event.event_date)}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="relative h-32 bg-gradient-to-br from-sky-500 via-cyan-500 to-blue-600 flex items-end p-4">
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: "radial-gradient(circle, white 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }} />
          <div className="absolute top-3 right-3 flex gap-2">
            {hasReminder && (
              <div className="px-2.5 py-1 rounded-full bg-white/90 text-slate-800 text-xs font-semibold flex items-center gap-1">
                <Bell size={10} />
                Reminded
              </div>
            )}
            {!isPast && (
              <div className="px-2.5 py-1.5 rounded-full bg-black/30 backdrop-blur-sm text-white text-xs font-semibold">
                {formatCountdown(event.event_date)}
              </div>
            )}
          </div>
          <p className="text-white/90 font-medium text-sm relative z-10">{formatDateTime(event.event_date)}</p>
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <VisibilityBadge visibility={event.visibility} />
        </div>
        <h3 className="font-bold text-white text-base leading-tight">{event.name}</h3>
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Calendar size={13} className="shrink-0" />
            <span>{formatDateTime(event.event_date)}</span>
          </div>
          {event.location && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <MapPin size={13} className="shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
          {event.participants && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Users size={13} className="shrink-0" />
              <span className="truncate">{event.participants}</span>
            </div>
          )}
          {event.ticket_url && (
            <div className="flex items-center gap-2 text-sm text-emerald-400">
              <Ticket size={13} className="shrink-0" />
              <span>Tickets available</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VisibilityBadge({ visibility }: { visibility: string }) {
  if (visibility === 'public') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 text-[10px] font-semibold border border-emerald-800/40">
        <Globe2 size={9} /> Public
      </span>
    );
  }
  if (visibility === 'closed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400 text-[10px] font-semibold border border-amber-800/40">
        <UsersRound size={9} /> Closed Group
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sky-900/40 text-sky-400 text-[10px] font-semibold border border-sky-800/40">
      <Lock size={9} /> Private
    </span>
  );
}
