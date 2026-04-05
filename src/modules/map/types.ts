export interface MapVenue {
  id: string;
  slug: string;
  name: string;
  category: string;
  city_slug: string;
  neighborhood: string | null;
  scans_count: number;
  lng: number;
  lat: number;
}

export interface VenueGeoJSON {
  type: 'FeatureCollection';
  features: VenueFeature[];
}

export interface VenueFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
  };
  properties: Omit<MapVenue, 'lng' | 'lat'>;
}

export function toGeoJSON(venues: MapVenue[]): VenueGeoJSON {
  return {
    type: 'FeatureCollection',
    features: venues.map((v) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [v.lng, v.lat],
      },
      properties: {
        id: v.id,
        slug: v.slug,
        name: v.name,
        category: v.category,
        city_slug: v.city_slug,
        neighborhood: v.neighborhood,
        scans_count: v.scans_count,
      },
    })),
  };
}
