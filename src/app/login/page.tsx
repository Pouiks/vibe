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
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-slate-50">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-sm w-full text-center">
          <div className="bg-emerald-50 p-5 rounded-full w-fit mx-auto mb-6">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          
          <h1 className="text-2xl font-extrabold text-slate-900 mb-3">Check tes mails !</h1>
          <p className="text-slate-500 text-sm leading-relaxed mb-4">
            Un lien magique a été envoyé à <span className="text-blue-600 font-semibold">{email}</span>. 
            Clique dessus pour accéder à VIBE.
          </p>
          <p className="text-[11px] text-slate-400">
            Le lien expire dans 1 heure. Vérifie tes spams si besoin.
          </p>
          
          <button 
            onClick={() => { setSent(false); setEmail(''); }}
            className="mt-6 text-xs text-blue-600 hover:text-blue-700 transition-colors"
          >
            Utiliser un autre email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-slate-50">
      <div className="mb-10 text-center">
        <h1 className="text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 via-blue-600 to-blue-500 mb-3">
          VIBE
        </h1>
        <p className="text-slate-500 text-sm max-w-[260px] mx-auto leading-relaxed">
          Connecte-toi aux gens autour de toi. Pseudo fun, instantané, local.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-7 max-w-sm w-full">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-blue-50 p-3 rounded-2xl">
            <Sparkles className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 text-lg">Rejoins le Spot</h2>
            <p className="text-[11px] text-slate-400">Sans mot de passe. Juste ton email.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ton@email.com"
              className="w-full bg-white border border-slate-200 pl-11 pr-4 py-3.5 rounded-2xl outline-none focus:border-blue-600 transition-colors text-sm text-slate-900"
              autoComplete="email"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-500 text-xs">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3.5 px-4 rounded-xl transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
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

        <p className="text-[10px] text-slate-400 text-center mt-5 leading-relaxed">
          Un pseudo fun te sera attribué automatiquement.<br />
          Ton email reste invisible pour les autres utilisateurs.
        </p>
      </div>
    </div>
  );
}
