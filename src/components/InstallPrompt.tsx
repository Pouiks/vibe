"use client";
import { useState, useEffect } from "react";
import { X, Download, Share, PlusSquare, Compass, Bell } from "lucide-react";

const DISMISS_KEY = "vibe_install_dismissed_at";
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24 h

interface InstallPromptProps {
  context?: "home" | "venue";
}

export function InstallPrompt({ context = "home" }: InstallPromptProps) {
  const [isIOS, setIsIOS] = useState(false);
  const [isChromeIOS, setIsChromeIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(true);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const isPwa = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone;
    setIsStandalone(!!isPwa);

    const ua = navigator.userAgent;
    const iOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    // Any iOS browser that is NOT Safari (CriOS=Chrome, FxiOS=Firefox, EdgiOS=Edge, OPiOS=Opera, Ecosia, Brave…)
    const nonSafariIOS = iOS && (
      /CriOS|FxiOS|EdgiOS|OPiOS|Ecosia|Brave|DuckDuckGo|GSA/i.test(ua)
    );
    setIsIOS(iOS);
    setIsChromeIOS(nonSafariIOS);

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    if (!isPwa) {
      const dismissedAt = localStorage.getItem(DISMISS_KEY);
      if (!dismissedAt || Date.now() - Number(dismissedAt) > DISMISS_DURATION_MS) {
        localStorage.removeItem(DISMISS_KEY);
        setIsVisible(true);
      }
    }

    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        setIsVisible(false);
      }
    }
  };

  if (isStandalone || !isVisible) return null;

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

            {isChromeIOS ? (
              <div className="bg-orange-50 rounded-xl p-2.5 text-[11px] font-medium text-orange-700 border border-orange-200">
                <Compass className="inline w-3 h-3 mr-1 -mt-0.5" />
                Sur iPhone, ouvre ce lien dans <strong>Safari</strong> pour pouvoir installer l'app.
              </div>
            ) : isIOS ? (
              <div className="bg-blue-50 rounded-xl p-2.5 text-[11px] font-medium text-blue-700 border border-blue-200 space-y-1">
                <p>1. Appuie sur <strong>Partager</strong> <Share className="inline w-3 h-3 mx-0.5" /></p>
                <p>2. Puis <strong>Sur l'écran d'accueil</strong> <PlusSquare className="inline w-3 h-3 mx-0.5" /></p>
              </div>
            ) : deferredPrompt ? (
              <button
                onClick={handleInstallClick}
                className="w-full bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all text-white py-2 rounded-xl text-xs font-bold shadow-lg"
              >
                Installer l'app
              </button>
            ) : (
              <div className="bg-slate-50 rounded-xl p-2.5 text-[11px] font-medium text-slate-600 border border-slate-200">
                Ouvre le menu (⋮) puis <strong>"Ajouter à l'écran d'accueil"</strong>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
