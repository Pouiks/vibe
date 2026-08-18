// Génère les affichettes QR imprimables (A5) de chaque lieu, avec le token de
// scan lu en base. Sortie dans qr-output/ (gitignoré : les tokens sont des
// secrets d'accès aux spots).
//
// Usage :  npm run qr
// Requiert dans .env : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optionnel : APP_BASE_URL (défaut : https://vibe-ten-pi.vercel.app)

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BASE_URL = process.env.APP_BASE_URL || 'https://vibe-ten-pi.vercel.app';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Il manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY dans .env.\n' +
    'La clé service role se trouve dans Supabase → Settings → API keys.'
  );
  process.exit(1);
}

const TAGLINES = {
  sport: 'Trouve des joueurs, lance un match.',
  cafe: 'Découvre qui est là, discute.',
  bar: 'Découvre qui est là, discute.',
  other: 'Discute avec ceux qui sont ici.',
};

const logoDataUri = `data:image/png;base64,${readFileSync(resolve(root, 'public/vibeSpot-192x192.png')).toString('base64')}`;

function posterHtml(venue, qrSvg) {
  const tagline = TAGLINES[venue.category] || TAGLINES.other;
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>QR — ${venue.name}</title>
<style>
  @page { size: A5 portrait; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; background: #f1f5f9; }
  .poster {
    width: 148mm; height: 210mm; background: #fff; color: #0f172a;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    padding: 14mm 12mm; border: 1mm solid #2563eb; border-radius: 6mm;
  }
  @media print { body { background: #fff; } .poster { border-radius: 0; } }
  .brand { display: flex; align-items: center; gap: 4mm; }
  .brand img { width: 12mm; height: 12mm; border-radius: 3mm; }
  .brand span { font-size: 10mm; font-weight: 800; letter-spacing: 0.5mm; }
  h1 { font-size: 9mm; margin-top: 10mm; line-height: 1.2; }
  .tagline { font-size: 5mm; color: #475569; margin-top: 3mm; }
  .qr { position: relative; width: 78mm; height: 78mm; margin-top: 9mm; }
  .qr svg { width: 100%; height: 100%; }
  .qr .logo {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 16mm; height: 16mm; border-radius: 4mm; background: #fff; padding: 1.5mm;
  }
  .steps { margin-top: 9mm; font-size: 4.2mm; color: #334155; line-height: 1.9; text-align: left; }
  .steps b { color: #2563eb; }
  .venue { margin-top: auto; font-size: 4mm; color: #94a3b8; }
</style>
</head>
<body>
<div class="poster">
  <div class="brand"><img src="${logoDataUri}" alt=""><span>VIBE</span></div>
  <h1>Scanne-moi&nbsp;!</h1>
  <p class="tagline">${tagline}</p>
  <div class="qr">${qrSvg}<img class="logo" src="${logoDataUri}" alt=""></div>
  <div class="steps">
    <div><b>1.</b> Scanne le QR code avec ton appareil photo</div>
    <div><b>2.</b> Connecte-toi — pseudo anonyme automatique</div>
    <div><b>3.</b> Discute et rejoins les events de ce lieu</div>
  </div>
  <div class="venue">${venue.name} · ${venue.city_slug}${venue.neighborhood ? ' · ' + venue.neighborhood : ''}</div>
</div>
</body>
</html>`;
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const { data: venues, error } = await supabase
  .from('venues')
  .select('slug, name, category, city_slug, neighborhood, venue_secrets(scan_token)')
  .order('slug');

if (error) {
  console.error('Erreur Supabase :', error.message);
  process.exit(1);
}

const outDir = resolve(root, 'qr-output');
mkdirSync(outDir, { recursive: true });

const index = [];
for (const venue of venues) {
  const secret = Array.isArray(venue.venue_secrets) ? venue.venue_secrets[0] : venue.venue_secrets;
  if (!secret?.scan_token) {
    console.warn(`⚠ ${venue.slug} : pas de scan_token (migration secure_scan_and_rls.sql exécutée ?) — ignoré`);
    continue;
  }
  const qrUrl = `${BASE_URL}/l/${venue.slug}?t=${secret.scan_token}`;
  // Correction d'erreur H : le QR reste lisible avec le logo par-dessus.
  const qrSvg = await QRCode.toString(qrUrl, { type: 'svg', errorCorrectionLevel: 'H', margin: 0 });
  const file = `affiche-${venue.slug.replaceAll('/', '_')}.html`;
  writeFileSync(resolve(outDir, file), posterHtml(venue, qrSvg));
  index.push({ name: venue.name, slug: venue.slug, file, qr_url: qrUrl });
  console.log(`✓ ${venue.slug} → qr-output/${file}`);
}

writeFileSync(
  resolve(outDir, 'index.html'),
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Affichettes QR VIBE</title>
<style>body{font-family:sans-serif;padding:2rem;max-width:640px;margin:auto}h1{font-size:1.4rem}li{margin:.5rem 0}</style></head>
<body><h1>Affichettes QR — ouvrir puis Ctrl+P (format A5)</h1><ul>
${index.map(v => `<li><a href="${v.file}">${v.name}</a> <small>(${v.slug})</small></li>`).join('\n')}
</ul></body></html>`
);
writeFileSync(resolve(outDir, 'qr-codes.json'), JSON.stringify({ base_url: BASE_URL, venues: index }, null, 2));

console.log(`\n${index.length} affichette(s) générée(s) dans qr-output/ — ouvre qr-output/index.html pour imprimer.`);
