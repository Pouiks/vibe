"use client";
import { useState } from 'react';
import { supabase } from '@/core/supabase/client';
import { useSearchParams } from 'next/navigation';
import { Mail, Sparkles, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const hasError = searchParams?.get('error') === 'invalid_link';
  const returnUrl = searchParams?.get('returnUrl') || '/';
  
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(hasError ? 'Le lien a expiré. Réessayez.' : '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError('');

    const redirectUrl = new URL('/auth/callback', window.location.origin);
    redirectUrl.searchParams.set('returnUrl', returnUrl);

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectUrl.toString(),
      },
    });

    if (authError) {
      console.error('Magic link error:', authError);
      // On affiche le vrai message de Supabase pour savoir s'il s'agit d'une limite de spam (Rate Limit)
      setError(`Erreur Supabase: ${authError.message}`);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  if (sent) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-vibe-dark relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-[-15%] left-[-10%] w-80 h-80 bg-brand-600 rounded-full mix-blend-screen filter blur-[150px] opacity-20 pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-vibe-accent rounded-full mix-blend-screen filter blur-[120px] opacity-15 pointer-events-none"></div>

        <div className="glass p-8 rounded-3xl max-w-sm w-full text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500 rounded-full mix-blend-screen filter blur-[60px] opacity-10"></div>
          
          <div className="bg-emerald-500/20 p-5 rounded-full w-fit mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          
          <h1 className="text-2xl font-extrabold text-white mb-3">Check tes mails !</h1>
          <p className="text-slate-400 text-sm leading-relaxed mb-4">
            Un lien magique a été envoyé à <span className="text-brand-300 font-semibold">{email}</span>. 
            Clique dessus pour accéder à VIBE.
          </p>
          <p className="text-[11px] text-slate-500">
            Le lien expire dans 1 heure. Vérifie tes spams si besoin.
          </p>
          
          <button 
            onClick={() => { setSent(false); setEmail(''); }}
            className="mt-6 text-xs text-brand-400 hover:text-brand-300 transition-colors"
          >
            Utiliser un autre email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-vibe-dark relative overflow-hidden">
      {/* Background decorations */}
      <div className="absolute top-[-15%] left-[-10%] w-80 h-80 bg-brand-600 rounded-full mix-blend-screen filter blur-[150px] opacity-20 pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-64 h-64 bg-vibe-accent rounded-full mix-blend-screen filter blur-[120px] opacity-15 pointer-events-none"></div>

      {/* Hero */}
      <div className="mb-10 text-center">
        <h1 className="text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-brand-300 to-brand-500 mb-3">
          VIBE
        </h1>
        <p className="text-slate-400 text-sm max-w-[260px] mx-auto leading-relaxed">
          Connecte-toi aux gens autour de toi. Anonyme, instantané, local.
        </p>
      </div>

      {/* Login Card */}
      <div className="glass p-7 rounded-3xl max-w-sm w-full relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500 rounded-full mix-blend-screen filter blur-[60px] opacity-10"></div>
        
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-brand-500/20 p-3 rounded-2xl">
            <Sparkles className="w-6 h-6 text-brand-400" />
          </div>
          <div>
            <h2 className="font-bold text-white text-lg">Accès Magic Link</h2>
            <p className="text-[11px] text-slate-500">Pas de mot de passe. Juste ton email.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ton@email.com"
              className="w-full glass pl-11 pr-4 py-3.5 rounded-2xl outline-none focus:border-brand-500 transition-colors text-sm"
              autoComplete="email"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold py-3.5 px-4 rounded-xl transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                Recevoir mon lien
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="text-[10px] text-slate-600 text-center mt-5 leading-relaxed">
          Un pseudo anonyme te sera attribué automatiquement.<br />
          Ton email reste invisible pour les autres utilisateurs.
        </p>
      </div>
    </div>
  );
}
