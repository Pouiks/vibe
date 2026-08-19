"use client";
import { useRef, useEffect, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNearbyVenues } from './useNearbyVenues';
import maplibregl from 'maplibre-gl';
import { X } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [
    {
      id: 'osm-tiles',
      type: 'raster',
      source: 'osm',
      paint: {
        'raster-saturation': 0,
        'raster-brightness-min': 0.2,
        'raster-brightness-max': 1.0,
        'raster-contrast': 0.05,
      },
    },
  ],
};

const CATEGORY_COLORS: Record<string, string> = {
  sport: '#34d399',
  cafe: '#fbbf24',
  bar: '#f87171',
  other: '#818cf8',
};

const CATEGORY_ICONS: Record<string, string> = {
  sport: '🏀',
  cafe: '☕',
  bar: '🍻',
  other: '📍',
};

interface SelectedVenue {
  id: string;
  slug: string;
  name: string;
  category: string;
  neighborhood?: string | null;
  scans_count?: number;
  is_unlocked?: boolean;
}

interface MapViewProps {
  unlockedVenueIds?: Set<string>;
  initialCenter?: [number, number]; // [lng, lat]
  initialZoom?: number;
  className?: string;
}

export default function MapView({
  unlockedVenueIds = new Set(),
  initialCenter,
  initialZoom = 13,
  className = '',
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const router = useRouter();
  const { geojson, loading, fetchByBounds } = useNearbyVenues();
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [selected, setSelected] = useState<SelectedVenue | null>(null);

  const center = initialCenter || userLocation || [2.3522, 48.8566]; // Default: Paris

  useEffect(() => {
    if (initialCenter || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation([pos.coords.longitude, pos.coords.latitude]),
      () => {},
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, [initialCenter]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: center as [number, number],
      zoom: initialZoom,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    }), 'bottom-right');

    map.on('load', () => {
      // Venue points source
      map.addSource('venues', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Heatmap layer (based on scans_count)
      map.addLayer({
        id: 'venues-heat',
        type: 'heatmap',
        source: 'venues',
        maxzoom: 16,
        paint: {
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'scans_count'], 0, 0.3, 50, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1.8],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 20, 15, 40],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(129,140,248,0)',
            0.15, 'rgba(129,140,248,0.25)',
            0.3, 'rgba(167,139,250,0.45)',
            0.5, 'rgba(251,191,36,0.55)',
            0.7, 'rgba(248,113,113,0.65)',
            1, 'rgba(244,63,94,0.8)',
          ],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 16, 0],
        },
      });

      // Glow ring behind active spots
      map.addLayer({
        id: 'venues-glow',
        type: 'circle',
        source: 'venues',
        minzoom: 10,
        filter: ['==', ['get', 'is_unlocked'], true],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 16, 16, 28],
          'circle-color': [
            'match', ['get', 'category'],
            'sport', CATEGORY_COLORS.sport,
            'cafe', CATEGORY_COLORS.cafe,
            'bar', CATEGORY_COLORS.bar,
            CATEGORY_COLORS.other,
          ],
          'circle-opacity': 0.25,
          'circle-blur': 1,
        },
      });

      // Circle markers - unlocked spots (vivid, prominent)
      map.addLayer({
        id: 'venues-circles-active',
        type: 'circle',
        source: 'venues',
        minzoom: 10,
        filter: ['==', ['get', 'is_unlocked'], true],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 9, 16, 16],
          'circle-color': [
            'match', ['get', 'category'],
            'sport', CATEGORY_COLORS.sport,
            'cafe', CATEGORY_COLORS.cafe,
            'bar', CATEGORY_COLORS.bar,
            CATEGORY_COLORS.other,
          ],
          'circle-opacity': 1,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#ffffff',
          'circle-blur': 0,
        },
      });

      // Circle markers - locked spots (still visible, but muted)
      map.addLayer({
        id: 'venues-circles-preview',
        type: 'circle',
        source: 'venues',
        minzoom: 10,
        filter: ['!=', ['get', 'is_unlocked'], true],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 7, 16, 13],
          'circle-color': [
            'match', ['get', 'category'],
            'sport', CATEGORY_COLORS.sport,
            'cafe', CATEGORY_COLORS.cafe,
            'bar', CATEGORY_COLORS.bar,
            CATEGORY_COLORS.other,
          ],
          'circle-opacity': 0.6,
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.4)',
          'circle-blur': 0,
        },
      });

      // Labels layer
      map.addLayer({
        id: 'venues-labels',
        type: 'symbol',
        source: 'venues',
        minzoom: 13,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 12,
          'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          'text-offset': [0, 2],
          'text-anchor': 'top',
          'text-max-width': 10,
        },
        paint: {
          'text-color': '#1e293b',
          'text-halo-color': 'rgba(255,255,255,0.9)',
          'text-halo-width': 2,
        },
      });

      loadBoundsData(map);
    });

    map.on('moveend', () => loadBoundsData(map));

    const venueLayerIds = ['venues-circles-active', 'venues-circles-preview'];
    for (const layerId of venueLayerIds) {
      // Info-bulle teaser plutôt que navigation directe : donner envie d'ouvrir.
      map.on('click', layerId, (e) => {
        const feature = e.features?.[0];
        if (!feature || !feature.properties) return;
        setSelected(feature.properties as unknown as SelectedVenue);
      });
      map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
      });
    }

    // Clic sur la carte hors marqueur : ferme l'info-bulle.
    map.on('click', (e) => {
      const feats = map.queryRenderedFeatures(e.point, { layers: venueLayerIds });
      if (feats.length === 0) setSelected(null);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [center[0], center[1]]);

  const loadBoundsData = useCallback((map: maplibregl.Map) => {
    const bounds = map.getBounds();
    fetchByBounds({
      sw_lng: bounds.getSouthWest().lng,
      sw_lat: bounds.getSouthWest().lat,
      ne_lng: bounds.getNorthEast().lng,
      ne_lat: bounds.getNorthEast().lat,
    });
  }, [fetchByBounds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojson) return;
    const source = map.getSource('venues') as maplibregl.GeoJSONSource | undefined;
    if (source) {
      const enriched = {
        ...geojson,
        features: geojson.features.map((f) => ({
          ...f,
          properties: {
            ...f.properties,
            is_unlocked: unlockedVenueIds.has(f.properties.id),
          },
        })),
      };
      source.setData(enriched as unknown as GeoJSON.FeatureCollection);
    }
  }, [geojson, unlockedVenueIds]);

  return (
    <div className={`relative ${className}`}>
      <div ref={mapContainer} className="w-full h-full rounded-2xl overflow-hidden" />
      {loading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-card/90 backdrop-blur-sm text-blue-600 text-xs font-medium px-3 py-1.5 rounded-full border border-blue-200">
          Chargement des spots...
        </div>
      )}
      {selected && (
        <div className="absolute bottom-3 left-3 right-3 bg-card rounded-2xl border border-slate-200 shadow-lg p-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-xl shrink-0">{CATEGORY_ICONS[selected.category] || '📍'}</span>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-900 truncate">{selected.name}</h3>
              <p className="text-[11px] text-slate-500 truncate">
                {selected.neighborhood ? `${selected.neighborhood} · ` : ''}
                {selected.scans_count ?? 0} scan{(selected.scans_count ?? 0) > 1 ? 's' : ''}
                {selected.is_unlocked ? ' · ✓ membre' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => router.push(`/l/${selected.slug}`)}
              className="bg-blue-600 text-white text-xs font-semibold py-2 px-3.5 rounded-xl active:scale-95">
              Découvrir
            </button>
            <button onClick={() => setSelected(null)} className="p-1.5 text-slate-400 active:text-slate-600" aria-label="Fermer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
