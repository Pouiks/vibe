import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/core/supabase/server';
import { toGeoJSON, type MapVenue } from '@/modules/map/types';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { searchParams } = new URL(request.url);

  const lng = searchParams.get('lng');
  const lat = searchParams.get('lat');
  const radius = searchParams.get('radius');

  if (lng && lat) {
    const { data, error } = await supabase.rpc('get_venues_nearby', {
      user_lng: parseFloat(lng),
      user_lat: parseFloat(lat),
      radius_meters: radius ? parseInt(radius, 10) : 5000,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(toGeoJSON((data || []) as MapVenue[]));
  }

  const sw_lng = searchParams.get('sw_lng');
  const sw_lat = searchParams.get('sw_lat');
  const ne_lng = searchParams.get('ne_lng');
  const ne_lat = searchParams.get('ne_lat');

  if (sw_lng && sw_lat && ne_lng && ne_lat) {
    const { data, error } = await supabase.rpc('get_venues_in_bbox', {
      sw_lng: parseFloat(sw_lng),
      sw_lat: parseFloat(sw_lat),
      ne_lng: parseFloat(ne_lng),
      ne_lat: parseFloat(ne_lat),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(toGeoJSON((data || []) as MapVenue[]));
  }

  return NextResponse.json(
    { error: 'Provide either (lng, lat) or (sw_lng, sw_lat, ne_lng, ne_lat)' },
    { status: 400 }
  );
}
