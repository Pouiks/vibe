// Spinner unique de l'app : une seule taille de trait par gabarit, une seule
// couleur d'accent. `light` pour les fonds colorés (boutons, overlays).
export function Spinner({
  size = 'md',
  light = false,
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  light?: boolean;
  className?: string;
}) {
  const sizes: Record<string, string> = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-2',
    xl: 'w-12 h-12 border-4',
  };
  return (
    <div
      className={`${sizes[size]} ${light ? 'border-white' : 'border-blue-600'} border-t-transparent rounded-full animate-spin ${className}`}
      role="status"
      aria-label="Chargement"
    />
  );
}
