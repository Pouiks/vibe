import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/core/supabase/server';

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// RGPD - droit à l'effacement : supprime le compte auth ; toutes les données
// applicatives suivent par cascade (profiles → messages, adhésions, events,
// participations, réactions, abonnements push).
export async function POST() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getAdminSupabase();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      console.error('[account/delete]', error);
      return NextResponse.json({ error: 'Erreur lors de la suppression du compte.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[account/delete]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
