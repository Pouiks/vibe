"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useVibeStore } from '@/core/store/useVibeStore';
import { supabase } from '@/core/supabase/client';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/modules/auth/useAuth';
import { Crown, ArrowLeft, Save, Bell, BellOff, LogOut, Check, Download, Trash2, Moon, Sun } from 'lucide-react';

interface MySpot { venue_id: string; muted: boolean; name: string; slug: string }

export default function ProfilePage() {
  const user = useVibeStore((state) => state.user);
  const updateUserProfile = useVibeStore((state) => state.updateUserProfile);
  const { subscribeToPush, unsubscribeFromPush, toggleMute } = usePushNotifications();
  const { signOut } = useAuth();
  const router = useRouter();
  useSwipeBack();

  const [formData, setFormData] = useState({
     firstName: user?.firstName || '',
     age: user?.age || '',
     gender: user?.gender || ''
  });

  // Le user peut arriver après le montage (hydratation de session) : sans ce
  // resync, le formulaire resterait vide et "Sauvegarder" écraserait le profil.
  useEffect(() => {
    if (!user) return;
    setFormData({ firstName: user.firstName || '', age: user.age || '', gender: user.gender || '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmail(user.email);
    });
  }, []);

  // ── Thème : sombre par défaut, choix persisté (appliqué par le script du layout)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    // Lecture du DOM après hydratation, une seule mise à jour voulue.
    setTheme(document.documentElement.classList.contains('light') ? 'light' : 'dark');
  }, []);
  const applyTheme = (t: 'dark' | 'light') => {
    setTheme(t);
    document.documentElement.classList.toggle('light', t === 'light');
    try { localStorage.setItem('atoute_theme', t); } catch { /* stockage indisponible */ }
  };

  // ── Mes spots : notifications par spot et sortie d'un spot
  const [spots, setSpots] = useState<MySpot[]>([]);
  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    supabase.from('channel_subscriptions')
      .select('venue_id, muted, venues(name, slug)')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (!isMounted || !data) return;
        interface Row { venue_id: string; muted: boolean | null; venues: { name: string; slug: string } | { name: string; slug: string }[] | null }
        setSpots((data as unknown as Row[]).map(r => {
          const v = Array.isArray(r.venues) ? r.venues[0] : r.venues;
          return { venue_id: r.venue_id, muted: !!r.muted, name: v?.name || 'Spot', slug: v?.slug || '' };
        }));
      });
    return () => { isMounted = false; };
  }, [user]);

  const handleSpotMute = async (s: MySpot) => {
    const ok = await toggleMute(s.venue_id, !s.muted);
    if (ok) setSpots(prev => prev.map(x => x.venue_id === s.venue_id ? { ...x, muted: !s.muted } : x));
  };

  const handleLeaveSpot = async (s: MySpot) => {
    if (!user) return;
    const confirmed = window.confirm(`Quitter « ${s.name} » ? Tu perdras l'accès au chat (lecture et écriture) et tes participations aux events de ce spot, jusqu'à re-scanner le QR code sur place.`);
    if (!confirmed) return;
    const { error } = await supabase.from('channel_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('venue_id', s.venue_id);
    if (error) {
      alert('Impossible de quitter ce spot pour le moment. Vérifie ta connexion et réessaie.');
      return;
    }
    setSpots(prev => prev.filter(x => x.venue_id !== s.venue_id));
    // Quitter le spot retire aussi des events du spot : sinon la home garde
    // des events fantômes et les push de leurs chats continuent d'arriver.
    const { data: evs } = await supabase.from('events').select('id').eq('venue_id', s.venue_id);
    if (evs && evs.length > 0) {
      await supabase.from('event_participants')
        .delete()
        .eq('user_id', user.id)
        .in('event_id', evs.map(e => e.id));
    }
  };

  // État réel des notifications sur CET appareil (l'abonnement push est par
  // appareil) : null = vérification en cours ou non supporté.
  const [devicePush, setDevicePush] = useState<boolean | null>(null);
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    // Le contrôle doit rester visible même si la sonde échoue (SW bloqué,
    // navigation privée) : on part de "désactivé" et la sonde affine.
    setDevicePush(false);
    let isMounted = true;
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => { if (isMounted) setDevicePush(!!sub); })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  const handleDevicePushToggle = async () => {
    if (devicePush) {
      const ok = await unsubscribeFromPush();
      if (ok) setDevicePush(false);
    } else {
      const result = await subscribeToPush();
      if (result === 'granted') setDevicePush(true);
      else if (result === 'denied') alert('Les notifications sont bloquées par ton navigateur. Autorise-les dans ses réglages puis réessaie.');
      else alert("Impossible d'activer les notifications sur cet appareil.");
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFormData({...formData, [e.target.name]: e.target.value});

  const [isSaved, setIsSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Supprimer définitivement ton compte ?\n\nTous tes messages, tes events, tes adhésions aux spots et tes données seront effacés immédiatement. Cette action est irréversible."
    );
    if (!confirmed) return;
    const typed = window.prompt('Pour confirmer, tape SUPPRIMER en majuscules :');
    if (typed !== 'SUPPRIMER') return;

    setDeleting(true);
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' });
      if (!res.ok) {
        alert('Erreur lors de la suppression. Réessaie ou contacte-nous.');
        setDeleting(false);
        return;
      }
      // La page confidentialité promet la dissociation des mesures d'audience :
      // on retire aussi l'identifiant anonyme local de cet appareil.
      try { localStorage.removeItem('vibe_anon_id'); } catch { /* stockage indisponible */ }
      await signOut();
      router.replace('/');
    } catch {
      alert('Erreur réseau. Réessaie.');
      setDeleting(false);
    }
  };

  const hasChanges = 
    formData.firstName !== (user?.firstName || '') ||
    formData.age !== (user?.age || '') ||
    formData.gender !== (user?.gender || '');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Convert string to null or number for database
    const ageValue = formData.age ? parseInt(formData.age, 10) : null;

    const { error } = await supabase
      .from('profiles')
      .update({
        first_name: formData.firstName,
        age: ageValue,
        gender: formData.gender
      })
      .eq('id', user.id);

    if (error) {
      console.error("Erreur lors de la sauvegarde :", error);
      alert("Erreur de connexion. Impossible de sauvegarder le profil.");
      return;
    }

    // Update local state to reflect UI changes immediately only if successful
    updateUserProfile(formData);
    
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 5000); // Reste vert pendant 5s
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500 p-6 bg-slate-50">
         Chargement profil...
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-slate-50 relative flex flex-col items-center">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Retour
        </Link>
        
        <div className="bg-card shadow-sm border border-slate-200 rounded-2xl p-6 flex flex-col items-center text-center mb-8 relative overflow-hidden">
           <div className="bg-blue-50 p-4 rounded-full mb-4">
             <Crown className={`w-10 h-10 ${user.isPremium ? 'text-amber-500' : 'text-slate-300'}`} />
           </div>
           <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 mb-1">
             {user.username}
           </h1>
           <p className="text-sm font-medium text-blue-600 mb-1">
             {user.isPremium ? 'Membre Premium' : 'Membre Standard'}
           </p>
           {email && (
             <p className="text-xs text-slate-600 bg-slate-100 px-3 py-1 rounded-full mt-2">
               Connecté en tant que <span className="text-slate-900">{email}</span>
             </p>
           )}
        </div>

        {/* Informations Personnelles */}
        <div className={`bg-card shadow-sm border rounded-2xl p-5 mb-8 transition-all duration-1000 ${
            isSaved ? 'border-green-500' : 'border-slate-200'
        }`}>
           <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4 ml-1">Mes Informations</h2>
           <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600 ml-1">Prénom</label>
                <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} placeholder="Optionnel" className="bg-card border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl outline-none focus:border-blue-500 text-sm transition-colors" />
              </div>
              <div className="flex gap-4">
                 <div className="flex flex-col gap-1.5 flex-1">
                   <label className="text-xs font-semibold text-slate-600 ml-1">Âge</label>
                   <input type="number" name="age" value={formData.age} onChange={handleChange} placeholder="-" className="bg-card border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl outline-none focus:border-blue-500 text-sm transition-colors" />
                 </div>
                 <div className="flex flex-col gap-1.5 flex-1">
                   <label className="text-xs font-semibold text-slate-600 ml-1">Sexe</label>
                   <select name="gender" value={formData.gender} onChange={handleChange} className="bg-card border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl outline-none focus:border-blue-500 text-sm transition-colors appearance-none">
                      <option value="">-</option>
                      <option value="M">Homme</option>
                      <option value="F">Femme</option>
                      <option value="X">Autre</option>
                   </select>
                 </div>
              </div>
              <button 
                type="submit" 
                disabled={!hasChanges && !isSaved}
                className={`mt-2 w-full flex items-center justify-center gap-2 active:scale-95 transition-all duration-1000 py-2.5 rounded-xl text-sm font-medium ${
                    isSaved 
                        ? 'bg-green-500 text-white' 
                        : !hasChanges
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isSaved ? (
                  <>
                    <Check className="w-4 h-4" /> Sauvegardé
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" /> Sauvegarder
                  </>
                )}
              </button>
           </form>
           
           <div className="mt-6 pt-6 border-t border-slate-200 flex flex-col gap-3">
              {devicePush !== null && (
                <button
                  onClick={handleDevicePushToggle}
                  className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors ${devicePush ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-600'}`}
                  title="L'abonnement aux notifications est propre à chaque appareil."
                >
                  {devicePush
                    ? (<><BellOff className="w-4 h-4" /> Désactiver les notifications (cet appareil)</>)
                    : (<><Bell className="w-4 h-4" /> Activer les notifications (cet appareil)</>)}
                </button>
              )}
              <button
                onClick={async () => {
                   await signOut();
                   router.replace('/login');
                }}
                className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-500 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                <LogOut className="w-4 h-4" /> Se déconnecter
              </button>
           </div>
        </div>

        {/* Mes spots */}
        <div className="bg-card shadow-sm border border-slate-200 rounded-2xl p-5 mb-8">
           <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4 ml-1">Mes spots</h2>
           {spots.length === 0 ? (
             <p className="text-xs text-slate-400">Scanne un QR code sur place pour rejoindre ton premier spot.</p>
           ) : (
             <div className="flex flex-col gap-2">
               {spots.map(s => (
                 <div key={s.venue_id} className="flex items-center gap-1 bg-slate-100 rounded-xl pl-3 pr-1.5 py-1.5">
                   <Link href={`/l/${s.slug}`} className="flex-1 min-w-0 text-sm font-medium text-slate-900 truncate py-1.5">
                     {s.name}
                   </Link>
                   <button
                     onClick={() => handleSpotMute(s)}
                     title={s.muted ? 'Réactiver les notifications de ce spot' : 'Couper les notifications du chat de ce spot (tes events rejoints continuent de te notifier)'}
                     className={`p-2 rounded-full active:scale-90 transition-transform ${s.muted ? 'text-slate-400' : 'text-blue-600'}`}
                   >
                     {s.muted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                   </button>
                   <button
                     onClick={() => handleLeaveSpot(s)}
                     title="Quitter ce spot"
                     className="p-2 rounded-full text-slate-400 active:text-red-500 active:scale-90 transition-transform"
                   >
                     <LogOut className="w-4 h-4" />
                   </button>
                 </div>
               ))}
             </div>
           )}
        </div>

        {/* Apparence */}
        <div className="bg-card shadow-sm border border-slate-200 rounded-2xl p-5 mb-8">
           <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4 ml-1">Apparence</h2>
           <div className="flex bg-slate-100 p-0.5 rounded-lg">
              <button
                onClick={() => applyTheme('dark')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${theme === 'dark' ? 'bg-card shadow text-slate-900' : 'text-slate-400'}`}
              >
                <Moon className="w-3.5 h-3.5" /> Sombre
              </button>
              <button
                onClick={() => applyTheme('light')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all flex items-center justify-center gap-1.5 ${theme === 'light' ? 'bg-card shadow text-slate-900' : 'text-slate-400'}`}
              >
                <Sun className="w-3.5 h-3.5" /> Clair
              </button>
           </div>
        </div>

        {/* Mes données (RGPD) */}
        <div className="bg-card shadow-sm border border-slate-200 rounded-2xl p-5">
           <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4 ml-1">Mes données</h2>
           <div className="flex flex-col gap-3">
              <a
                href="/api/account/export"
                download
                className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-600 py-2.5 rounded-xl text-sm font-medium transition-colors active:scale-[0.98]"
              >
                <Download className="w-4 h-4" /> Télécharger mes données
              </a>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-500 py-2.5 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" /> {deleting ? 'Suppression…' : 'Supprimer mon compte'}
              </button>
              <Link href="/confidentialite" className="text-center text-[11px] text-slate-400 underline underline-offset-2 pt-1">
                Politique de confidentialité
              </Link>
           </div>
        </div>

        <div className="mt-12 text-center text-xs text-slate-400">
          ATOUTE PWA - Build 2026
        </div>
      </div>
    </div>
  );
}
