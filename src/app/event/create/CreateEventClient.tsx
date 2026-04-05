"use client";
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useVibeStore } from '@/core/store/useVibeStore';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { supabase } from '@/core/supabase/client';
import { Sparkles, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function CreateEventClient() {
  const user = useVibeStore((state) => state.user);
  const isPremium = user?.isPremium;
  const isBypassPayment = useVibeStore((state) => state.isBypassPayment);
  const writePermission = useVibeStore((state) => state.writePermission);

  const router = useRouter();
  const searchParams = useSearchParams();
  const venueId = searchParams.get('venue_id');
  const venueSlug = searchParams.get('slug');
  useSwipeBack();
  
  const [title, setTitle] = useState('');
  const [delay, setDelay] = useState(15);
  const [maxParticipants, setMaxParticipants] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasAccess = isPremium || isBypassPayment;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !venueId) return;
    
    setLoading(true);
    setError('');

    const startTime = new Date(Date.now() + delay * 60000).toISOString();

    const { data: newEvent, error: insertError } = await supabase.from('events').insert({
      venue_id: venueId,
      creator_id: user.id,
      title: title.trim(),
      start_time: startTime,
      max_participants: maxParticipants,
      current_participants: 1,
    }).select('id').single();

    if (insertError || !newEvent) {
      console.error('Event creation error:', insertError);
      setError('Erreur lors de la création. Réessayez.');
      setLoading(false);
      return;
    }

    fetch('/api/events/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: newEvent.id }),
    }).catch(err => console.error('Push notify error:', err));

    if (venueSlug) {
      router.push(`/l/${venueSlug}`);
    } else {
      router.back();
    }
  };

  if (!hasAccess && !writePermission) {
    return (
       <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center">
         <AlertCircle className="w-12 h-12 text-yellow-500 mb-4" />
         <h1 className="text-xl font-bold text-slate-900 mb-2">Accès restreint</h1>
         <p className="text-slate-500 mb-6 max-w-sm">Vous devez être sur place ou posséder le Social Pass pour créer un événement flash.</p>
         <Link href="/" className="bg-blue-600 px-4 py-2 rounded-xl text-white font-medium">Retour</Link>
       </div>
    );
  }

  return (
    <div className="min-h-screen p-6 flex flex-col bg-slate-50">
      <Link href={venueSlug ? `/l/${venueSlug}` : '/'} className="text-slate-500 mb-6 w-fit hover:text-slate-900 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Retour
      </Link>
      
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold mb-2 text-slate-900">Créer un Event Flash</h1>
        <p className="text-slate-500 text-sm">Organisez une activité sur place instantanément.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-600 ml-1">Titre de l'événement</label>
          <input 
            type="text" 
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex: 3vs3 Basket" 
            className="w-full bg-white border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-blue-500 transition-colors text-slate-900"
          />
        </div>

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
        
        {!isPremium && (
          <div className="mt-4 p-4 rounded-2xl border border-blue-200 bg-blue-50">
            <div className="flex items-start gap-4 p-1">
               <Sparkles className="w-8 h-8 text-blue-600 flex-shrink-0" />
               <div>
                  <h3 className="font-bold text-blue-700 mb-1 text-sm">Passer Premium (Social Pass)</h3>
                  <p className="text-xs text-slate-500 mb-3 leading-relaxed">Le premier événement de la journée est gratuit. Pour créer en illimité et obtenir le badge certifié, souscrivez au pass.</p>
                  <button type="button" className="text-xs bg-blue-600 hover:bg-blue-700 text-white py-1.5 px-3 rounded-lg font-medium transition-colors">
                     S'abonner via Stripe (POC)
                  </button>
               </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}

        <button 
          type="submit" 
          disabled={loading || !title.trim()}
          className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3.5 px-4 rounded-xl transition-all active:scale-95 disabled:opacity-50"
        >
          {loading ? 'Création...' : 'Lancer l\'événement !'}
        </button>
      </form>
    </div>
  );
}
