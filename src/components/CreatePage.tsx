import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { CreateMode, EventVisibility } from '../lib/types';
import { fromLocalInput, fromDateAndTime, formatFullDate, formatCountdown, COMMON_TIMEZONES } from '../lib/time';
import {
  Camera, X, Check, ChevronLeft, Bell, CalendarPlus,
  MapPin, Link2, FileText, Users, StickyNote, Clock, Globe,
  Globe2, Lock, Mail, Plus, Share2, ScanLine, Loader2, Sparkles,
} from 'lucide-react';

interface CreatePageProps {
  onBack: () => void;
  onCreated: () => void;
  initialMode?: CreateMode;
}

interface ExtractedInfo {
  name: string | null;
  date: string | null;
  time: string | null;
  end_date: string | null;
  end_time: string | null;
  location: string | null;
  description: string | null;
  ticket_url: string | null;
  participants: string | null;
  timezone: string | null;
}

const VISIBILITY_OPTIONS: {
  value: EventVisibility;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    value: 'public',
    label: 'Public Event',
    description: 'Visible to everyone in the feed and calendar',
    icon: <Globe2 size={16} className="text-emerald-400" />,
  },
  {
    value: 'closed',
    label: 'Closed Group',
    description: 'Invite people by email or share a private link',
    icon: <Users size={16} className="text-amber-400" />,
  },
  {
    value: 'private',
    label: 'Private Event',
    description: 'Only you can see it — optionally share with followers',
    icon: <Lock size={16} className="text-sky-400" />,
  },
];

