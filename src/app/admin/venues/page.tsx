"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useVibeStore } from '@/core/store/useVibeStore';
import { supabase } from '@/core/supabase/client';
import { ArrowLeft, MapPin, LocateFixed, CheckCircle2, QrCode, ShieldAlert, Sparkles, Camera } from 'lucide-react';

const CATEGORIES = [
  { value: 'sport', label: '🏀 Sport' },
  { value: 'cafe', label: '☕ Café' },
  { value: 'bar', label: '🍻 Bar' },
  { value: 'other', label: '📍 Autre' },
];

interface CreatedVenue {
  slug: string;
  url: string;
  qr_url: string;
}

export default function AdminVenuesPage() {
  const user = useVibeStore((state) => state.user);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [category, setCategory] = useState('sport');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreatedVenue | null>(null);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    supabase.from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (isMounted) setIsAdmin(!!data?.is_admin);
      });
    return () => { isMounted = false; };
  }, [user?.id]);

  const useMyPosition = () => {
    if (!navigator.geolocation) {
      setError('Géolocalisation non supportée par ce navigateur.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      (err) => {
        setError(`Position inaccessible : ${err.message}`);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // La photo part d'abord dans le bucket (policy admin-only), l'URL
      // publique est ensuite validée côté serveur.
      let photo_url: string | null = null;
      if (photoFile) {
        const ext = photoFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('venue-photos').upload(path, photoFile);
        if (uploadError) {
          setError(`Échec de l'envoi de la photo : ${uploadError.message}`);
          setLoading(false);
          return;
        }
        photo_url = supabase.storage.from('venue-photos').getPublicUrl(path).data.publicUrl;
      }

      const res = await fetch('/api/admin/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, city, neighborhood, category, lat, lng, photo_url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erreur inconnue.');
        return;
      }
      setCreated(data);
    } catch {
      setError('Erreur réseau. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center">
        <ShieldAlert className="w-12 h-12 text-slate-400 mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">Espace équipe</h1>
        <p className="text-slate-500 mb-6 max-w-sm text-sm">Connecte-toi avec ton compte pour continuer.</p>
        <Link href={`/login?returnUrl=${encodeURIComponent('/admin/venues')}`} className="bg-blue-600 px-4 py-2.5 rounded-xl text-white font-medium flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Connexion
        </Link>
      </div>
    );
  }

  if (isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center">
        <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">Accès réservé</h1>
        <p className="text-slate-500 mb-6 max-w-sm text-sm">Cette page est réservée aux administrateurs ATOUTE.</p>
        <Link href="/" className="bg-blue-600 px-4 py-2 rounded-xl text-white font-medium text-sm">Retour à l&apos;accueil</Link>
      </div>
    );
  }

  if (created) {
    return (
      <div className="min-h-screen p-6 flex flex-col items-center justify-center bg-slate-50 text-center">
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-1">Lieu créé !</h1>
        <p className="text-slate-500 text-sm mb-6">{created.slug}</p>

        <div className="flex flex-col gap-3 w-full max-w-sm">
          <Link href={created.qr_url} className="bg-blue-600 text-white font-semibold py-3 rounded-xl active:scale-95 flex items-center justify-center gap-2">
            <QrCode className="w-4 h-4" /> Tester le scan (lien QR)
          </Link>
          <Link href={created.url} className="bg-card border border-slate-200 text-slate-700 font-semibold py-3 rounded-xl active:scale-95 flex items-center justify-center gap-2">
            <MapPin className="w-4 h-4" /> Voir la page du lieu
          </Link>
          <button
            onClick={() => { setCreated(null); setName(''); setNeighborhood(''); setLat(''); setLng(''); }}
            className="text-blue-600 text-sm font-medium py-2">
            Créer un autre lieu
          </button>
        </div>

        <p className="text-[11px] text-slate-400 mt-8 max-w-sm leading-relaxed">
          Pour l&apos;affichette imprimable : <code className="bg-slate-100 px-1 rounded">npm run qr</code> sur ton poste.
          Le lien « Tester le scan » contient le token secret du lieu : ne le partage pas.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 flex flex-col bg-slate-50">
      <Link href="/" className="text-slate-500 mb-6 w-fit hover:text-slate-900 flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" /> Retour
      </Link>

      <div className="mb-8">
        <h1 className="text-3xl font-extrabold mb-2 text-slate-900">Nouveau lieu</h1>
        <p className="text-slate-500 text-sm">Le QR code du lieu sera généré automatiquement.</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-md">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-600 ml-1">Nom du lieu</label>
          <input type="text" required maxLength={80} value={name} onChange={e => setName(e.target.value)}
            placeholder="Ex: Terrain de Basket Montcalm"
            className="w-full bg-card border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-blue-500 text-slate-900" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-600 ml-1">Ville</label>
            <input type="text" required maxLength={80} value={city} onChange={e => setCity(e.target.value)}
              placeholder="Bordeaux"
              className="w-full bg-card border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-blue-500 text-slate-900" />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-slate-600 ml-1">Quartier</label>
            <input type="text" required maxLength={80} value={neighborhood} onChange={e => setNeighborhood(e.target.value)}
              placeholder="Montcalm"
              className="w-full bg-card border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-blue-500 text-slate-900" />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-600 ml-1">Catégorie</label>
          <div className="grid grid-cols-4 gap-2">
            {CATEGORIES.map(c => (
              <button key={c.value} type="button" onClick={() => setCategory(c.value)}
                className={`py-2.5 rounded-xl text-xs font-semibold border transition-all ${category === c.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-card text-slate-500 border-slate-200'}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-600 ml-1">Position GPS</label>
            <button type="button" onClick={useMyPosition} disabled={locating}
              className="text-blue-600 text-xs font-semibold flex items-center gap-1 disabled:opacity-50">
              <LocateFixed className="w-3.5 h-3.5" /> {locating ? 'Localisation…' : 'Ma position'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" required inputMode="decimal" value={lat} onChange={e => setLat(e.target.value)}
              placeholder="Latitude (44.8295)"
              className="w-full bg-card border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-blue-500 text-slate-900 text-sm" />
            <input type="text" required inputMode="decimal" value={lng} onChange={e => setLng(e.target.value)}
              placeholder="Longitude (-0.5950)"
              className="w-full bg-card border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-blue-500 text-slate-900 text-sm" />
          </div>
          <p className="text-[11px] text-slate-400 ml-1">Sur place, utilise « Ma position ». Sinon : clic droit sur Google Maps → copier les coordonnées.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-slate-600 ml-1">Photo du lieu <span className="text-slate-400 font-normal">(optionnel)</span></label>
          <label className="w-full bg-card border border-dashed border-slate-300 px-4 py-3 rounded-2xl text-sm text-slate-500 flex items-center gap-2 cursor-pointer active:border-blue-500">
            <Camera className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="truncate">{photoFile ? photoFile.name : 'Prendre ou choisir une photo'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={e => setPhotoFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <p className="text-[11px] text-slate-400 ml-1">Utile quand le lieu n&apos;a pas d&apos;adresse (terrain au milieu d&apos;un parc) : elle confirme qu&apos;on est au bon endroit.</p>
        </div>

        {error && <p className="text-red-500 text-sm text-center">{error}</p>}

        <button type="submit" disabled={loading || !name.trim()}
          className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-3.5 px-4 rounded-xl transition-all active:scale-95 disabled:opacity-50">
          {loading ? 'Création…' : 'Créer le lieu'}
        </button>
      </form>
    </div>
  );
}
