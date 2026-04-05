"use client";
import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/core/supabase/client';
import { useSearchParams, useRouter } from 'next/navigation';
import { Mail, Sparkles, ArrowRight, ShieldCheck, AlertCircle, RotateCcw } from 'lucide-react';

const OTP_LENGTH = 8;

function OtpInput({ value, onChange, onComplete, disabled }: {
  value: string;
  onChange: (v: string) => void;
  onComplete: (code: string) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, OTP_LENGTH);
    onChange(digits);
    if (digits.length === OTP_LENGTH) onComplete(digits);
  };

  return (
    <div className="relative w-full max-w-[320px] mx-auto">
      {/* Visual boxes rendered behind the real input */}
      <div className="flex gap-1.5 justify-center pointer-events-none" aria-hidden="true">
        {Array.from({ length: OTP_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`w-9 h-12 rounded-lg border-2 flex items-center justify-center text-lg font-bold transition-all ${i < value.length
                ? 'border-blue-600 bg-blue-50 text-blue-700'
                : i === value.length
                  ? 'border-blue-400 bg-white text-slate-900'
                  : 'border-slate-200 bg-white text-slate-300'
              }`}
          >
            {value[i] || ''}
          </div>
        ))}
      </div>

      {/* Real input overlaid on top — visible to iOS for autofill */}
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={disabled}
        className="absolute inset-0 w-full h-full text-transparent caret-transparent bg-transparent text-lg"
        aria-label="Code de vérification"
      />
    </div>
  );
}

export default function LoginPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const hasError = searchParams?.get('error') === 'invalid_link';
  const returnUrl = searchParams?.get('returnUrl') || '/';

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(hasError ? 'Le lien a expiré. Réessayez.' : '');
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const sendOtp = useCallback(async (targetEmail: string) => {
    setLoading(true);
    setError('');

    const { error: authError } = await supabase.auth.signInWithOtp({
      email: targetEmail.trim(),
    });

    if (authError) {
      console.error('OTP error:', authError);
      setError(`Erreur : ${authError.message}`);
      setLoading(false);
      return false;
    }

    setLoading(false);
    setResendCooldown(60);
    return true;
  }, []);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    const ok = await sendOtp(email);
    if (ok) setStep('otp');
  };

  const handleVerify = async (code: string) => {
    setVerifying(true);
    setError('');

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code,
      type: 'email',
    });

    if (verifyError) {
      console.error('Verify error:', verifyError);
      setError('Code invalide ou expiré. Réessayez.');
      setOtp('');
      setVerifying(false);
      return;
    }

    router.replace(returnUrl);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setOtp('');
    setError('');
    await sendOtp(email);
  };

  if (step === 'otp') {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-slate-50">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 max-w-sm w-full text-center">
          <div className="bg-blue-50 p-5 rounded-full w-fit mx-auto mb-6">
            <ShieldCheck className="w-10 h-10 text-blue-600" />
          </div>

          <h1 className="text-2xl font-extrabold text-slate-900 mb-2">Entre ton code</h1>
          <p className="text-slate-500 text-sm leading-relaxed mb-6">
            Un code à 8 chiffres a été envoyé à <span className="text-blue-600 font-semibold">{email}</span>
          </p>

          <OtpInput
            value={otp}
            onChange={setOtp}
            onComplete={handleVerify}
            disabled={verifying}
          />

          {verifying && (
            <div className="mt-4 flex items-center justify-center gap-2 text-blue-600 text-sm">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Vérification...
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-center justify-center gap-2 text-red-500 text-xs">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <button
              onClick={handleResend}
              disabled={resendCooldown > 0}
              className="text-xs text-blue-600 hover:text-blue-700 transition-colors disabled:text-slate-300 flex items-center justify-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              {resendCooldown > 0 ? `Renvoyer dans ${resendCooldown}s` : 'Renvoyer le code'}
            </button>
            <button
              onClick={() => { setStep('email'); setOtp(''); setError(''); }}
              className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              Changer d'email
            </button>
          </div>
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

        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
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
                Recevoir mon code
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
