// Crée un nouveau lieu dans Supabase (le token QR est généré automatiquement
// par le trigger on_venue_created_secret), puis rappelle de lancer `npm run qr`.
//
// Usage :
//   npm run venue -- --name "Terrain Montcalm" --city Bordeaux --quartier Montcalm --cat sport --lat 44.8295 --lng -0.5950
//
// Catégories : sport | cafe | bar | other
// Requiert dans .env : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv() {
  try {
    for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch { /* pas de .env : on compte sur l'environnement */ }
}
loadEnv();

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

function slugify(text) {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // retire les accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const args = parseArgs(process.argv.slice(2));
const CATEGORIES = ['sport', 'cafe', 'bar', 'other'];

const name = args.name;
const city = args.city;
const quartier = args.quartier;
const cat = args.cat;
const lat = parseFloat(args.lat);
const lng = parseFloat(args.lng);

const usage = 'Usage : npm run venue -- --name "Terrain Montcalm" --city Bordeaux --quartier Montcalm --cat sport --lat 44.8295 --lng -0.5950';

if (!name || !city || !quartier || !cat) {
  console.error(`Paramètre manquant.\n${usage}`);
  process.exit(1);
}
if (!CATEGORIES.includes(cat)) {
  console.error(`Catégorie invalide "${cat}". Valeurs possibles : ${CATEGORIES.join(', ')}`);
  process.exit(1);
}
if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
  console.error(`Coordonnées invalides (lat=${args.lat}, lng=${args.lng}). Rappel : --lat 44.83 --lng -0.59 (latitude d'abord).`);
  process.exit(1);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Il manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY dans .env.\n' +
    'La clé service role se trouve dans Supabase → Settings → API keys.'
  );
  process.exit(1);
}

const citySlug = slugify(city);
const slug = `${citySlug}/${slugify(quartier)}/${slugify(name)}`;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const { error } = await supabase.from('venues').insert({
  slug,
  name,
  category: cat,
  city_slug: citySlug,
  neighborhood: quartier,
  location: `SRID=4326;POINT(${lng} ${lat})`, // EWKT : longitude d'abord
});

if (error) {
  if (error.code === '23505') {
    console.error(`Un lieu avec le slug "${slug}" existe déjà.`);
  } else {
    console.error('Erreur Supabase :', error.message);
  }
  process.exit(1);
}

// Le trigger a dû générer le token : on vérifie avant de crier victoire.
const { data: venue } = await supabase
  .from('venues')
  .select('id, slug, venue_secrets(scan_token)')
  .eq('slug', slug)
  .single();

const secret = Array.isArray(venue?.venue_secrets) ? venue.venue_secrets[0] : venue?.venue_secrets;
if (!secret?.scan_token) {
  console.error(
    `Lieu créé (${slug}) mais AUCUN token généré : la migration secure_scan_and_rls.sql\n` +
    "n'a probablement pas été exécutée dans le SQL Editor Supabase. Exécute-la puis relance ce script : il détectera le lieu existant."
  );
  process.exit(1);
}

console.log(`✓ Lieu créé : ${name}`);
console.log(`  slug : ${slug}`);
console.log(`  page : /l/${slug}`);
console.log('  token QR généré automatiquement.');
console.log('\nProchaine étape : npm run qr  (génère l\'affichette dans qr-output/)');
