import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { CreateMode } from '../lib/types';
import { fromLocalInput, formatFullDate, formatCountdown } from '../lib/time';
import {
  Camera, X, Check, ChevronLeft, Bell, CalendarPlus,
  MapPin, Link2, FileText, Users, StickyNote,
} from 'lucide-react';

interface CreatePageProps {
  onBack: () => void;
  onCreated: () => void;
  initialMode?: CreateMode;
  isOrganizer?: boolean;
}

export function CreatePage({ onBack, onCreated, initialMode = 'reminder', isOrganizer = false }: CreatePageProps) {
  const { user } = useAuth();
  const [mode, setMode] = useState<CreateMode>(initialMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPreview, setSavedPreview] = useState<{ name: string; date: string; mode: CreateMode } | null>(null);

  const [name, setName] = useState('');
  const [dateTime, setDateTime] = useState('');
  const [location, setLocation] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
  const [agenda, setAgenda] = useState('');
  const [participants, setParticipants] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name || !dateTime) { setError('Name and date/time are required'); return; }
    if (!user) { setError('Please sign in first'); return; }

    setSaving(true);
    const isoDate = fromLocalInput(dateTime);

    if (mode === 'reminder') {
      const { error: dbError } = await supabase.from('reminders').insert({
        name, remind_at: isoDate, location: location || null, notes: notes || null,
      });
      if (dbError) { setError(dbError.message); setSaving(false); return; }
    } else {
      const { error: dbError } = await supabase.from('events').insert({
        name, event_date: isoDate, location: location || null,
        ticket_url: ticketUrl || null, agenda: agenda || null,
        participants: participants || null, image_url: imageUrl,
      });
      if (dbError) { setError(dbError.message); setSaving(false); return; }
    }

    setSaving(false);
    setSavedPreview({ name, date: isoDate, mode });
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
          {mode === 'event' ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 -mr-2 rounded-lg hover:bg-slate-800 transition"
              title="Upload poster image"
            >
              <Camera size={22} className="text-slate-400" />
            </button>
          ) : <div className="w-10" />}
        </div>

        {/* Mode toggle — only show event option for organizers */}
        {isOrganizer && (
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
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileUpload} className="hidden" />

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

        {mode === 'event' && (
          <>
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

        {mode === 'reminder' && (
          <Field label="Notes" icon={<StickyNote size={13} className="text-slate-500" />}>
            <textarea
              placeholder="Add notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 focus:border-sky-500 focus:outline-none text-white placeholder-slate-500 transition resize-none"
            />
          </Field>
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
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 px-1">
        {icon}
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}
