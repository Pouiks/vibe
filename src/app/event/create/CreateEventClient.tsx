"use client";
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useVibeStore } from '@/core/store/useVibeStore';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { supabase } from '@/core/supabase/client';
import { AlertCircle, ArrowLeft, Zap, CalendarDays, Sparkles } from 'lucide-react';
import Link from 'next/link';

const DURATIONS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1h' },
  { value: 90, label: '1h30' },
  { value: 120, label: '2h' },
  { value: 180, label: '3h' },
];

const MAX_DAYS_AHEAD = 60;

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CreateEventClient() {
  const user = useVibeStore((state) => state.user);
  const writePermission = useVibeStore((state) => state.writePermission);

  const router = useRouter();
  const searchParams = useSearchParams();
  const venueId = searchParams.get('venue_id');
  const venueSlug = searchParams.get('slug');
  useSwipeBack();

  // Flash = départ imminent, exige d'être sur place. Planifié = date libre,
  // ouvert à tous les membres du spot (l'habitué organise depuis chez lui).
  const [mode, setMode] = useState<'flash' | 'planned'>(writePermission ? 'flash' : 'planned');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [delay, setDelay] = useState(15);
  const [startAt, setStartAt] = useState('');
  const [duration, setDuration] = useState(60);
  const [maxParticipants, setMaxParticipants] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [[minStart, maxStart]] = useState(() => {
    const now = Date.now();
    return [
      toLocalInputValue(new Date(now + 15 * 60000)),
      toLocalInputValue(new Date(now + MAX_DAYS_AHEAD * 24 * 3600_000)),
    ];
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !venueId) return;

    let startTime: string;
    if (mode === 'flash') {
      startTime = new Date(Date.now() + delay * 60000).toISOString();
    } else {
      const start = new Date(startAt);
      if (isNaN(start.getTime()) || start.getTime() < Date.now()) {
        setError("Choisis une date dans le futur.");
        return;
      }
      if (start.getTime() > Date.now() + MAX_DAYS_AHEAD * 24 * 3600_000) {
        setError(`Maximum ${MAX_DAYS_AHEAD} jours à l'avance.`);
        return;
      }
      startTime = start.toISOString();
    }

    setLoading(true);
    setError('');

    const { data: newEvent, error: insertError } = await supabase.from('events').insert({
      venue_id: venueId,
      creator_id: user.id,
      title: title.trim(),
      description: description.trim(),
      start_time: startTime,
      duration_minutes: duration,
      max_participants: maxParticipants,
      current_participants: 0, // le trigger compte via event_participants
    }).select('id').single();

    if (insertError || !newEvent) {
      console.error('Event creation error:', insertError);
      setError(insertError?.code === '42501'
        ? 'Tu dois avoir scanné le QR code de ce lieu pour créer un event.'
        : 'Erreur lors de la création. Réessayez.');
      setLoading(false);
      return;
    }

    // Le créateur participe à son propre event (et accède à son chat dédié).
    const { error: joinError } = await supabase.from('event_participants')
      .insert({ event_id: newEvent.id, user_id: user.id });
    if (joinError) console.error('Creator join error:', joinError);

    fetch('/api/events/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: newEvent.id }),
    }).catch(err => console.error('Push notify error:', err));

    if (venueSlug) {
      router.push(`/l/${venueSlug}?tab=events`);
    } else {
      router.back();
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center">
        <AlertCircle className="w-12 h-12 text-yellow-500 mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">Connexion requise</h1>
        <p className="text-slate-500 mb-6 max-w-sm">Connecte-toi pour organiser un événement sur ce lieu.</p>
        <Link href={`/login?returnUrl=${encodeURIComponent(`/event/create?venue_id=${venueId}&slug=${venueSlug}`)}`} className="bg-blue-600 px-4 py-2.5 rounded-xl text-white font-medium flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Connexion
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 flex flex-col bg-slate-50">
      <Link href={venueSlug ? `/l/${venueSlug}` : '/'} className="text-slate-500 mb-6 w-fit hover:text-slate-900 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Retour
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-extrabold mb-2 text-slate-900">Créer un événement</h1>
        <p className="text-slate-500 text-sm">Les membres du spot seront notifiés.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-md">
        <div className="flex bg-slate-100 p-0.5 rounded-xl">
          <button type="button"
            onClick={() => writePermission && setMode('flash')}
            disabled={!writePermission}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${mode === 'flash' ? 'bg-blue-600 text-white shadow' : 'text-slate-400'} ${!writePermission ? 'opacity-40' : ''}`}>
            <Zap className="w-3.5 h-3.5" /> Flash
          </button>
          <button type="button"
            onClick={() => setMode('planned')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${mode === 'planned' ? 'bg-blue-600 text-white shadow' : 'text-slate-400'}`}>
            <CalendarDays className="w-3.5 h-3.5" /> Planifié
          </button>
        </div>
        {!writePermission && (
          <p className="text-[11px] text-slate-400 -mt-3 ml-1">⚡ Flash uniquement sur place — planifie ton event pour plus tard.</p>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-600 ml-1">Titre de l&apos;événement</label>
          <input
            type="text"
            required
            maxLength={80}
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex: 3vs3 Basket"
            className="w-full bg-white border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-blue-500 transition-colors text-slate-900"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-600 ml-1">Description <span className="text-slate-400 font-normal">(optionnel)</span></label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder="Niveau, matériel à apporter…"
            className="w-full bg-white border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-blue-500 transition-colors text-slate-900 text-sm resize-none"
          />
        </div>

        {mode === 'flash' ? (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-600 ml-1">Dans combien de temps ?</label>
            <select
              value={delay}
              onChange={e => setDelay(Number(e.target.value))}
              className="w-full bg-white border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-blue-500 transition-colors appearance-none text-slate-900"
            >
               <option value={15}>Dans 15 minutes</option>
               <option value={30}>Dans 30 minutes</option>
               <option value={60}>Dans 1 heure</option>
               <option value={120}>Dans 2 heures</option>
            </select>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-600 ml-1">Date et heure</label>
            <input
              type="datetime-local"
              required
              value={startAt}
              min={minStart}
              max={maxStart}
              onChange={e => setStartAt(e.target.value)}
              className="w-full bg-white border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-blue-500 transition-colors text-slate-900"
            />
            <p className="text-[11px] text-slate-400 ml-1">Les participants recevront un rappel 15 min avant.</p>
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-600 ml-1">Durée</label>
          <div className="grid grid-cols-5 gap-1.5">
            {DURATIONS.map(d => (
              <button key={d.value} type="button" onClick={() => setDuration(d.value)}
                className={`py-2 rounded-xl text-xs font-semibold border transition-all ${duration === d.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'}`}>
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-600 ml-1">Places disponibles</label>
          <input
            type="number"
            min={2} max={20}
            value={maxParticipants}
            onChange={e => setMaxParticipants(Number(e.target.value))}
            required
            className="w-full bg-white border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-blue-500 transition-colors text-slate-900"
          />
        </div>

        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !title.trim() || (mode === 'planned' && !startAt)}
          className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3.5 px-4 rounded-xl transition-all active:scale-95 disabled:opacity-50"
        >
          {loading ? 'Création...' : mode === 'flash' ? "Lancer l'événement !" : "Planifier l'événement"}
        </button>
      </form>
    </div>
  );
}
