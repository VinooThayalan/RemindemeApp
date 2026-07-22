import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { Event, Reminder, EventReminder } from '../lib/types';
import { formatCountdown, formatDateTime, formatFullDate } from '../lib/time';
import {
  CalendarDays, ChevronLeft, ChevronRight, Bell, MapPin, LocateFixed,
  Search, X, Loader2, Navigation, Clock, Ticket, Users,
} from 'lucide-react';

interface CalendarViewProps {
  onSelectEvent: (event: Event) => void;
}

interface GeoPoint { lat: number; lng: number; }

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function reverseGeocode(lat: number, lng: number): Promise<string> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`;
  return fetch(url, { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('geocode failed'))))
    .then((data) => {
      const a = data?.address ?? {};
      const parts = [
        a.suburb || a.neighbourhood || a.village || a.town || a.city,
        a.state || a.region,
      ].filter(Boolean);
      return parts.length ? parts.join(', ') : data?.display_name?.split(',').slice(0, 2).join(', ') ?? '';
    })
    .catch(() => '');
}

export function CalendarView({ onSelectEvent }: CalendarViewProps) {
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [eventReminders, setEventReminders] = useState<EventReminder[]>([]);
  const [loading, setLoading] = useState(true);

  // Calendar state
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Around-me state
  const [aroundMe, setAroundMe] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [geoPoint, setGeoPoint] = useState<GeoPoint | null>(null);
  const [geoLabel, setGeoLabel] = useState('');
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(25);
  const [searching, setSearching] = useState(false);

  const fetchBase = useCallback(async () => {
    setLoading(true);
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    start.setDate(start.getDate() - 7);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    end.setDate(end.getDate() + 7);

    const eventsRes = await supabase
      .from('events')
      .select('*')
      .gte('event_date', start.toISOString())
      .lte('event_date', end.toISOString())
      .order('event_date', { ascending: true });
    setEvents(eventsRes.data ?? []);

    if (user) {
      const [remindersRes, eventRemindersRes] = await Promise.all([
        supabase.from('reminders').select('*').order('remind_at', { ascending: true }),
        supabase
          .from('event_reminders')
          .select('*, event:events(*)')
          .eq('user_id', user.id)
          .order('remind_at', { ascending: true }),
      ]);
      setReminders(remindersRes.data ?? []);
      setEventReminders(eventRemindersRes.data ?? []);
    }
    setLoading(false);
  }, [cursor, user]);

  useEffect(() => { fetchBase(); }, [fetchBase]);

  // Month grid
  const grid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startDay = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: { date: Date; inMonth: boolean }[] = [];
    for (let i = startDay - 1; i >= 0; i--) {
      cells.push({ date: new Date(year, month, -i), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(year, month, d), inMonth: true });
    }
    while (cells.length % 7 !== 0) {
      const last = cells[cells.length - 1].date;
      cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
    }
    return cells;
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const e of events) {
      const key = ymdLocal(new Date(e.event_date));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  const remindersByDay = useMemo(() => {
    const map = new Map<string, Array<Reminder | { kind: 'event'; item: EventReminder }>>();
    for (const r of reminders) {
      const key = ymdLocal(new Date(r.remind_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    for (const er of eventReminders) {
      const key = ymdLocal(new Date(er.remind_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ kind: 'event', item: er });
    }
    return map;
  }, [reminders, eventReminders]);

  const todayKey = ymdLocal(new Date());

  // Events around me (filtered client-side by distance when geo available)
  const aroundEvents = useMemo(() => {
    if (!aroundMe) return [];
    let pool = events.filter((e) => new Date(e.event_date).getTime() > Date.now());
    if (geoPoint) {
      pool = pool
        .filter((e) => e.map_lat != null && e.map_lng != null)
        .map((e) => ({
          event: e,
          dist: haversineKm(geoPoint, { lat: e.map_lat!, lng: e.map_lng! }),
        }))
        .filter((x) => x.dist <= radiusKm)
        .sort((a, b) => a.dist - b.dist)
        .map((x) => ({ ...x.event, _dist: x.dist } as Event & { _dist: number }));
    } else if (locationQuery.trim()) {
      const q = locationQuery.trim().toLowerCase();
      pool = pool.filter((e) => (e.location ?? '').toLowerCase().includes(q));
    }
    return pool as Array<Event & { _dist?: number }>;
  }, [aroundMe, events, geoPoint, radiusKm, locationQuery]);

  const handleUseMyLocation = () => {
    setGeoError(null);
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation is not supported on this device.');
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setGeoPoint(pt);
        const label = await reverseGeocode(pt.lat, pt.lng);
        setGeoLabel(label);
        setLocationQuery(label);
        setGeoBusy(false);
      },
      (err) => {
        setGeoError(err.message || 'Unable to get your location.');
        setGeoBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const handleGeocodeSearch = async () => {
    const q = locationQuery.trim();
    if (!q) { setGeoPoint(null); setGeoLabel(''); return; }
    setSearching(true);
    setGeoError(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      const hit = Array.isArray(data) ? data[0] : null;
      if (hit?.lat && hit?.lon) {
        setGeoPoint({ lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) });
        setGeoLabel(hit.display_name?.split(',').slice(0, 2).join(', ') ?? q);
      } else {
        setGeoPoint(null);
      }
    } catch {
      setGeoError('Could not look up that location.');
    } finally {
      setSearching(false);
    }
  };

  const clearAround = () => {
    setAroundMe(false);
    setLocationQuery('');
    setGeoPoint(null);
    setGeoLabel('');
    setGeoError(null);
    setRadiusKm(25);
  };

  const selectedDayItems = useMemo(() => {
    if (!selectedDay) return null;
    const dayEvents = eventsByDay.get(selectedDay) ?? [];
    const dayReminders = remindersByDay.get(selectedDay) ?? [];
    return { dayEvents, dayReminders };
  }, [selectedDay, eventsByDay, remindersByDay]);

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Calendar</h1>
            <p className="text-sm text-slate-400 mt-0.5">Your events & reminders at a glance</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-sky-900/40 flex items-center justify-center">
            <CalendarDays size={20} className="text-sky-400" />
          </div>
        </div>

        {/* Around-me toggle */}
        <div className="px-5 pb-3">
          <div className="rounded-2xl bg-slate-800/60 border border-slate-700/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-900/40 flex items-center justify-center shrink-0">
                  <Navigation size={15} className="text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-slate-200 text-sm font-semibold">Events around me</p>
                  <p className="text-slate-500 text-xs">Show public events near a location</p>
                </div>
              </div>
              <button
                onClick={() => setAroundMe(!aroundMe)}
                aria-label="Toggle events around me"
                className={`w-11 h-6 rounded-full transition-colors duration-200 relative shrink-0 ${
                  aroundMe ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${aroundMe ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            {aroundMe && (
              <div className="mt-3 space-y-2.5">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Enter a city or address to see events there"
                    value={locationQuery}
                    onChange={(e) => { setLocationQuery(e.target.value); setGeoPoint(null); setGeoLabel(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleGeocodeSearch(); }}
                    className="w-full pl-9 pr-20 py-2.5 rounded-xl bg-slate-900 border border-slate-700 focus:border-emerald-500 focus:outline-none text-sm text-slate-200 placeholder-slate-500 transition"
                  />
                  <button
                    onClick={handleGeocodeSearch}
                    disabled={searching || !locationQuery.trim()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-slate-700 text-slate-300 text-xs font-medium hover:bg-slate-600 transition disabled:opacity-40"
                  >
                    {searching ? '...' : 'Find'}
                  </button>
                </div>

                <button
                  onClick={handleUseMyLocation}
                  disabled={geoBusy}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-emerald-900/30 text-emerald-400 border border-emerald-800/50 hover:bg-emerald-900/50 text-xs font-semibold transition disabled:opacity-50"
                >
                  {geoBusy ? <Loader2 size={13} className="animate-spin" /> : <LocateFixed size={13} />}
                  {geoBusy ? 'Locating...' : 'Use my current location'}
                </button>

                {geoError && <p className="text-xs text-red-400">{geoError}</p>}

                {geoPoint && (
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 min-w-0">
                      <MapPin size={12} className="shrink-0" />
                      <span className="truncate">{geoLabel || 'Location set'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <select
                        value={radiusKm}
                        onChange={(e) => setRadiusKm(Number(e.target.value))}
                        className="text-xs bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1 text-slate-300 focus:outline-none"
                      >
                        {[5, 10, 25, 50, 100].map((r) => (
                          <option key={r} value={r}>{r} km</option>
                        ))}
                      </select>
                      <button onClick={clearAround} className="p-1 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition">
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-4">
        {/* Around-me results take priority when enabled */}
        {aroundMe ? (
          <AroundMeResults
            events={aroundEvents}
            hasQuery={!!(geoPoint || locationQuery.trim())}
            onSelectEvent={onSelectEvent}
          />
        ) : loading ? (
          <div className="space-y-3 pt-4">
            <div className="h-7 w-40 rounded-lg bg-slate-800/60 animate-pulse" />
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-slate-800/40 animate-pulse" />
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold text-white">
                {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => { setCursor(new Date()); setSelectedDay(null); }}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium text-sky-400 hover:bg-sky-900/30 transition"
                >
                  Today
                </button>
                <button
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Weekday header */}
            <div className="grid grid-cols-7 mb-1">
              {WEEKDAYS.map((d, i) => (
                <div key={i} className="text-center text-[11px] font-semibold text-slate-500 py-1">{d}</div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {grid.map(({ date, inMonth }, i) => {
                const key = ymdLocal(date);
                const dayEvents = eventsByDay.get(key) ?? [];
                const dayReminders = remindersByDay.get(key) ?? [];
                const isToday = key === todayKey;
                const isSelected = key === selectedDay;
                const hasItems = dayEvents.length > 0 || dayReminders.length > 0;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(hasItems ? key : null)}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5 text-sm transition relative ${
                      isSelected
                        ? 'bg-sky-500 text-white'
                        : isToday
                        ? 'bg-sky-900/40 text-sky-300'
                        : hasItems
                        ? 'bg-slate-800/80 text-slate-200 hover:bg-slate-800'
                        : inMonth
                        ? 'text-slate-500 hover:bg-slate-800/50'
                        : 'text-slate-700'
                    }`}
                  >
                    <span className={`leading-none ${isToday && !isSelected ? 'font-bold' : ''}`}>{date.getDate()}</span>
                    {hasItems && (
                      <div className="flex items-center gap-0.5 h-1.5">
                        {dayEvents.length > 0 && (
                          <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-cyan-400'}`} />
                        )}
                        {dayReminders.length > 0 && (
                          <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white/80' : 'bg-sky-400'}`} />
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-center gap-5 mt-3 mb-5">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full bg-cyan-400" /> Events
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-2 h-2 rounded-full bg-sky-400" /> Reminders
              </div>
            </div>

            {/* Selected day detail */}
            {selectedDay && selectedDayItems ? (
              <DayDetail
                dayKey={selectedDay}
                dayEvents={selectedDayItems.dayEvents}
                dayReminders={selectedDayItems.dayReminders}
                onSelectEvent={onSelectEvent}
                onClose={() => setSelectedDay(null)}
              />
            ) : (
              <div className="text-center py-10">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-800 mb-3">
                  <CalendarDays size={22} className="text-slate-500" />
                </div>
                <p className="text-slate-400 text-sm font-medium">Tap a highlighted day</p>
                <p className="text-slate-500 text-xs mt-1">to see events and reminders for that date</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AroundMeResults({
  events,
  hasQuery,
  onSelectEvent,
}: {
  events: Array<Event & { _dist?: number }>;
  hasQuery: boolean;
  onSelectEvent: (e: Event) => void;
}) {
  if (!hasQuery) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 mb-4">
          <Navigation size={26} className="text-slate-500" />
        </div>
        <p className="text-slate-400 font-medium">Where do you want to look?</p>
        <p className="text-slate-500 text-sm mt-1">Enter a place above or use your current location</p>
      </div>
    );
  }
  if (events.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 mb-4">
          <MapPin size={26} className="text-slate-500" />
        </div>
        <p className="text-slate-400 font-medium">No public events nearby</p>
        <p className="text-slate-500 text-sm mt-1">Try a larger radius or a different location</p>
      </div>
    );
  }
  return (
    <div>
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-1">
        {events.length} event{events.length !== 1 ? 's' : ''} near you
      </h2>
      <div className="space-y-3">
        {events.map((event) => (
          <AroundEventCard key={event.id} event={event} onClick={() => onSelectEvent(event)} />
        ))}
      </div>
    </div>
  );
}

function AroundEventCard({ event, onClick }: { event: Event & { _dist?: number }; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group rounded-2xl bg-slate-800/80 border border-slate-700/60 overflow-hidden hover:border-emerald-600/60 hover:bg-slate-800 active:scale-[0.99] transition-all duration-150 cursor-pointer"
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-bold text-white text-base leading-tight flex-1">{event.name}</h3>
          {event._dist != null && (
            <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-900/40 text-emerald-400 text-xs font-semibold">
              {event._dist < 1 ? `${Math.round(event._dist * 1000)} m` : `${event._dist.toFixed(1)} km`}
            </span>
          )}
        </div>
        <div className="mt-2 space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Clock size={13} className="shrink-0" />
            <span>{formatDateTime(event.event_date)}</span>
            <span className="text-emerald-400 font-semibold">· {formatCountdown(event.event_date)}</span>
          </div>
          {event.location && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <MapPin size={13} className="shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
          )}
          <div className="flex items-center gap-4 pt-1">
            {event.participants && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Users size={12} /> <span className="truncate">{event.participants}</span>
              </div>
            )}
            {event.ticket_url && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <Ticket size={12} /> Tickets
              </div>
            )}
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-700/60 flex items-center justify-between">
          <span className="text-xs text-slate-500">Tap to view details & set reminder</span>
          <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1 group-hover:gap-1.5 transition-all">
            Open <ChevronRight size={13} />
          </span>
        </div>
      </div>
    </div>
  );
}

function DayDetail({
  dayKey,
  dayEvents,
  dayReminders,
  onSelectEvent,
  onClose,
}: {
  dayKey: string;
  dayEvents: Event[];
  dayReminders: Array<Reminder | { kind: 'event'; item: EventReminder }>;
  onSelectEvent: (e: Event) => void;
  onClose: () => void;
}) {
  const [d] = useMemo(() => {
    const [y, m, d] = dayKey.split('-').map(Number);
    return [new Date(y, m - 1, d)];
  }, [dayKey]);

  return (
    <div className="mt-2 rounded-2xl bg-slate-800/40 border border-slate-700/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-white text-sm">{formatFullDate(d.toISOString())}</h3>
        <button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition">
          <X size={16} />
        </button>
      </div>

      {dayEvents.length === 0 && dayReminders.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-4">Nothing scheduled this day</p>
      ) : (
        <div className="space-y-2.5">
          {dayEvents.map((event) => (
            <button
              key={event.id}
              onClick={() => onSelectEvent(event)}
              className="w-full text-left rounded-xl bg-slate-900/60 border border-slate-700/50 p-3 hover:border-cyan-600/50 transition group"
            >
              <div className="flex items-start gap-2.5">
                <div className="shrink-0 w-8 h-8 rounded-lg bg-cyan-900/50 flex items-center justify-center">
                  <CalendarDays size={15} className="text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-200 text-sm truncate">{event.name}</p>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                    <Clock size={11} /> {formatDateTime(event.event_date)}
                  </div>
                  {event.location && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                      <MapPin size={11} /> <span className="truncate">{event.location}</span>
                    </div>
                  )}
                </div>
                <ChevronRight size={15} className="text-slate-600 group-hover:text-cyan-400 transition shrink-0 mt-1" />
              </div>
            </button>
          ))}

          {dayReminders.map((r, i) => {
            const isEventReminder = 'kind' in r && r.kind === 'event';
            const title = isEventReminder ? (r.item.event?.name ?? 'Event reminder') : (r as Reminder).name;
            const when = isEventReminder ? r.item.remind_at : (r as Reminder).remind_at;
            const loc = isEventReminder ? null : (r as Reminder).location;
            const notes = isEventReminder ? r.item.notes : (r as Reminder).notes;
            return (
              <div key={i} className="rounded-xl bg-slate-900/60 border border-slate-700/50 p-3">
                <div className="flex items-start gap-2.5">
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-sky-900/50 flex items-center justify-center">
                    <Bell size={15} className="text-sky-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-200 text-sm truncate">{title}</p>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                      <Clock size={11} /> {formatDateTime(when)}
                    </div>
                    {loc && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                        <MapPin size={11} /> <span className="truncate">{loc}</span>
                      </div>
                    )}
                    {notes && <p className="text-xs text-slate-500 mt-1 italic truncate">&ldquo;{notes}&rdquo;</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
