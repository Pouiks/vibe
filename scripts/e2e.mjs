// ── E2E backend : cycle de vie complet d'un spot contre la VRAIE base ─────
// Simule : création du lieu (+ QR token), scan bon/mauvais token, RLS
// (non-membre, anonyme), chat, réactions, non-lus, event + participation +
// chat d'event, quitter le spot (purge trigger), suppression du compte
// propriétaire, suppression du lieu (cascades). Valide donc aussi que les
// migrations supabase/ (README #1-16) sont réellement passées.
//
// Usage :  npm run e2e
// Requiert .env : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
//                 SUPABASE_SERVICE_ROLE_KEY
// Données de test identifiables (slug e2e-*), nettoyées en fin de run même
// en cas d'échec. Le lieu de test apparaît ~quelques secondes dans l'app.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
try {
  for (const line of readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=["']?(.*?)["']?\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch { /* env externe */ }

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  console.error('Variables manquantes (URL / clé publishable / service role).');
  process.exit(1);
}

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false } });
const newAnonClient = () => createClient(URL_, ANON, { auth: { persistSession: false } });

const RUN = Date.now().toString(36);
const SLUG = `e2e-ville/e2e-quartier/e2e-spot-${RUN}`;
const PASSWORD = `E2e!${RUN}aA1`;

// ── harnais ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0, warned = 0;
async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n      → ${err.message}`);
  }
}
function warn(name, msg) {
  warned++;
  console.warn(`  ⚠ ${name} — ${msg}`);
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function assertErr(error, msg) { assert(error, `${msg} (aucune erreur alors qu'un refus était attendu)`); }

// ── état partagé ──────────────────────────────────────────────────────────
const ctx = { venueId: null, token: null, users: {}, eventId: null, msgId: null };

async function createUser(label) {
  const email = `e2e-${label}-${RUN}@e2e.atoute.app`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`createUser ${label}: ${error.message}`);
  const client = newAnonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInError) throw new Error(`signIn ${label}: ${signInError.message} (provider email/password activé ?)`);
  ctx.users[label] = { id: data.user.id, client };
  return ctx.users[label];
}

async function teardown() {
  console.log('\nNettoyage…');
  try { if (ctx.venueId) await admin.from('venues').delete().eq('id', ctx.venueId); } catch { /* déjà supprimé */ }
  for (const label of Object.keys(ctx.users)) {
    try { await admin.auth.admin.deleteUser(ctx.users[label].id); } catch { /* déjà supprimé */ }
  }
  // filet : purge tout résidu e2e de runs précédents
  try {
    const { data } = await admin.from('venues').select('id, slug').like('slug', 'e2e-ville/%');
    for (const v of data ?? []) await admin.from('venues').delete().eq('id', v.id);
  } catch { /* best effort */ }
}

