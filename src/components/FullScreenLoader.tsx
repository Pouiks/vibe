import { Spinner } from './Spinner';

// Écran de chargement plein écran unique (auth, redirections) : un seul
// visuel pour tous les états d'attente bloquants.
export function FullScreenLoader({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <div className="animate-pulse flex flex-col items-center">
        <Spinner size="xl" className="mb-4" />
        <p className="text-sm font-medium tracking-widest text-blue-600 uppercase">{label}</p>
      </div>
    </div>
  );
}
