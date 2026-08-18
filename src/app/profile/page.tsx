"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useVibeStore } from '@/core/store/useVibeStore';
import { supabase } from '@/core/supabase/client';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/modules/auth/useAuth';
import { Crown, ArrowLeft, Save, BellOff, LogOut, Check, Download, Trash2 } from 'lucide-react';

export default function ProfilePage() {
  const user = useVibeStore((state) => state.user);
  const updateUserProfile = useVibeStore((state) => state.updateUserProfile);
  const { unsubscribeFromPush } = usePushNotifications();
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
        
        <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-6 flex flex-col items-center text-center mb-8 relative overflow-hidden">
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
        <div className={`bg-white shadow-sm border rounded-2xl p-5 mb-8 transition-all duration-1000 ${
            isSaved ? 'border-green-500' : 'border-slate-200'
        }`}>
           <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4 ml-1">Mes Informations</h2>
           <form onSubmit={handleSave} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-slate-600 ml-1">Prénom</label>
                <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} placeholder="Optionnel" className="bg-white border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl outline-none focus:border-blue-500 text-sm transition-colors" />
              </div>
              <div className="flex gap-4">
                 <div className="flex flex-col gap-1.5 flex-1">
                   <label className="text-xs font-semibold text-slate-600 ml-1">Âge</label>
                   <input type="number" name="age" value={formData.age} onChange={handleChange} placeholder="-" className="bg-white border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl outline-none focus:border-blue-500 text-sm transition-colors" />
                 </div>
                 <div className="flex flex-col gap-1.5 flex-1">
                   <label className="text-xs font-semibold text-slate-600 ml-1">Sexe</label>
                   <select name="gender" value={formData.gender} onChange={handleChange} className="bg-white border border-slate-200 text-slate-900 px-4 py-2.5 rounded-xl outline-none focus:border-blue-500 text-sm transition-colors appearance-none">
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
              <button 
                onClick={async () => {
                   const success = await unsubscribeFromPush();
                   if (success) alert("Notifications bloquées et abonnements purgés.");
                }} 
                className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-500 py-2.5 rounded-xl text-sm font-medium transition-colors"
                title="Supprime l'envoi de notification vers cet appareil."
              >
                <BellOff className="w-4 h-4" /> Désactiver les notifications
              </button>
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

        {/* Mes données (RGPD) */}
        <div className="bg-white shadow-sm border border-slate-200 rounded-2xl p-5">
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
          VibeSpot PWA - Build 2026
        </div>
      </div>
    </div>
  );
}