// ── scénario ──────────────────────────────────────────────────────────────
async function run() {
  console.log(`E2E ATOUTE — run ${RUN} sur ${URL_}\n`);

  console.log('1. Lieu & QR');
  await step('création du lieu (comme /api/admin/venues)', async () => {
    const a = await createUser('owner');
    const { data, error } = await admin.from('venues').insert({
      slug: SLUG, name: `E2E Spot ${RUN}`, category: 'sport',
      city_slug: 'e2e-ville', neighborhood: 'e2e-quartier',
      location: 'SRID=4326;POINT(2.3522 48.8566)',
      owner_id: a.id, tagline: 'Accroche de test E2E',
    }).select('id').single();
    assert(!error && data, `insert venue: ${error?.message}`);
    ctx.venueId = data.id;
  });

  await step('token de scan généré par trigger (secure_scan_and_rls)', async () => {
    const { data } = await admin.from('venue_secrets').select('scan_token').eq('venue_id', ctx.venueId).single();
    assert(data?.scan_token && data.scan_token.length >= 16, 'pas de scan_token');
    ctx.token = data.scan_token;
  });

  await step('la vue venues_with_coords expose tagline + coordonnées (migrations 12+16)', async () => {
    const { data, error } = await admin.from('venues_with_coords')
      .select('tagline, lat, lng, photo_url').eq('id', ctx.venueId).single();
    assert(!error, `vue: ${error?.message}`);
    assert(data.tagline === 'Accroche de test E2E', 'tagline absente de la vue');
    assert(Math.abs(data.lat - 48.8566) < 1e-4, 'lat incohérente');
  });

  console.log('\n2. Scan & accès');
  const userA = () => ctx.users.owner.client;
  await step('join_spot refuse un mauvais token', async () => {
    const { error } = await userA().rpc('join_spot', { p_slug: SLUG, p_token: 'mauvais-token' });
    assertErr(error, 'join_spot aurait dû refuser');
  });

  await step('join_spot accepte le bon token (= scan du QR)', async () => {
    const { error } = await userA().rpc('join_spot', { p_slug: SLUG, p_token: ctx.token });
    assert(!error, `join_spot: ${error?.message}`);
  });

  await step('scans_count = 1 membre (triggers map_truth)', async () => {
    const { data } = await admin.from('venues').select('scans_count').eq('id', ctx.venueId).single();
    assert(data.scans_count === 1, `scans_count=${data.scans_count}, attendu 1`);
  });

  await step('un anonyme ne peut pas écrire dans le chat (RLS)', async () => {
    const anon = newAnonClient();
    const { error } = await anon.from('messages').insert({
      venue_id: ctx.venueId, user_id: ctx.users.owner.id, content: 'intrusion anonyme',
    });
    assertErr(error, 'insert anonyme accepté');
  });

  await step('un non-membre ne lit pas les messages (RLS)', async () => {
    const c = await createUser('curieux');
    await admin.from('messages').insert({ venue_id: ctx.venueId, user_id: ctx.users.owner.id, content: 'coucou du spot' });
    const { data } = await c.client.from('messages').select('id').eq('venue_id', ctx.venueId);
    assert((data ?? []).length === 0, `non-membre lit ${data?.length} message(s)`);
  });

  console.log('\n3. Chat, réactions, non-lus');
  await step('un membre envoie et lit un message', async () => {
    const { data, error } = await userA().from('messages')
      .insert({ venue_id: ctx.venueId, user_id: ctx.users.owner.id, content: 'premier message E2E', is_on_site: true })
      .select('id').single();
    assert(!error && data, `insert message: ${error?.message}`);
    ctx.msgId = data.id;
    const { data: read } = await userA().from('messages').select('id').eq('venue_id', ctx.venueId);
    assert((read ?? []).some(m => m.id === ctx.msgId), 'message non relu par son auteur');
  });

  await step('un 2e membre rejoint, lit, et réagit', async () => {
    const b = await createUser('membre-b');
    const { error: joinError } = await b.client.rpc('join_spot', { p_slug: SLUG, p_token: ctx.token });
    assert(!joinError, `join B: ${joinError?.message}`);
    const { data: read } = await b.client.from('messages').select('id').eq('venue_id', ctx.venueId);
    assert((read ?? []).some(m => m.id === ctx.msgId), 'B ne lit pas le message');
    const { error: reactError } = await b.client.from('message_reactions')
      .insert({ message_id: ctx.msgId, user_id: b.id, reaction_type: '🔥' });
    assert(!reactError, `réaction: ${reactError?.message}`);
  });

  await step('last_read_at modifiable par son propriétaire (GRANT add_unread_tracking)', async () => {
    const b = ctx.users['membre-b'];
    const stamp = new Date().toISOString();
    const { error } = await b.client.from('channel_subscriptions')
      .update({ last_read_at: stamp })
      .eq('user_id', b.id).eq('venue_id', ctx.venueId);
    assert(!error, `update last_read_at: ${error?.message}`);
    const { data } = await b.client.from('channel_subscriptions')
      .select('last_read_at').eq('user_id', b.id).eq('venue_id', ctx.venueId).single();
    assert(new Date(data.last_read_at).getTime() === new Date(stamp).getTime(), 'last_read_at non persisté (GRANT manquant ?)');
  });

  console.log('\n4. Events');
  await step('création d\'un event + créateur participant (compteur = 1)', async () => {
    const { data, error } = await userA().from('events').insert({
      venue_id: ctx.venueId, creator_id: ctx.users.owner.id,
      title: 'Match E2E', description: 'test', start_time: new Date(Date.now() + 3600_000).toISOString(),
      duration_minutes: 60, max_participants: 2, current_participants: 0,
    }).select('id').single();
    assert(!error && data, `insert event: ${error?.message}`);
    ctx.eventId = data.id;
    const { error: joinError } = await userA().from('event_participants')
      .insert({ event_id: ctx.eventId, user_id: ctx.users.owner.id });
    assert(!joinError, `créateur participant: ${joinError?.message}`);
    const { data: ev } = await admin.from('events').select('current_participants').eq('id', ctx.eventId).single();
    assert(ev.current_participants === 1, `compteur=${ev.current_participants}, attendu 1 (trigger)`);
  });

  await step('un membre rejoint l\'event (compteur = 2) et écrit dans son chat', async () => {
    const b = ctx.users['membre-b'];
    const { error } = await b.client.from('event_participants').insert({ event_id: ctx.eventId, user_id: b.id });
    assert(!error, `join event: ${error?.message}`);
    const { data: ev } = await admin.from('events').select('current_participants').eq('id', ctx.eventId).single();
    assert(ev.current_participants === 2, `compteur=${ev.current_participants}, attendu 2`);
    const { error: msgError } = await b.client.from('messages')
      .insert({ venue_id: ctx.venueId, event_id: ctx.eventId, user_id: b.id, content: 'message chat event' });
    assert(!msgError, `message event: ${msgError?.message}`);
  });

  // Limite connue (AUDIT 🔶3) : pas de contrôle max_participants en base
  {
    const c = ctx.users['curieux'];
    const { error: joinSpotErr } = await c.client.rpc('join_spot', { p_slug: SLUG, p_token: ctx.token });
    if (!joinSpotErr) {
      const { error } = await c.client.from('event_participants').insert({ event_id: ctx.eventId, user_id: c.id });
      if (!error) warn('sur-remplissage event', '3e participant accepté sur un event 2 places (AUDIT 🔶3, non corrigé)');
      await admin.from('event_participants').delete().eq('event_id', ctx.eventId).eq('user_id', c.id);
    }
  }

  console.log('\n5. Quitter le spot');
  await step('quitter purge les participations aux events (trigger coherence_fixes)', async () => {
    const b = ctx.users['membre-b'];
    const { error } = await b.client.from('channel_subscriptions')
      .delete().eq('user_id', b.id).eq('venue_id', ctx.venueId);
    assert(!error, `leave: ${error?.message}`);
    const { data: parts } = await admin.from('event_participants')
      .select('user_id').eq('event_id', ctx.eventId).eq('user_id', b.id);
    assert((parts ?? []).length === 0, 'participation survivante après départ (trigger manquant ?)');
    const { data: ev } = await admin.from('events').select('current_participants').eq('id', ctx.eventId).single();
    assert(ev.current_participants === 1, `compteur=${ev.current_participants}, attendu 1 après départ`);
  });

  await step('après départ, plus aucune lecture du chat (RLS)', async () => {
    const b = ctx.users['membre-b'];
    const { data } = await b.client.from('messages').select('id').eq('venue_id', ctx.venueId);
    assert((data ?? []).length === 0, `ex-membre lit encore ${data?.length} message(s)`);
  });

  await step('scans_count décrémenté après départ (map_truth)', async () => {
    const { data } = await admin.from('venues').select('scans_count').eq('id', ctx.venueId).single();
    assert(data.scans_count === 2, `scans_count=${data.scans_count}, attendu 2 (owner + curieux)`);
  });

  console.log('\n6. Suppressions');
  await step('suppression du compte propriétaire (FK owner_id SET NULL, coherence_fixes)', async () => {
    const { error } = await admin.auth.admin.deleteUser(ctx.users.owner.id);
    assert(!error, `deleteUser owner: ${error?.message}`);
    delete ctx.users.owner;
    const { data } = await admin.from('venues').select('owner_id').eq('id', ctx.venueId).single();
    assert(data.owner_id === null, 'owner_id non remis à NULL');
  });

  await step('suppression du lieu : cascades complètes', async () => {
    const { error } = await admin.from('venues').delete().eq('id', ctx.venueId);
    assert(!error, `delete venue: ${error?.message}`);
    const checks = await Promise.all([
      admin.from('messages').select('id').eq('venue_id', ctx.venueId),
      admin.from('events').select('id').eq('venue_id', ctx.venueId),
      admin.from('channel_subscriptions').select('venue_id').eq('venue_id', ctx.venueId),
      admin.from('venue_secrets').select('venue_id').eq('venue_id', ctx.venueId),
    ]);
    for (const { data } of checks) assert((data ?? []).length === 0, 'résidu après cascade');
    ctx.venueId = null;
  });
}

// ── exécution ─────────────────────────────────────────────────────────────
try {
  await run();
} catch (err) {
  failed++;
  console.error(`\nErreur fatale : ${err.message}`);
} finally {
  await teardown();
}

console.log(`\n${'─'.repeat(50)}`);
console.log(`E2E terminé : ${passed} ✓ · ${failed} ✗ · ${warned} ⚠`);
if (failed > 0) process.exit(1);
