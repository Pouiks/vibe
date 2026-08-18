// Formatage temps partagé (cartes d'events, notifications, rappels).
// `now` est injectable pour les tests.

export function formatCountdown(startTime: string | Date, now: number = Date.now()): string {
  const diff = new Date(startTime).getTime() - now;
  if (diff <= 0) return 'Maintenant !';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Dans ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Dans ${hrs}h${mins % 60 > 0 ? (mins % 60).toString().padStart(2, '0') : ''}`;
  const days = Math.floor(hrs / 24);
  return `Dans ${days} j`;
}

// "sam. 22/08 · 14:00" — pour les events planifiés à plus de 24 h.
export function formatEventDate(startTime: string | Date): string {
  const d = new Date(startTime);
  const date = d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

// Countdown si l'event est dans moins de 24 h, sinon la date.
export function formatEventTiming(startTime: string | Date, now: number = Date.now()): string {
  const diff = new Date(startTime).getTime() - now;
  if (diff < 24 * 3600_000) return formatCountdown(startTime, now);
  return formatEventDate(startTime);
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h${m.toString().padStart(2, '0')}` : `${h}h`;
}
