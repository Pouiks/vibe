"use client";
import { useState, useEffect } from "react";
import { X, Download, Share, PlusSquare, ArrowDown, ArrowUp } from "lucide-react";

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
  iPad: boolean;
  visible: boolean;
}

interface InstallPromptProps {
  context?: "home" | "venue";
}

// Full-screen guide shown on iOS after tapping "Installer l'app": Safari has
// no install API, so an animated arrow points at the real Share button.
function IOSInstallOverlay({ shareTopRight, onClose }: { shareTopRight: boolean; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="absolute inset-x-6 top-1/2 -translate-y-1/2 max-w-sm mx-auto bg-card rounded-3xl p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="bg-blue-600 rounded-xl p-2 shadow-lg shadow-blue-600/20">
              <Download className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-slate-900 font-bold text-base">Installe ATOUTE</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ol className="space-y-3 mb-4">
          <li className="flex items-center gap-3 text-sm text-slate-700">
            <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">1</span>
            <span>
              Appuie sur <strong>Partager</strong>
              <span className="inline-flex items-center justify-center bg-blue-50 border border-blue-200 rounded-lg p-1 mx-1.5 align-middle">
                <Share className="w-3.5 h-3.5 text-blue-600" />
              </span>
              {shareTopRight ? "dans la barre d'adresse" : "juste en dessous"}
            </span>
          </li>
          <li className="flex items-center gap-3 text-sm text-slate-700">
            <span className="shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">2</span>
            <span>
              Choisis <strong>{shareTopRight ? "Ajouter à l'écran d'accueil" : "Sur l'écran d'accueil"}</strong>
              <span className="inline-flex items-center justify-center bg-blue-50 border border-blue-200 rounded-lg p-1 mx-1.5 align-middle">
                <PlusSquare className="w-3.5 h-3.5 text-blue-600" />
              </span>
            </span>
          </li>
        </ol>

        <button
          onClick={onClose}
          className="w-full bg-slate-100 hover:bg-slate-200 active:scale-95 transition-all text-slate-700 py-2.5 rounded-xl text-sm font-bold"
        >
          Compris
        </button>
      </div>

      {shareTopRight ? (
        <div className="absolute top-3 right-5 animate-point-up pointer-events-none">
          <ArrowUp className="w-10 h-10 text-white drop-shadow-lg" />
        </div>
      ) : (
        <div
          className="absolute bottom-2 left-1/2 -translate-x-1/2 animate-point-down pointer-events-none"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <ArrowDown className="w-10 h-10 text-white drop-shadow-lg" />
        </div>
      )}
    </div>
  );
}

export function InstallPrompt({ context = "home" }: InstallPromptProps) {
  const [env, setEnv] = useState<InstallEnv | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  // Fallback steps shown only after a click on browsers without install API (iOS)
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      !!(window.navigator as Navigator & { standalone?: boolean }).standalone;

    const ua = navigator.userAgent;
    // Modern iPad Safari reports a Macintosh UA; touch points tell it apart
    const iPad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const iOS = (/iPad|iPhone|iPod/.test(ua) && !("MSStream" in window)) || iPad;
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
    setEnv({ standalone, iOS, nonSafariIOS, iPad, visible });

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setEnv(prev => (prev ? { ...prev, visible: false } : prev));
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleDismiss = () => {
    setEnv(prev => (prev ? { ...prev, visible: false } : prev));
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Android / Chrome / Edge: native install dialog, one tap
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        setEnv(prev => (prev ? { ...prev, visible: false } : prev));
      }
      return;
    }
    // iOS and other browsers without install API: reveal the guided steps
    setShowHelp(true);
  };

  if (!env || env.standalone || !env.visible) return null;

  const isVenue = context === "venue";
  // iPhone Safari keeps Share in the bottom toolbar; Chrome iOS and iPad
  // Safari have it top right in the address bar
  const shareTopRight = env.nonSafariIOS || env.iPad;

  return (
    <div className={`${isVenue ? "px-3 py-2" : "fixed bottom-0 left-0 right-0 z-50 p-4 pb-8 animate-slide-up"}`}>
      <div className="bg-card p-3 rounded-2xl relative overflow-hidden shadow-lg border border-slate-200">

        <button
          onClick={handleDismiss}
          aria-label="Fermer"
          className="absolute top-2.5 right-2.5 text-slate-400 hover:text-slate-600 p-1 rounded-full bg-slate-100"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-3 pr-8">
          <div className="bg-blue-600 rounded-xl p-2.5 shadow-lg shadow-blue-600/20 shrink-0">
            <Download className="w-5 h-5 text-white" />
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="text-slate-900 font-bold text-sm">
              {isVenue ? "Ne rate aucun message de ce spot" : "ATOUTE sur ton téléphone"}
            </h3>
          </div>

          <button
            onClick={handleInstallClick}
            className="shrink-0 bg-blue-600 hover:bg-blue-700 active:scale-95 transition-all text-white px-4 py-2 rounded-xl text-xs font-bold shadow-lg"
          >
            Installer l&apos;app
          </button>
        </div>

        {showHelp && !env.iOS && (
          <div className="mt-2.5 bg-slate-50 rounded-xl p-2.5 text-[11px] font-medium text-slate-600 border border-slate-200">
            Ouvre le menu (⋮) puis <strong>&quot;Ajouter à l&apos;écran d&apos;accueil&quot;</strong>
          </div>
        )}
      </div>

      {showHelp && env.iOS && (
        <IOSInstallOverlay shareTopRight={shareTopRight} onClose={() => setShowHelp(false)} />
      )}
    </div>
  );
}
