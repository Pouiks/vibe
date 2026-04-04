"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useVibeStore } from '@/core/store/useVibeStore';
import { supabase } from '@/core/supabase/client';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/modules/auth/useAuth';
import { Crown, MapPin, Map as MapIcon, ArrowLeft, Save, BellOff, LogOut, Check } from 'lucide-react';

export default function ProfilePage() {
  const user = useVibeStore((state) => state.user);
  const updateUserProfile = useVibeStore((state) => state.updateUserProfile);
  const { unsubscribeFromPush, isSubscribed } = usePushNotifications();
  const { signOut } = useAuth();
  const router = useRouter();
  useSwipeBack();

  const [formData, setFormData] = useState({
     firstName: user?.firstName || '',
     age: user?.age || '',
     gender: user?.gender || ''
  });

  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmail(user.email);
    });
  }, []);

  const handleChange = (e: any) => setFormData({...formData, [e.target.name]: e.target.value});

  const [isSaved, setIsSaved] = useState(false);

  const hasChanges = 
    formData.firstName !== (user?.firstName || '') ||
    formData.age !== (user?.age || '') ||
    formData.gender !== (user?.gender || '');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserProfile(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 5000); // Reste vert pendant 5s
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 p-6 bg-vibe-dark">
         Chargement profil...
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-vibe-dark relative flex flex-col items-center">
      <div className="w-full max-w-sm">
        <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6">
          <ArrowLeft className="w-4 h-4" /> Retour
        </Link>
        
        <div className="glass p-6 rounded-3xl flex flex-col items-center text-center mb-8 relative overflow-hidden">
           {user.isPremium && (
             <div className="absolute top-0 right-0 w-32 h-32 bg-vibe-accent rounded-full mix-blend-screen filter blur-[40px] opacity-20"></div>
           )}
           <div className="bg-brand-600/20 p-4 rounded-full mb-4 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
             <Crown className={`w-10 h-10 ${user.isPremium ? 'text-vibe-accent' : 'text-slate-400'}`} />
           </div>
           <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400 mb-1">
             {user.username}
           </h1>
           <p className="text-sm font-medium text-brand-500 mb-1">
             {user.isPremium ? 'Membre Premium' : 'Membre Standard'}
           </p>
           {email && (
             <p className="text-xs text-slate-500 bg-vibe-dark/50 px-3 py-1 rounded-full mt-2">
               Connecté en tant que <span className="text-slate-300">{email}</span>
             </p>
           )}
        </div>

        {/* Informations Personnelles */}
        <div className={`glass p-5 rounded-3xl mb-8 transition-all duration-1000 border ${
            isSaved ? 'border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.2)]' : 'border-transparent'
        }`}>
           <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-4 ml-1">Mes Informations</h2>
           <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-300 ml-1">Prénom</label>
                <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} placeholder="Optionnel" className="bg-vibe-dark/50 border border-vibe-border px-4 py-2.5 rounded-xl outline-none focus:border-brand-500 text-sm transition-colors" />
              </div>
              <div className="flex gap-4">
                 <div className="flex flex-col gap-1.5 flex-1">
                   <label className="text-xs font-semibold text-slate-300 ml-1">Âge</label>
                   <input type="number" name="age" value={formData.age} onChange={handleChange} placeholder="-" className="bg-vibe-dark/50 border border-vibe-border px-4 py-2.5 rounded-xl outline-none focus:border-brand-500 text-sm transition-colors" />
                 </div>
                 <div className="flex flex-col gap-1.5 flex-1">
                   <label className="text-xs font-semibold text-slate-300 ml-1">Sexe</label>
                   <select name="gender" value={formData.gender} onChange={handleChange} className="bg-vibe-dark/50 border border-vibe-border px-4 py-2.5 rounded-xl outline-none focus:border-brand-500 text-sm transition-colors appearance-none text-white">
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
                className={`mt-2 w-full flex items-center justify-center gap-2 active:scale-95 transition-all duration-1000 text-white py-2.5 rounded-xl text-sm font-medium ${
                    isSaved 
                        ? 'bg-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]' 
                        : !hasChanges
                        ? 'bg-brand-600/50 text-slate-400 cursor-not-allowed'
                        : 'bg-brand-600 hover:bg-brand-500 shadow-[0_0_10px_rgba(99,102,241,0.3)]'
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
           
           <div className="mt-6 pt-6 border-t border-vibe-border flex flex-col gap-3">
              <button 
                onClick={async () => {
                   const success = await unsubscribeFromPush();
                   if (success) alert("Notifications bloquées et abonnements purgés.");
                }} 
                className="w-full flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 py-2.5 rounded-xl text-sm font-medium transition-colors"
                title="Supprime l'envoi de notification vers cet appareil."
              >
                <BellOff className="w-4 h-4" /> Désactiver les notifications
              </button>
              <button 
                onClick={async () => {
                   await signOut();
                   router.replace('/login');
                }} 
                className="w-full flex items-center justify-center gap-2 bg-slate-500/10 hover:bg-slate-500/20 text-slate-400 py-2.5 rounded-xl text-sm font-medium transition-colors"
              >
                <LogOut className="w-4 h-4" /> Se déconnecter
              </button>
           </div>
        </div>

        <div className="mt-12 text-center text-xs text-slate-500">
          VibeSpot PWA - Build 2026
        </div>
      </div>
    </div>
  );
}
