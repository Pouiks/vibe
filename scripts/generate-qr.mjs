// Génère les affichettes QR imprimables (A5) de chaque lieu, avec le token de
// scan lu en base. Sortie dans qr-output/ (gitignoré : les tokens sont des
// secrets d'accès aux spots).
//
// Usage :  npm run qr
// Requiert dans .env : NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optionnel : APP_BASE_URL (défaut : https://atoute.app)

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
const BASE_URL = process.env.APP_BASE_URL || 'https://atoute.app';

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

const logoDataUri = `data:image/png;base64,${readFileSync(resolve(root, 'public/icons/icon-192x192.png')).toString('base64')}`;

// Tout texte issu de la base (nom, accroche saisie par l'admin) est échappé :
// un « & » ou « < » ne doit jamais casser l'affiche imprimée.
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Règle unique de l'accroche : celle du lieu, sinon la phrase de catégorie
const taglineFor = (venue) => esc(venue.tagline || TAGLINES[venue.category] || TAGLINES.other);

function posterHtml(venue, qrSvg) {
  const tagline = taglineFor(venue);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>QR · ${esc(venue.name)}</title>
<style>
  @page { size: A5 portrait; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; background: #f1f5f9; }
  .poster {
    width: 148mm; height: 210mm; background: #fff; color: #0f172a;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    padding: 14mm 12mm; border: 1mm solid #FF684F; border-radius: 6mm;
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
  .steps b { color: #FF684F; }
  .venue { margin-top: auto; font-size: 4mm; color: #94a3b8; }
</style>
</head>
<body>
<div class="poster">
  <div class="brand"><img src="${logoDataUri}" alt=""><span>ATOUTE</span></div>
  <h1>Scanne-moi&nbsp;!</h1>
  <p class="tagline">${tagline}</p>
  <div class="qr">${qrSvg}<img class="logo" src="${logoDataUri}" alt=""></div>
  <div class="steps">
    <div><b>1.</b> Scanne le QR code avec ton appareil photo</div>
    <div><b>2.</b> Connecte-toi : pseudo anonyme automatique</div>
    <div><b>3.</b> Discute et rejoins les events de ce lieu</div>
  </div>
  <div class="venue">${esc(venue.name)} · ${esc(venue.city_slug)}${venue.neighborhood ? ' · ' + esc(venue.neighborhood) : ''}</div>
</div>
</body>
</html>`;
}

// A6 (105 × 148 mm) : petit support, contenu condensé
function posterA6Html(venue, qrSvg) {
  const tagline = taglineFor(venue);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>QR A6 · ${esc(venue.name)}</title>
<style>
  @page { size: A6 portrait; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; background: #f1f5f9; }
  .poster {
    width: 105mm; height: 148mm; background: #fff; color: #0f172a;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    padding: 8mm; border: 0.8mm solid #FF684F; border-radius: 4mm;
  }
  @media print { body { background: #fff; } .poster { border-radius: 0; } }
  .brand { display: flex; align-items: center; gap: 2.5mm; }
  .brand img { width: 8mm; height: 8mm; border-radius: 2mm; }
  .brand span { font-size: 7mm; font-weight: 800; letter-spacing: 0.3mm; }
  h1 { font-size: 6.5mm; margin-top: 5mm; }
  .tagline { font-size: 3.6mm; color: #475569; margin-top: 2mm; }
  .qr { position: relative; width: 62mm; height: 62mm; margin-top: 6mm; }
  .qr svg { width: 100%; height: 100%; }
  .qr .logo {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 13mm; height: 13mm; border-radius: 3mm; background: #fff; padding: 1.2mm;
  }
  .how { margin-top: 6mm; font-size: 3.4mm; color: #334155; }
  .how b { color: #FF684F; }
  .venue { margin-top: auto; font-size: 3.2mm; color: #94a3b8; }
</style>
</head>
<body>
<div class="poster">
  <div class="brand"><img src="${logoDataUri}" alt=""><span>ATOUTE</span></div>
  <h1>Scanne-moi&nbsp;!</h1>
  <p class="tagline">${tagline}</p>
  <div class="qr">${qrSvg}<img class="logo" src="${logoDataUri}" alt=""></div>
  <p class="how"><b>Scanne</b> avec ton appareil photo, <b>connecte-toi</b>, discute.</p>
  <div class="venue">${esc(venue.name)} · ${esc(venue.city_slug)}</div>
</div>
</body>
</html>`;
}

// Sticker carré 100 × 100 mm (format standard des imprimeurs d'autocollants,
// polymère extérieur) : l'essentiel, pour poteau / table / vitrine
function stickerHtml(venue, qrSvg) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Sticker · ${esc(venue.name)}</title>
<style>
  @page { size: 100mm 100mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; background: #f1f5f9; }
  .sticker {
    width: 100mm; height: 100mm; background: #fff; color: #0f172a;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    padding: 5mm; border: 1mm solid #FF684F; border-radius: 5mm;
  }
  @media print { body { background: #fff; } .sticker { border-radius: 0; } }
  h1 { font-size: 7mm; display: flex; align-items: center; gap: 2.5mm; }
  h1 img { width: 8mm; height: 8mm; border-radius: 2mm; }
  .qr { position: relative; width: 68mm; height: 68mm; margin-top: 3mm; }
  .qr svg { width: 100%; height: 100%; }
  .qr .logo {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 14mm; height: 14mm; border-radius: 3mm; background: #fff; padding: 1.2mm;
  }
  .venue { margin-top: auto; font-size: 3.5mm; color: #94a3b8; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
</head>
<body>
<div class="sticker">
  <h1><img src="${logoDataUri}" alt="">Scanne-moi&nbsp;!</h1>
  <div class="qr">${qrSvg}<img class="logo" src="${logoDataUri}" alt=""></div>
  <div class="venue">${esc(venue.name)} · atoute.app</div>
</div>
</body>
</html>`;
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// tagline peut être absente tant que add_venue_tagline.sql n'a pas été
// exécutée : on retombe alors sur les phrases de catégorie.
let { data: venues, error } = await supabase
  .from('venues')
  .select('slug, name, category, tagline, city_slug, neighborhood, venue_secrets(scan_token)')
  .order('slug');

if (error && /tagline/i.test(error.message)) {
  console.warn('⚠ Colonne tagline absente (migration add_venue_tagline.sql non exécutée) : accroches génériques.');
  ({ data: venues, error } = await supabase
    .from('venues')
    .select('slug, name, category, city_slug, neighborhood, venue_secrets(scan_token)')
    .order('slug'));
}

if (error) {
  console.error('Erreur Supabase :', error.message);
  process.exit(1);
}

const outDir = resolve(root, 'qr-output');
mkdirSync(outDir, { recursive: true });

// Sticker 100 × 100 mm AVEC fond perdu 3 mm : page 106 × 106, cadre corail
// débordant — la coupe de l'imprimeur peut dévier sans laisser de filet blanc.
function stickerBleedHtml(venue, qrSvg) {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Sticker fond perdu · ${esc(venue.name)}</title>
<style>
  @page { size: 106mm 106mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; display: flex; justify-content: center; background: #f1f5f9; }
  /* 106 mm = 100 de coupe + 3 mm de débord par côté, entièrement corail */
  .bleed {
    width: 106mm; height: 106mm; background: #FF684F;
    display: flex; align-items: center; justify-content: center;
  }
  .sticker {
    width: 94mm; height: 94mm; background: #fff; color: #0f172a; border-radius: 4mm;
    display: flex; flex-direction: column; align-items: center; text-align: center;
    padding: 4.5mm;
  }
  h1 { font-size: 7mm; display: flex; align-items: center; gap: 2.5mm; }
  h1 img { width: 8mm; height: 8mm; border-radius: 2mm; }
  .qr { position: relative; width: 64mm; height: 64mm; margin-top: 3mm; }
  .qr svg { width: 100%; height: 100%; }
  .qr .logo {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 13mm; height: 13mm; border-radius: 3mm; background: #fff; padding: 1.2mm;
  }
  .venue { margin-top: auto; font-size: 3.5mm; color: #94a3b8; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
</head>
<body>
<div class="bleed">
<div class="sticker">
  <h1><img src="${logoDataUri}" alt="">Scanne-moi&nbsp;!</h1>
  <div class="qr">${qrSvg}<img class="logo" src="${logoDataUri}" alt=""></div>
  <div class="venue">${esc(venue.name)} · atoute.app</div>
</div>
</div>
</body>
</html>`;
}

const FORMATS = [
  { key: 'a5', label: 'A5', prefix: 'affiche-a5', render: posterHtml },
  { key: 'a6', label: 'A6', prefix: 'affiche-a6', render: posterA6Html },
  { key: 'sticker', label: 'Sticker 10×10 cm', prefix: 'sticker', render: stickerHtml },
  { key: 'stickerBleed', label: 'Sticker 10×10 + fond perdu 3 mm', prefix: 'sticker-fp', render: stickerBleedHtml },
];

const index = [];
for (const venue of venues) {
  const secret = Array.isArray(venue.venue_secrets) ? venue.venue_secrets[0] : venue.venue_secrets;
  if (!secret?.scan_token) {
    console.warn(`⚠ ${venue.slug} : pas de scan_token (migration secure_scan_and_rls.sql exécutée ?), ignoré`);
    continue;
  }
  const qrUrl = `${BASE_URL}/l/${venue.slug}?t=${secret.scan_token}`;
  // Correction d'erreur H : le QR reste lisible avec le logo par-dessus.
  const qrSvg = await QRCode.toString(qrUrl, { type: 'svg', errorCorrectionLevel: 'H', margin: 0 });
  const files = {};
  for (const fmt of FORMATS) {
    const file = `${fmt.prefix}-${venue.slug.replaceAll('/', '_')}.html`;
    writeFileSync(resolve(outDir, file), fmt.render(venue, qrSvg));
    files[fmt.key] = file;
  }
  index.push({ name: venue.name, slug: venue.slug, files, qr_url: qrUrl });
  console.log(`✓ ${venue.slug} → ${FORMATS.map(f => f.prefix).join(' / ')} (qr-output/)`);
}

writeFileSync(
  resolve(outDir, 'index.html'),
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Affichettes QR ATOUTE</title>
<style>body{font-family:sans-serif;padding:2rem;max-width:640px;margin:auto}h1{font-size:1.4rem}li{margin:.75rem 0}small{color:#888}a{margin-right:.6rem}</style></head>
<body><h1>Affichettes QR : ouvrir un format puis Ctrl+P (taille réelle, marges à 0)</h1><ul>
${index.map(v => `<li><strong>${esc(v.name)}</strong> <small>(${esc(v.slug)})</small><br>${FORMATS.map(f => `<a href="${v.files[f.key]}">${f.label}</a>`).join(' ')}</li>`).join('\n')}
</ul></body></html>`
);
writeFileSync(resolve(outDir, 'qr-codes.json'), JSON.stringify({ base_url: BASE_URL, venues: index }, null, 2));

console.log(`\n${index.length} lieu(x) × ${FORMATS.length} formats générés dans qr-output/. Ouvre qr-output/index.html pour imprimer.`);
