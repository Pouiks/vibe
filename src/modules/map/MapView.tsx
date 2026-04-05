"use client";
import { useRef, useEffect, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useNearbyVenues } from './useNearbyVenues';
import type { VenueGeoJSON } from './types';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const DARK_STYLE: maplibregl.StyleSpecification = {
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
        'raster-saturation': -0.8,
        'raster-brightness-max': 0.4,
        'raster-contrast': 0.2,
      },
    },
  ],
};

const CATEGORY_COLORS: Record<string, string> = {
  sport: '#10b981',
  cafe: '#f59e0b',
  bar: '#ef4444',
  other: '#6366f1',
};

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
      style: DARK_STYLE,
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
          'heatmap-weight': ['interpolate', ['linear'], ['get', 'scans_count'], 0, 0.1, 50, 1],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 15, 1.5],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 15, 15, 30],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(99,102,241,0)',
            0.2, 'rgba(99,102,241,0.3)',
            0.4, 'rgba(129,140,248,0.5)',
            0.6, 'rgba(167,139,250,0.6)',
            0.8, 'rgba(245,158,11,0.7)',
            1, 'rgba(239,68,68,0.8)',
          ],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.8, 16, 0],
        },
      });

      // Circle markers — unlocked spots (bright, with glow)
      map.addLayer({
        id: 'venues-circles-active',
        type: 'circle',
        source: 'venues',
        minzoom: 12,
        filter: ['==', ['get', 'is_unlocked'], true],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 8, 16, 14],
          'circle-color': [
            'match', ['get', 'category'],
            'sport', CATEGORY_COLORS.sport,
            'cafe', CATEGORY_COLORS.cafe,
            'bar', CATEGORY_COLORS.bar,
            CATEGORY_COLORS.other,
          ],
          'circle-opacity': 1,
          'circle-stroke-width': 3,
          'circle-stroke-color': 'rgba(255,255,255,0.3)',
          'circle-blur': 0,
        },
      });

      // Circle markers — locked spots (dimmed, fog of war)
      map.addLayer({
        id: 'venues-circles-preview',
        type: 'circle',
        source: 'venues',
        minzoom: 12,
        filter: ['!=', ['get', 'is_unlocked'], true],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 5, 16, 10],
          'circle-color': '#475569',
          'circle-opacity': 0.5,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#1e293b',
          'circle-blur': 0.4,
        },
      });

      // Labels layer
      map.addLayer({
        id: 'venues-labels',
        type: 'symbol',
        source: 'venues',
        minzoom: 14,
        layout: {
          'text-field': ['get', 'name'],
          'text-size': 11,
          'text-offset': [0, 1.8],
          'text-anchor': 'top',
          'text-max-width': 10,
        },
        paint: {
          'text-color': '#e2e8f0',
          'text-halo-color': '#0f111a',
          'text-halo-width': 1.5,
        },
      });

      loadBoundsData(map);
    });

    map.on('moveend', () => loadBoundsData(map));

    const venueLayerIds = ['venues-circles-active', 'venues-circles-preview'];
    for (const layerId of venueLayerIds) {
      map.on('click', layerId, (e) => {
        const feature = e.features?.[0];
        if (!feature || !feature.properties) return;
        const slug = feature.properties.slug;
        if (slug) router.push(`/l/${slug}`);
      });
      map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
      });
    }

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
      source.setData(enriched as any);
    }
  }, [geojson, unlockedVenueIds]);

  return (
    <div className={`relative ${className}`}>
      <div ref={mapContainer} className="w-full h-full rounded-2xl overflow-hidden" />
      {loading && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-vibe-dark/80 backdrop-blur-sm text-brand-400 text-xs font-medium px-3 py-1.5 rounded-full border border-brand-500/20">
          Chargement des spots...
        </div>
      )}
    </div>
  );
}
