"use client";
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QrScanner from 'qr-scanner';
import { X, CameraOff } from 'lucide-react';
import { parseScanResult } from './parseScanResult';

export default function QRScannerOverlay({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraError, setCameraError] = useState(false);
  const [badQR, setBadQR] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let navigated = false;
    let badQRTimer: ReturnType<typeof setTimeout>;

    const scanner = new QrScanner(
      video,
      (result) => {
        if (navigated) return;
        const path = parseScanResult(result.data);
        if (path) {
          navigated = true;
          scanner.stop();
          router.push(path);
        } else {
          setBadQR(true);
          clearTimeout(badQRTimer);
          badQRTimer = setTimeout(() => setBadQR(false), 2500);
        }
      },
      {
        returnDetailedScanResult: true,
        preferredCamera: 'environment',
        highlightScanRegion: true,
        highlightCodeOutline: true,
      }
    );

    scanner.start().catch((err) => {
      console.error('[QRScanner]', err);
      setCameraError(true);
    });

    return () => {
      clearTimeout(badQRTimer);
      scanner.destroy();
    };
  }, [router]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 z-10">
        <h2 className="text-white font-bold text-base">Scanner un QR code</h2>
        <button onClick={onClose} className="p-2 -mr-2 text-white/80 active:text-white" aria-label="Fermer">
          <X className="w-6 h-6" />
        </button>
      </div>

      {cameraError ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-4">
          <CameraOff className="w-12 h-12 text-white/60" />
          <p className="text-white font-semibold">Caméra inaccessible</p>
          <p className="text-white/60 text-sm leading-relaxed">
            Autorise l&apos;accès à la caméra dans les réglages de ton navigateur,
            ou scanne le QR code du lieu avec ton appareil photo.
          </p>
          <button onClick={onClose} className="mt-2 bg-card text-slate-900 font-semibold py-2.5 px-6 rounded-xl active:scale-95">
            Fermer
          </button>
        </div>
      ) : (
        <div className="flex-1 relative min-h-0">
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-x-0 bottom-[max(2rem,env(safe-area-inset-bottom))] flex justify-center px-6">
            <p className={`text-sm font-medium px-4 py-2 rounded-full backdrop-blur-md ${badQR ? 'bg-red-500/80 text-white' : 'bg-black/50 text-white/90'}`}>
              {badQR ? "Ce QR code n'est pas un spot ATOUTE" : 'Vise le QR code affiché sur place'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
