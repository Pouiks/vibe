"use client";
import { useState, useEffect } from "react";
import { X, Download, Share, PlusSquare, Compass, Bell } from "lucide-react";

const DISMISS_KEY = "vibe_install_dismissed_at";
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 h

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallEnv {
  standalone: boolean;
  iOS: boolean;
  nonSafariIOS: boolean;
  visible: boolean;
}

interface InstallPromptProps {
  context?: "home" | "venue";
}

export function InstallPrompt({ context = "home" }: InstallPromptProps) {
  const [env, setEnv] = useState<InstallEnv | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      !!(window.navigator as Navigator & { standalone?: boolean }).standalone;

    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !("MSStream" in window);
    // Any iOS browser that is NOT Safari (CriOS=Chrome, FxiOS=Firefox, EdgiOS=Edge, OPiOS=Opera, Ecosia, Brave…)
    const nonSafariIOS = iOS && /CriOS|FxiOS|EdgiOS|OPiOS|Ecosia|Brave|DuckDuckGo|GSA/i.test(ua);

    let visible = false;
    if (!standalone) {
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (!dismissedAt || Date.now() - Number(dismissedAt) > DISMISS_DURATION_MS) {
        localStorage.removeItem(DISMISS_KEY);
        visible = true;
      }
    }

    // Browser-only detection: must run once after hydration, a single state
    // update is intended here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEnv({ standalone, iOS, nonSafariIOS, visible });

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleDismiss = () => {
    setEnv(prev => (prev ? { ...prev, visible: false } : prev));
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setEnv(prev => (prev ? { ...prev, visible: false } : prev));
    }
  };

  if (!env || env.standalone || !env.visible) return null;

  const isVenue = context === "venue";

  return (
    <div className={`${isVenue ? "px-3 py-2" : "fixed bottom-0 left-0 right-0 z-50 p-4 pb-8 animate-slide-up"}`}>
      <div className="bg-white p-4 rounded-2xl relative overflow-hidden shadow-lg border border-slate-200">

        <button
          onClick={handleDismiss}
          className="absolute top-2.5 right-2.5 text-slate-400 hover:text-slate-600 p-1 rounded-full bg-slate-100"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-start gap-3">
          <div className="bg-blue-600 rounded-xl p-2.5 shadow-lg shadow-blue-600/20 shrink-0">
            {isVenue ? <Bell className="w-5 h-5 text-white" /> : <Download className="w-5 h-5 text-white" />}
          </div>

          <div className="pt-0.5 min-w-0">
            <h3 className="text-slate-900 font-bold text-sm mb-0.5">
              {isVenue ? "Active les notifications" : "Installer VibeSpot"}
            </h3>
            <p className="text-[11px] text-slate-500 leading-relaxed mb-2.5">
              {isVenue
                ? "Installe l'app pour recevoir les messages de ce spot même quand tu n'es pas sur cette page."
                : "Ajoute l'app sur ton écran d'accueil pour ne rien rater."}
            </p>

            {env.nonSafariIOS ? (
              <div className="bg-orange-50 rounded-xl p-2.5 text-[11px] font-medium text-orange-700 border border-orange-200">
                <Compass className="inline w-3 h-3 mr-1 -mt-0.5" />
                Sur iPhone, ouvre ce lien dans <strong>Safari</strong> pour pouvoir installer l&apos;app.
              </div>
            ) : env.iOS ? (
              <div className="bg-blue-50 rounded-xl p-2.5 text-[11px] font-medium text-blue-700 border border-blue-200 space-y-1">
                <p>1. Appuie sur <strong>Partager</strong> <Share className="inline w-3 h-3 mx-0.5" /></p>
                <p>2. Puis <strong>Sur l&apos;écran d&apos;accueil</strong> <PlusSquare className="inline w-3 h-3 mx-0.5" /></p>
              </div>
            ) : deferredPrompt ? (
              <button
                onClick={handleInstallClick}
                className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all text-white py-2 rounded-xl text-xs font-bold shadow-lg"
              >
                Installer l&apos;app
              </button>
            ) : (
              <div className="bg-slate-50 rounded-xl p-2.5 text-[11px] font-medium text-slate-600 border border-slate-200">
                Ouvre le menu (⋮) puis <strong>&quot;Ajouter à l&apos;écran d&apos;accueil&quot;</strong>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
