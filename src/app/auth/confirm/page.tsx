import { Suspense } from 'react';
import ConfirmClient from './ConfirmClient';

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-medium tracking-widest text-blue-600 uppercase">Validation en cours...</p>
        </div>
      </div>
    }>
      <ConfirmClient />
    </Suspense>
  );
}