export function CreatePage({ onBack, onCreated, initialMode = 'reminder' }: CreatePageProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<CreateMode>(initialMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPreview, setSavedPreview] = useState<{ name: string; date: string; mode: CreateMode } | null>(null);

  const [name, setName] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [timezone, setTimezone] = useState('');
  const [location, setLocation] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
  const [agenda, setAgenda] = useState('');
  const [participants, setParticipants] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const [visibility, setVisibility] = useState<EventVisibility>('public');
  const [sharedWithFollowers, setSharedWithFollowers] = useState(false);
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');

  // Reminder sharing
  const [reminderShared, setReminderShared] = useState(false);
  const [reminderInviteEmails, setReminderInviteEmails] = useState<string[]>([]);
  const [reminderEmailInput, setReminderEmailInput] = useState('');

  // Poster scanning
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanApplied, setScanApplied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('event-images')
      .upload(fileName, file, { contentType: file.type });
    if (uploadError) { setError('Failed to upload image: ' + uploadError.message); return; }
    const { data } = supabase.storage.from('event-images').getPublicUrl(fileName);
    setImageUrl(data.publicUrl);
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleScanPoster = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    setScanError(null);
    setScanApplied(false);

    try {
      const base64 = await fileToBase64(file);

      // Upload the image to storage first
      const ext = file.name.split('.').pop();
      const fileName = `scan_${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('event-images')
        .upload(fileName, file, { contentType: file.type });
      if (!uploadError) {
        const { data } = supabase.storage.from('event-images').getPublicUrl(fileName);
        setImageUrl(data.publicUrl);
      }

      // Call the edge function to extract info
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`${supabaseUrl}/functions/v1/extract-poster`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session?.access_token ?? ''}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ image_base64: base64 }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody.error || `Extraction failed (${response.status})`);
      }

      const result = await response.json();
      const extracted: ExtractedInfo = result.extracted;

      // Apply extracted fields — user can edit everything before saving
      if (extracted.name) setName(extracted.name);
      if (extracted.date) {
        setStartDate(extracted.date);
        if (extracted.time) setStartTime(extracted.time);
      } else if (mode === 'reminder' && extracted.date) {
        const datePart = extracted.date;
        const timePart = extracted.time || '00:00';
        setDateTime(`${datePart}T${timePart}`);
      }
      if (extracted.end_date) setEndDate(extracted.end_date);
      if (extracted.end_time) setEndTime(extracted.end_time);
      if (extracted.location) setLocation(extracted.location);
      if (extracted.ticket_url) setTicketUrl(extracted.ticket_url);
      if (extracted.participants) setParticipants(extracted.participants);
      if (extracted.timezone) setTimezone(extracted.timezone);
      if (extracted.description) setNotes(extracted.description);

      // For reminder mode, if we got a date but no time, build the datetime
      if (mode === 'reminder' && extracted.date) {
        const timePart = extracted.time || '00:00';
        setDateTime(`${extracted.date}T${timePart}`);
      }

      setScanApplied(true);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Failed to scan poster');
    } finally {
      setScanning(false);
    }
  };

  const addEmail = () => {
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    if (inviteEmails.includes(trimmed)) return;
    setInviteEmails([...inviteEmails, trimmed]);
    setEmailInput('');
  };

  const removeEmail = (email: string) => {
    setInviteEmails(inviteEmails.filter((e) => e !== email));
  };

  const addReminderEmail = () => {
    const trimmed = reminderEmailInput.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return;
    if (reminderInviteEmails.includes(trimmed)) return;
    setReminderInviteEmails([...reminderInviteEmails, trimmed]);
    setReminderEmailInput('');
  };

  const removeReminderEmail = (email: string) => {
    setReminderInviteEmails(reminderInviteEmails.filter((e) => e !== email));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!user) { setError('Please sign in first'); return; }

    if (mode === 'reminder') {
      if (!name || !dateTime) { setError('Name and date/time are required'); return; }
    } else {
      if (!name || !startDate) { setError('Name and start date are required'); return; }
      if (endDate && new Date(`${endDate}T${endTime || '23:59'}`).getTime() < new Date(`${startDate}T${startTime || '00:00'}`).getTime()) {
        setError('End date cannot be before the start date'); return;
      }
    }

    setSaving(true);

    if (mode === 'reminder') {
      const isoDate = fromLocalInput(dateTime);
      const { data: reminderData, error: dbError } = await supabase.from('reminders').insert({
        name, remind_at: isoDate, location: location || null, notes: notes || null,
        image_url: imageUrl, shared_with_followers: reminderShared,
      }).select().single();

      if (dbError) { setError(dbError.message); setSaving(false); return; }

      if (reminderInviteEmails.length > 0 && reminderData) {
        const invites = reminderInviteEmails.map((email) => ({
          reminder_id: reminderData.id,
          email,
          invited_by: user.id,
        }));
        const { error: inviteError } = await supabase.from('reminder_invitations').insert(invites);
        if (inviteError) {
          setError('Reminder created, but some invitations failed: ' + inviteError.message);
          setSaving(false);
          return;
        }
      }
    } else {
      const isoStart = fromDateAndTime(startDate, startTime);
      const isoEnd = endDate ? fromDateAndTime(endDate, endTime || '23:59') : null;
      const { data: eventData, error: dbError } = await supabase.from('events').insert({
        name, event_date: isoStart, end_date: isoEnd,
        timezone: timezone || null, location: location || null,
        ticket_url: ticketUrl || null, agenda: agenda || null,
        participants: participants || null, image_url: imageUrl,
        visibility, shared_with_followers: visibility === 'private' ? sharedWithFollowers : false,
      }).select().single();

      if (dbError) { setError(dbError.message); setSaving(false); return; }

      if (visibility === 'closed' && inviteEmails.length > 0 && eventData) {
        const invites = inviteEmails.map((email) => ({
          event_id: eventData.id,
          email,
          invited_by: user.id,
        }));
        const { error: inviteError } = await supabase.from('event_invitations').insert(invites);
        if (inviteError) {
          setError('Event created, but some invitations failed: ' + inviteError.message);
          setSaving(false);
          return;
        }
      }
    }

    setSaving(false);
    const previewDate = mode === 'reminder' ? fromLocalInput(dateTime) : fromDateAndTime(startDate, startTime);
    setSavedPreview({ name, date: previewDate, mode });
  };

  if (savedPreview) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-900/50 mb-5">
            <Check size={38} className="text-emerald-400" strokeWidth={2.5} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">
            {savedPreview.mode === 'reminder' ? 'Reminder Set!' : 'Event Published!'}
          </h2>
          <p className="text-slate-400 mb-6 truncate">{savedPreview.name}</p>

          {imageUrl && (
            <div className="rounded-2xl overflow-hidden mb-4 max-h-40">
              <img src={imageUrl} alt="Poster" className="w-full h-40 object-cover" />
            </div>
          )}

          <div className="rounded-2xl bg-slate-800/80 border border-slate-700/60 p-5 mb-6 text-left">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-sky-900/50 flex items-center justify-center">
                {savedPreview.mode === 'reminder'
                  ? <Bell size={20} className="text-sky-400" />
                  : <CalendarPlus size={20} className="text-sky-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-white truncate">{savedPreview.name}</p>
                <p className="text-sm text-slate-400 mt-1">{formatFullDate(savedPreview.date)}</p>
                <p className="text-sm font-semibold text-sky-400 mt-2">{formatCountdown(savedPreview.date)}</p>
              </div>
            </div>
          </div>

          <button
            onClick={() => { onCreated(); onBack(); }}
            className="w-full py-3.5 rounded-xl bg-white text-slate-900 font-semibold hover:bg-slate-100 active:scale-[0.98] transition"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-10">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur-xl border-b border-slate-800">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-slate-800 transition">
            <ChevronLeft size={22} className="text-slate-300" />
          </button>
          <h1 className="font-semibold text-white">
            {mode === 'reminder' ? 'New Reminder' : 'New Event'}
          </h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => scanInputRef.current?.click()}
              disabled={scanning}
              className="p-2 -mr-1 rounded-lg hover:bg-slate-800 transition disabled:opacity-50"
              title="Scan poster to auto-fill"
            >
              {scanning ? <Loader2 size={20} className="text-sky-400 animate-spin" /> : <ScanLine size={20} className="text-sky-400" />}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 -mr-2 rounded-lg hover:bg-slate-800 transition"
              title="Upload image"
            >
              <Camera size={22} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Mode toggle — always available to all users */}
        <div className="px-4 pb-3">
          <div className="flex bg-slate-800 rounded-xl p-1">
            <button
              onClick={() => setMode('reminder')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition ${
                mode === 'reminder' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Bell size={14} /> Reminder
            </button>
            <button
              onClick={() => setMode('event')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition ${
                mode === 'event' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <CalendarPlus size={14} /> Event
            </button>
          </div>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" />
      <input ref={scanInputRef} type="file" accept="image/*" capture="environment" onChange={handleScanPoster} className="hidden" />

      {/* Scan status banner */}
      {scanApplied && !scanning && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="rounded-xl bg-emerald-900/30 border border-emerald-800/50 px-4 py-3 flex items-center gap-2 text-sm text-emerald-400">
            <Sparkles size={16} />
            <span>Poster scanned! Review and edit the details below.</span>
            <button onClick={() => setScanApplied(false)} className="ml-auto text-emerald-600 hover:text-emerald-400">
              <X size={14} />
            </button>
          </div>
        </div>
      )}
      {scanError && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="rounded-xl bg-red-900/30 border border-red-800/50 px-4 py-3 flex items-center gap-2 text-sm text-red-400">
            <span>{scanError}</span>
            <button onClick={() => setScanError(null)} className="ml-auto text-red-600 hover:text-red-400">
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {imageUrl && (
        <div className="max-w-2xl mx-auto px-4 pt-4">
          <div className="relative rounded-2xl overflow-hidden">
            <img src={imageUrl} alt="Poster" className="w-full h-48 object-cover" />
            <button
              onClick={() => setImageUrl(null)}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 pt-4 space-y-4">
        <Field label="Name" required>
          <input
            type="text"
            placeholder={mode === 'reminder' ? 'e.g. Doctor appointment' : 'e.g. Summer Music Festival'}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-white placeholder-slate-500 transition"
          />
        </Field>

        {mode === 'reminder' ? (
          <>
            <Field label="Date & Time" required>
              <input
                type="datetime-local"
                value={dateTime}
                onChange={(e) => setDateTime(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-white transition"
              />
            </Field>

            <Field label="Location" icon={<MapPin size={13} className="text-slate-500" />}>
              <input
                type="text"
                placeholder="Add location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-white placeholder-slate-500 transition"
              />
            </Field>

            <Field label="Notes" icon={<StickyNote size={13} className="text-slate-500" />}>
              <textarea
                placeholder="Add notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-white placeholder-slate-500 transition resize-none"
              />
            </Field>

            {/* Reminder sharing */}
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-sky-900/50 flex items-center justify-center shrink-0">
                    <Share2 size={16} className="text-sky-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-200">Share with followers</p>
                    <p className="text-xs text-slate-500 mt-0.5">Let your followers see and set this reminder</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReminderShared(!reminderShared)}
                  className={`w-11 h-6 rounded-full transition-colors duration-200 relative shrink-0 ${
                    reminderShared ? 'bg-sky-500' : 'bg-slate-700'
                  }`}
                >
                  <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${reminderShared ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>

            {/* Reminder email invitations */}
            <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-sky-400" />
                <p className="text-sm font-semibold text-slate-200">Invite by email</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="friend@example.com"
                  value={reminderEmailInput}
                  onChange={(e) => setReminderEmailInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addReminderEmail(); } }}
                  className="flex-1 px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:border-sky-500 focus:outline-none text-sm text-white placeholder-slate-500 transition"
                />
                <button
                  type="button"
                  onClick={addReminderEmail}
                  className="px-3 py-2.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 text-sm font-medium transition flex items-center gap-1"
                >
                  <Plus size={14} /> Add
                </button>
              </div>
              {reminderInviteEmails.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {reminderInviteEmails.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-xs text-slate-300"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => removeReminderEmail(email)}
                        className="text-slate-500 hover:text-red-400 transition"
                      >
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start Date" required>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-white transition"
                />
              </Field>
              <Field label="Start Time" icon={<Clock size={13} className="text-slate-500" />} hint="Optional — defaults to 12:00 AM">
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-white transition"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="End Date" icon={<CalendarPlus size={13} className="text-slate-500" />} hint="Optional">
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-white transition"
                />
              </Field>
              <Field label="End Time" icon={<Clock size={13} className="text-slate-500" />} hint="Optional">
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  disabled={!endDate}
                  className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-white transition disabled:opacity-40"
                />
              </Field>
            </div>

            <Field label="Timezone" icon={<Globe size={13} className="text-slate-500" />} hint="Defaults to your device timezone">
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-white transition"
              >
                {COMMON_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>{tz.label}</option>
                ))}
              </select>
            </Field>

            {/* Visibility selector */}
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 px-1">Event Type</p>
              <div className="space-y-2">
                {VISIBILITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setVisibility(opt.value)}
                    className={`w-full text-left rounded-xl border p-3.5 transition flex items-center gap-3 ${
                      visibility === opt.value
                        ? 'bg-slate-700/60 border-sky-500'
                        : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="shrink-0 w-9 h-9 rounded-lg bg-slate-900/60 flex items-center justify-center">
                      {opt.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${visibility === opt.value ? 'text-white' : 'text-slate-300'}`}>{opt.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{opt.description}</p>
                    </div>
                    {visibility === opt.value && (
                      <Check size={16} className="text-sky-400 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Closed group: email invitations */}
            {visibility === 'closed' && (
              <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Mail size={14} className="text-amber-400" />
                  <p className="text-sm font-semibold text-slate-200">Invite by email</p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="friend@example.com"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEmail(); } }}
                    className="flex-1 px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 focus:border-amber-500 focus:outline-none text-sm text-white placeholder-slate-500 transition"
                  />
                  <button
                    type="button"
                    onClick={addEmail}
                    className="px-3 py-2.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 text-sm font-medium transition flex items-center gap-1"
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
                {inviteEmails.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {inviteEmails.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-700 text-xs text-slate-300"
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => removeEmail(email)}
                          className="text-slate-500 hover:text-red-400 transition"
                        >
                          <X size={11} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  A share link will be generated after creation — you can also invite people with that.
                </p>
              </div>
            )}

            {/* Private: share with followers toggle */}
            {visibility === 'private' && (
              <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-sky-900/50 flex items-center justify-center shrink-0">
                      <Share2 size={16} className="text-sky-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-200">Share with followers</p>
                      <p className="text-xs text-slate-500 mt-0.5">Let your followers see and set reminders for this event</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSharedWithFollowers(!sharedWithFollowers)}
                    className={`w-11 h-6 rounded-full transition-colors duration-200 relative shrink-0 ${
                      sharedWithFollowers ? 'bg-sky-500' : 'bg-slate-700'
                    }`}
                  >
                    <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${sharedWithFollowers ? 'translate-x-5' : ''}`} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {mode === 'event' && (
          <>
            <Field label="Location" icon={<MapPin size={13} className="text-slate-500" />}>
              <input
                type="text"
                placeholder="Add location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-white placeholder-slate-500 transition"
              />
            </Field>
            <Field label="Ticket Link" icon={<Link2 size={13} className="text-slate-500" />}>
              <input
                type="url"
                placeholder="https://..."
                value={ticketUrl}
                onChange={(e) => setTicketUrl(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-white placeholder-slate-500 transition"
              />
            </Field>
            <Field label="Agenda" icon={<FileText size={13} className="text-slate-500" />}>
              <textarea
                placeholder={'• Opening ceremony\n• Keynote speech\n• Networking'}
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-white placeholder-slate-500 transition resize-none"
              />
            </Field>
            <Field label="Participants" icon={<Users size={13} className="text-slate-500" />}>
              <input
                type="text"
                placeholder="e.g. 5 speakers, 200 attendees"
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-white placeholder-slate-500 transition"
              />
            </Field>
          </>
        )}

        {error && (
          <div className="rounded-xl bg-red-900/30 border border-red-800/50 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3.5 rounded-xl bg-sky-500 text-white font-semibold hover:bg-sky-400 active:scale-[0.98] transition disabled:opacity-50 mt-2"
        >
          {saving ? 'Saving...' : mode === 'reminder' ? 'Set Reminder' : 'Publish Event'}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  icon,
  required,
  hint,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 px-1">
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
          {icon}
          {label}
          {required && <span className="text-red-400">*</span>}
        </label>
        {hint && <span className="text-[10px] text-slate-600 font-normal normal-case tracking-normal">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
