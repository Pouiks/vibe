import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/core/supabase/server';
import { slugify } from '@/core/slug';

const CATEGORIES = ['sport', 'cafe', 'bar', 'other'];

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    // Réservé aux comptes admin (profiles.is_admin, non auto-attribuable).
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Connexion requise.' }, { status: 401 });
    }

    const admin = getAdminSupabase();
    const { data: profile } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs.' }, { status: 403 });
    }

    const body = await req.json();
    const { name, city, neighborhood, category, lat, lng, photo_url } = body ?? {};

    const isLabel = (v: unknown): v is string =>
      typeof v === 'string' && v.trim().length > 0 && v.length <= 80;

    if (!isLabel(name) || !isLabel(city) || !isLabel(neighborhood)) {
      return NextResponse.json({ error: 'Nom, ville et quartier sont requis (80 caractères max).' }, { status: 400 });
    }
    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ error: `Catégorie invalide. Valeurs possibles : ${CATEGORIES.join(', ')}.` }, { status: 400 });
    }
    const latN = Number(lat);
    const lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN) || Math.abs(latN) > 90 || Math.abs(lngN) > 180) {
      return NextResponse.json({ error: 'Coordonnées GPS invalides.' }, { status: 400 });
    }

    // La photo doit venir de notre bucket public, rien d'autre.
    let photoUrl: string | null = null;
    if (photo_url != null) {
      const allowedPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/venue-photos/`;
      if (typeof photo_url !== 'string' || !photo_url.startsWith(allowedPrefix)) {
        return NextResponse.json({ error: 'URL de photo invalide.' }, { status: 400 });
      }
      photoUrl = photo_url;
    }

    const citySlug = slugify(city);
    const parts = [citySlug, slugify(neighborhood), slugify(name)];
    if (parts.some(p => p.length === 0)) {
      return NextResponse.json({ error: 'Nom, ville ou quartier ne produit pas de slug valide.' }, { status: 400 });
    }
    const slug = parts.join('/');

    const { error: insertError } = await admin.from('venues').insert({
      slug,
      name: name.trim(),
      category,
      city_slug: citySlug,
      neighborhood: neighborhood.trim(),
      location: `SRID=4326;POINT(${lngN} ${latN})`, // EWKT : longitude d'abord
      owner_id: user.id,
      photo_url: photoUrl,
    });

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: `Un lieu avec le slug "${slug}" existe déjà.` }, { status: 409 });
      }
      console.error('[admin/venues] insert error:', insertError);
      return NextResponse.json({ error: 'Erreur lors de la création du lieu.' }, { status: 500 });
    }

    // Le trigger on_venue_created_secret doit avoir généré le token.
    const { data: venue } = await admin
      .from('venues')
      .select('id, slug, venue_secrets(scan_token)')
      .eq('slug', slug)
      .single();

    const secret = Array.isArray(venue?.venue_secrets) ? venue.venue_secrets[0] : venue?.venue_secrets;
    if (!secret?.scan_token) {
      return NextResponse.json(
        { error: 'Lieu créé mais aucun token généré : la migration secure_scan_and_rls.sql n\'a pas été exécutée.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      slug,
      url: `/l/${slug}`,
      qr_url: `/l/${slug}?t=${secret.scan_token}`,
    }, { status: 201 });
  } catch (error) {
    console.error('[admin/venues] error:', error);
    return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 });
  }
}
