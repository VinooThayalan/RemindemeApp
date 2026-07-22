import { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { EventFeed } from './components/EventFeed';
import { CreatePage } from './components/CreatePage';
import { EventDetail } from './components/EventDetail';
import { RemindersView } from './components/RemindersView';
import { UserProfile } from './components/UserProfile';
import { AdminDashboard } from './components/AdminDashboard';
import { CalendarView } from './components/CalendarView';
import type { Event, CreateMode, View } from './lib/types';
import { Bell, Plus, Compass, User, ShieldCheck, CalendarDays } from 'lucide-react';

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [view, setView] = useState<View>('feed');
  const [createMode, setCreateMode] = useState<CreateMode>('reminder');
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-400 to-cyan-500 flex items-center justify-center shadow-lg">
            <Bell size={24} className="text-white" />
          </div>
          <div className="w-6 h-6 border-2 border-slate-600 border-t-sky-400 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const handleSelectEvent = (event: Event) => {
    setSelectedEvent(event);
    setView('detail');
  };

  const handleCreate = (mode: CreateMode) => {
    if (!user) { setView('reminders'); return; }
    setCreateMode(mode);
    setView('create');
  };

  const handleCreated = () => {
    setView(createMode === 'reminder' ? 'reminders' : 'feed');
  };

  const isAdmin = profile?.role === 'admin';

  if (view === 'create' && user) {
    return (
      <CreatePage
        onBack={() => setView(createMode === 'event' ? 'feed' : 'reminders')}
        onCreated={handleCreated}
        initialMode={createMode}
      />
    );
  }

  if (view === 'detail' && selectedEvent) {
    return (
      <EventDetail
        event={selectedEvent}
        onBack={() => setView('feed')}
        onEventDeleted={() => setView('feed')}
      />
    );
  }

  if ((view === 'reminders' || view === 'profile' || view === 'admin') && !user) {
    return <AuthScreen onAuthSuccess={() => setView('feed')} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pb-24">
        {view === 'feed' && <EventFeed onSelectEvent={handleSelectEvent} />}
        {view === 'calendar' && <CalendarView onSelectEvent={handleSelectEvent} />}
        {view === 'reminders' && user && <RemindersView />}
        {view === 'profile' && user && (
          <UserProfile onNavigate={(v) => setView(v)} />
        )}
        {view === 'admin' && isAdmin && <AdminDashboard />}
      </div>

      {/* Bottom navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-30">
        <div className="bg-slate-900/95 backdrop-blur-xl border-t border-slate-800 px-4 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <div className="max-w-lg mx-auto flex items-center justify-around">
            <NavButton
              icon={<Compass size={20} />}
              label="Discover"
              active={view === 'feed'}
              onClick={() => setView('feed')}
            />
            <NavButton
              icon={<CalendarDays size={20} />}
              label="Calendar"
              active={view === 'calendar'}
              onClick={() => setView('calendar')}
            />
            {/* Center create button */}
            <button
              onClick={() => handleCreate('event')}
              className="relative -mt-8"
              aria-label="Create"
            >
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-sky-400 to-cyan-500 flex items-center justify-center shadow-xl shadow-cyan-500/30 hover:shadow-cyan-500/50 hover:scale-105 active:scale-95 transition-all duration-150">
                <Plus size={26} className="text-white" strokeWidth={2.5} />
              </div>
            </button>
            <NavButton
              icon={<Bell size={20} />}
              label="Reminders"
              active={view === 'reminders'}
              onClick={() => (user ? setView('reminders') : setView('reminders'))}
            />
            <NavButton
              icon={<User size={20} />}
              label="Profile"
              active={view === 'profile'}
              onClick={() => setView('profile')}
            />
            {isAdmin && (
              <NavButton
                icon={<ShieldCheck size={20} />}
                label="Admin"
                active={view === 'admin'}
                onClick={() => setView('admin')}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function NavButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 min-w-[3rem] transition-colors duration-150 ${
        active ? 'text-sky-400' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
