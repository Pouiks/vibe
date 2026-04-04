"use client";
import { useState, useEffect } from "react";
import { X, Download, Share, PlusSquare, Compass } from "lucide-react";

export function InstallPrompt() {
  const [isIOS, setIsIOS] = useState(false);
  const [isChromeIOS, setIsChromeIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(true); // Default true to prevent flash
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Determine if the app is already installed
    const isPwa = window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone;
    setIsStandalone(!!isPwa);

    // Detect iOS and Chrome on iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const chromeIOS = navigator.userAgent.includes("CriOS");
    setIsIOS(iOS);
    setIsChromeIOS(chromeIOS);

    // Capture the generic Android/Desktop Chrome install event
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // If not installed and haven't dismissed recently, show the prompt
    if (!isPwa) {
      const dismissed = localStorage.getItem("vibe_install_dismissed");
      if (!dismissed) {
        setIsVisible(true);
      }
    }

    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem("vibe_install_dismissed", "true");
  };

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setIsVisible(false);
      }
    }
  };

  if (isStandalone || !isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 animate-slide-up pb-8">
      <div className="glass p-5 rounded-3xl relative overflow-hidden shadow-[0_0_40px_rgba(99,102,241,0.2)] border border-brand-500/30">
        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500 rounded-full mix-blend-screen filter blur-[50px] opacity-20 pointer-events-none"></div>
        
        <button 
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-slate-400 hover:text-white p-1 rounded-full bg-vibe-dark/50"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className="bg-brand-500 rounded-2xl p-3 shadow-lg shadow-brand-500/20 shrink-0">
            <Download className="w-6 h-6 text-white" />
          </div>
          
          <div className="pt-0.5">
            <h3 className="text-white font-bold text-sm mb-1">Installer VibeSpot</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-3">
              Ajoute l'app sur ton écran d'accueil pour l'ouvrir en fond d'écran !
            </p>
            
            {isChromeIOS ? (
              <div className="bg-orange-500/20 rounded-xl p-3 text-[11px] font-medium text-orange-200 border border-orange-500/50">
                <Compass className="inline w-3 h-3 mr-1 -mt-0.5" />
                Apple bloque l'installation via Chrome. Ouvre ce lien dans <strong>Safari</strong> pour l'installer.
              </div>
            ) : isIOS ? (
              <div className="bg-vibe-dark/80 rounded-xl p-3 text-[11px] font-medium text-slate-300 border border-slate-700/50">
                1. Appuie sur **Partager** <Share className="inline w-3 h-3 mx-1" /><br/>
                2. Fais défiler puis **Sur l'écran d'accueil** <PlusSquare className="inline w-3 h-3 mx-1" />
              </div>
            ) : deferredPrompt ? (
              <button 
                onClick={handleInstallClick}
                className="w-full bg-brand-600 hover:bg-brand-500 active:scale-95 transition-all text-white py-2 rounded-xl text-xs font-bold shadow-lg"
              >
                Cliquer ici pour installer
              </button>
            ) : (
              <div className="bg-vibe-dark/80 rounded-xl p-3 text-[11px] font-medium text-slate-300 border border-slate-700/50">
                Ouvre le menu de ton navigateur (⋮) en haut à droite puis clique sur **"Ajouter à l'écran d'accueil"**
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
