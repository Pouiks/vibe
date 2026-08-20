"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useVibeStore } from '@/core/store/useVibeStore';
import { supabase } from '@/core/supabase/client';
import { MapPin, LocateFixed, CheckCircle2, QrCode, ShieldAlert, Sparkles, Camera, Pencil, Lightbulb, Trash2 } from 'lucide-react';
import { BackButton } from '@/components/BackButton';

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

interface AdminVenue {
  id: string;
  slug: string;
  name: string;
  category: string;
  neighborhood: string | null;
  tagline: string | null;
  photo_url: string | null;
}

export default function AdminVenuesPage() {
  const user = useVibeStore((state) => state.user);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [category, setCategory] = useState('sport');
  const [tagline, setTagline] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreatedVenue | null>(null);

  // ── Édition des lieux existants (slug et QR jamais modifiés)
  const [venues, setVenues] = useState<AdminVenue[]>([]);
  const [editing, setEditing] = useState<AdminVenue | null>(null);
  const [editForm, setEditForm] = useState({ name: '', category: 'sport', tagline: '', lat: '', lng: '' });
  const [editPhotoFile, setEditPhotoFile] = useState<File | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const loadVenues = async () => {
    // tagline peut être absente de la vue tant que view_add_tagline.sql
    // n'est pas passée : la liste doit s'afficher quand même.
    const first = await supabase
      .from('venues_with_coords')
      .select('id, slug, name, category, neighborhood, tagline, photo_url, lat, lng')
      .order('name');
    let data = first.data as unknown as AdminVenue[] | null;
    let error = first.error;
    if (error && /tagline/i.test(error.message)) {
      const retry = await supabase
        .from('venues_with_coords')
        .select('id, slug, name, category, neighborhood, photo_url, lat, lng')
        .order('name');
      data = retry.data as unknown as AdminVenue[] | null;
      error = retry.error;
    }
    if (error) console.error('[admin/venues] list error:', error.message);
    if (data) setVenues(data);
  };

  // ── Suggestions de lieux envoyées par les membres (venue_suggestions.sql)
  interface Suggestion { id: string; content: string; created_at: string; profiles: { username: string } | { username: string }[] | null }
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const loadSuggestions = async () => {
    const { data } = await supabase
      .from('venue_suggestions')
      .select('id, content, created_at, profiles:user_id(username)')
      .order('created_at', { ascending: false });
    if (data) setSuggestions(data as unknown as Suggestion[]);
  };
  const deleteSuggestion = async (id: string) => {
    const { error: delError } = await supabase.from('venue_suggestions').delete().eq('id', id);
    if (!delError) setSuggestions(prev => prev.filter(s => s.id !== id));
  };

  useEffect(() => {
    if (isAdmin) {
      loadVenues();
      loadSuggestions();
    }
  }, [isAdmin]);

  const startEdit = (v: AdminVenue & { lat?: number; lng?: number }) => {
    setEditing(v);
    setEditError('');
    setEditPhotoFile(null);
    setEditForm({
      name: v.name,
      category: v.category,
      tagline: v.tagline || '',
      lat: v.lat !== undefined ? String(v.lat) : '',
      lng: v.lng !== undefined ? String(v.lng) : '',
    });
  };

  const handleDelete = async (v: AdminVenue) => {
    const confirmed = window.confirm(
      `Supprimer définitivement « ${v.name} » ?\n\nTous ses messages, events, membres et son QR code seront détruits. Les affiches imprimées de ce lieu ne fonctionneront plus jamais.`
    );
    if (!confirmed) return;
    const typed = window.prompt('Pour confirmer, tape SUPPRIMER en majuscules :');
    if (typed !== 'SUPPRIMER') return;

    setEditError('');
    try {
      const res = await fetch('/api/admin/venues', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: v.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || 'Erreur inconnue.');
        return;
      }
      setEditing(null);
      await loadVenues();
    } catch {
      setEditError('Erreur réseau. Réessaie.');
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setEditSaving(true);
    setEditError('');
    try {
      let photo_url: string | undefined;
      if (editPhotoFile) {
        const ext = editPhotoFile.name.split('.').pop()?.toLowerCase() || 'jpg';
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from('venue-photos').upload(path, editPhotoFile);
        if (uploadError) {
          setEditError(`Échec de l'envoi de la photo : ${uploadError.message}`);
          return;
        }
        photo_url = supabase.storage.from('venue-photos').getPublicUrl(path).data.publicUrl;
      }

      const res = await fetch('/api/admin/venues', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: editing.id,
          name: editForm.name,
          category: editForm.category,
          tagline: editForm.tagline.trim() || null,
          ...(photo_url ? { photo_url } : {}),
          ...(editForm.lat && editForm.lng ? { lat: editForm.lat, lng: editForm.lng } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || 'Erreur inconnue.');
        return;
      }
      setEditing(null);
      await loadVenues();
    } catch {
      setEditError('Erreur réseau. Réessaie.');
    } finally {
      setEditSaving(false);
    }
  };

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
        body: JSON.stringify({ name, city, neighborhood, category, lat, lng, photo_url, tagline: tagline.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Erreur inconnue.');
        return;
      }
      setCreated(data);
    } catch {
      setError('Erreur réseau. Réessaie.');
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
      <BackButton withSwipe className="text-slate-500 mb-6 w-fit hover:text-slate-900 inline-flex items-center gap-1 text-sm" />

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
          <label className="text-sm font-medium text-slate-600 ml-1">Accroche de l&apos;affiche <span className="text-slate-400 font-normal">(optionnel)</span></label>
          <input type="text" maxLength={120} value={tagline} onChange={e => setTagline(e.target.value)}
            placeholder="Ex: Le spot du quartier pour se retrouver."
            className="w-full bg-card border border-slate-200 px-4 py-3 rounded-2xl outline-none focus:border-blue-500 text-slate-900" />
          <p className="text-[11px] text-slate-400 ml-1">Affichée sous « Scanne-moi ! » sur l&apos;affichette QR. Vide = phrase générique de la catégorie.</p>
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

      {/* ── Lieux existants ── */}
      {venues.length > 0 && (
        <div className="mt-12 max-w-md">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4 ml-1">Lieux existants</h2>
          <div className="flex flex-col gap-2">
            {venues.map(v => (
              <div key={v.id} className="bg-card border border-slate-200 rounded-2xl overflow-hidden">
                <div className="flex items-center gap-2 px-3.5 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{v.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">{v.slug}</p>
                  </div>
                  <button
                    onClick={() => (editing?.id === v.id ? setEditing(null) : startEdit(v))}
                    className={`p-2 rounded-full active:scale-90 transition-transform ${editing?.id === v.id ? 'text-blue-600 bg-blue-50' : 'text-slate-400'}`}
                    title="Modifier ce lieu"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                </div>

                {editing?.id === v.id && (
                  <form onSubmit={handleEditSubmit} className="border-t border-slate-200 p-3.5 flex flex-col gap-3">
                    <p className="text-[11px] text-slate-400">Le lien et le QR code du lieu ne changent pas : les affiches imprimées restent valides.</p>
                    <input type="text" required maxLength={80} value={editForm.name}
                      onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Nom du lieu"
                      className="w-full bg-card border border-slate-200 px-3.5 py-2.5 rounded-xl outline-none focus:border-blue-500 text-slate-900 text-sm" />
                    <div className="grid grid-cols-4 gap-2">
                      {CATEGORIES.map(c => (
                        <button key={c.value} type="button" onClick={() => setEditForm(f => ({ ...f, category: c.value }))}
                          className={`py-2 rounded-xl text-[11px] font-semibold border transition-all ${editForm.category === c.value ? 'bg-blue-600 text-white border-blue-600' : 'bg-card text-slate-500 border-slate-200'}`}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                    <input type="text" maxLength={120} value={editForm.tagline}
                      onChange={e => setEditForm(f => ({ ...f, tagline: e.target.value }))}
                      placeholder="Accroche de l'affiche (optionnel)"
                      className="w-full bg-card border border-slate-200 px-3.5 py-2.5 rounded-xl outline-none focus:border-blue-500 text-slate-900 text-sm" />
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" inputMode="decimal" value={editForm.lat}
                        onChange={e => setEditForm(f => ({ ...f, lat: e.target.value }))}
                        placeholder="Latitude"
                        className="w-full bg-card border border-slate-200 px-3.5 py-2.5 rounded-xl outline-none focus:border-blue-500 text-slate-900 text-sm" />
                      <input type="text" inputMode="decimal" value={editForm.lng}
                        onChange={e => setEditForm(f => ({ ...f, lng: e.target.value }))}
                        placeholder="Longitude"
                        className="w-full bg-card border border-slate-200 px-3.5 py-2.5 rounded-xl outline-none focus:border-blue-500 text-slate-900 text-sm" />
                    </div>
                    <label className="w-full bg-card border border-dashed border-slate-300 px-3.5 py-2.5 rounded-xl text-sm text-slate-500 flex items-center gap-2 cursor-pointer active:border-blue-500">
                      <Camera className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="truncate">{editPhotoFile ? editPhotoFile.name : (v.photo_url ? 'Remplacer la photo' : 'Ajouter une photo')}</span>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => setEditPhotoFile(e.target.files?.[0] ?? null)} />
                    </label>
                    {editError && <p className="text-red-500 text-xs text-center">{editError}</p>}
                    <button type="submit" disabled={editSaving || !editForm.name.trim()}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-xl transition-all active:scale-95 disabled:opacity-50 text-sm">
                      {editSaving ? 'Enregistrement…' : 'Enregistrer'}
                    </button>
                    <button type="button" onClick={() => handleDelete(v)}
                      className="w-full bg-red-50 text-red-500 font-medium py-2.5 rounded-xl transition-all active:scale-95 text-sm">
                      Supprimer ce lieu…
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Suggestions des membres ── */}
      {suggestions.length > 0 && (
        <div className="mt-12 max-w-md">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-4 ml-1 flex items-center gap-1.5">
            <Lightbulb className="w-3.5 h-3.5 text-blue-600" /> Suggestions des membres
          </h2>
          <div className="flex flex-col gap-2">
            {suggestions.map(s => {
              const profile = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
              return (
                <div key={s.id} className="bg-card border border-slate-200 rounded-2xl p-3.5 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 whitespace-pre-wrap break-words">{s.content}</p>
                    <p className="text-[10px] text-slate-400 mt-1.5">
                      {profile?.username || 'Membre'} · {new Date(s.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteSuggestion(s.id)}
                    className="p-1.5 rounded-full text-slate-400 active:text-red-500 shrink-0"
                    title="Supprimer cette suggestion"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
