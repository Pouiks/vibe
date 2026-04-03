"use client";
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useVibeStore } from '@/core/store/useVibeStore';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { supabase } from '@/core/supabase/client';
import { Sparkles, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function CreateEventPage() {
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

    const { error: insertError } = await supabase.from('events').insert({
      venue_id: venueId,
      creator_id: user.id,
      title: title.trim(),
      start_time: startTime,
      max_participants: maxParticipants,
      current_participants: 1,
    });

    if (insertError) {
      console.error('Event creation error:', insertError);
      setError('Erreur lors de la création. Réessayez.');
      setLoading(false);
      return;
    }

    // Navigate back to the venue page
    if (venueSlug) {
      router.push(`/l/${venueSlug}`);
    } else {
      router.back();
    }
  };

  if (!hasAccess && !writePermission) {
    return (
       <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-vibe-dark text-center">
         <AlertCircle className="w-12 h-12 text-yellow-500 mb-4" />
         <h1 className="text-xl font-bold mb-2">Accès restreint</h1>
         <p className="text-slate-400 mb-6 max-w-sm">Vous devez être sur place ou posséder le Social Pass pour créer un événement flash.</p>
         <Link href="/" className="bg-brand-600 px-4 py-2 rounded-xl text-white font-medium">Retour</Link>
       </div>
    );
  }

  return (
    <div className="min-h-screen p-6 flex flex-col bg-vibe-dark relative">
      <Link href={venueSlug ? `/l/${venueSlug}` : '/'} className="text-slate-400 mb-6 w-fit hover:text-white flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Retour
      </Link>
      
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold mb-2 text-white">Créer un Event Flash</h1>
        <p className="text-slate-400 text-sm">Organisez une activité sur place instantanément.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-300 ml-1">Titre de l'événement</label>
          <input 
            type="text" 
            required
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Ex: 3vs3 Basket" 
            className="glass w-full px-4 py-3 rounded-2xl outline-none focus:border-brand-500 transition-colors"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-300 ml-1">Dans combien de temps ?</label>
          <select 
            value={delay} 
            onChange={e => setDelay(Number(e.target.value))}
            className="glass w-full px-4 py-3 rounded-2xl outline-none focus:border-brand-500 transition-colors appearance-none"
          >
             <option value={15}>Dans 15 minutes</option>
             <option value={30}>Dans 30 minutes</option>
             <option value={60}>Dans 1 heure</option>
             <option value={120}>Dans 2 heures</option>
          </select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-300 ml-1">Places disponibles</label>
          <input 
            type="number" 
            min={2} max={20} 
            value={maxParticipants}
            onChange={e => setMaxParticipants(Number(e.target.value))}
            required
            className="glass w-full px-4 py-3 rounded-2xl outline-none focus:border-brand-500 transition-colors"
          />
        </div>
        
        {/* Premium Upsell */}
        {!isPremium && (
          <div className="mt-4 p-4 rounded-2xl border border-vibe-accent/30 bg-vibe-accent/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-vibe-accent rounded-full mix-blend-screen filter blur-[50px] opacity-20"></div>
            <div className="flex items-start gap-4 p-1">
               <Sparkles className="w-8 h-8 text-vibe-accent flex-shrink-0" />
               <div>
                  <h3 className="font-bold text-vibe-accent mb-1 text-sm">Passer Premium (Social Pass)</h3>
                  <p className="text-xs text-slate-400 mb-3 leading-relaxed">Le premier événement de la journée est gratuit. Pour créer en illimité et obtenir le badge certifié, souscrivez au pass.</p>
                  <button type="button" className="text-xs bg-vibe-accent hover:bg-vibe-accent/80 text-white py-1.5 px-3 rounded-lg font-medium transition-colors">
                     S'abonner via Stripe (POC)
                  </button>
               </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}

        <button 
          type="submit" 
          disabled={loading || !title.trim()}
          className="mt-6 w-full bg-brand-600 hover:bg-brand-500 text-white font-medium py-3.5 px-4 rounded-xl transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)] active:scale-95 disabled:opacity-50"
        >
          {loading ? 'Création...' : 'Lancer l\'événement !'}
        </button>
      </form>
    </div>
  );
}
