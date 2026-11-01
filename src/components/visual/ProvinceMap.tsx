import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { php } from '../../lib/format';
import type { ScopedProject } from '../../lib/scope';
import { GEO_NAME_TO_TOWN, TOWN_LABEL, type TownId, townTotals } from '../../lib/towns';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre v6 + Vite: worker must be wired explicitly or GeoJSON sources never load.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(maplibreWorkerUrl);

const SOURCE = 'zdn-munis';
const FILL = 'zdn-fill';
const LINE = 'zdn-line';

function enrich(
  geo: FeatureCollection,
  totals: Map<TownId, number>,
  selectedTownId: TownId | null,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: geo.features.map((f, i) => {
      const geoName = String((f.properties as { adm3_en?: string } | null)?.adm3_en ?? '');
      const mapped = GEO_NAME_TO_TOWN[geoName];
      const townId = mapped ?? '';
      const value = mapped ? (totals.get(mapped) ?? 0) : 0;
      const label = mapped ? (TOWN_LABEL[mapped] ?? mapped) : geoName;
      return {
        type: 'Feature' as const,
        id: i + 1,
        geometry: f.geometry,
        properties: {
          adm3_en: geoName,
          townId,
          label,
          value,
          selected: mapped && mapped === selectedTownId ? 1 : 0,
        },
      };
    }),
  };
}

function boundsOf(geo: FeatureCollection): [[number, number], [number, number]] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  const visit = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      minLng = Math.min(minLng, coords[0] as number);
      maxLng = Math.max(maxLng, coords[0] as number);
      minLat = Math.min(minLat, coords[1] as number);
      maxLat = Math.max(maxLat, coords[1] as number);
      return;
    }
    for (const c of coords) visit(c);
  };
  for (const f of geo.features) {
    if (f.geometry) visit((f.geometry as { coordinates: unknown }).coordinates);
  }
  if (!Number.isFinite(minLng)) return null;
  return [[minLng, minLat], [maxLng, maxLat]];
}

function fillColorExpr(max: number): unknown[] {
  const top = Math.sqrt(Math.max(max, 1));
  return [
    'interpolate',
    ['linear'],
    ['sqrt', ['max', ['to-number', ['get', 'value']], 0]],
    0, '#c5d4f0',
    top * 0.25, '#8aade8',
    top * 0.5, '#4a7fde',
    top * 0.75, '#1f5ad0',
    top, '#0b4fd9',
  ];
}

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

export default function ProvinceMap({
  projects,
  selectedTownId,
  onSelectTown,
}: {
  projects: readonly ScopedProject[];
  selectedTownId: TownId | null;
  onSelectTown: (townId: TownId) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectRef = useRef(onSelectTown);
  const dataRef = useRef<FeatureCollection | null>(null);
  const maxRef = useRef(0);

  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ label: string; value: number; x: number; y: number } | null>(null);

  const totals = useMemo(() => townTotals(projects), [projects]);
  const max = useMemo(() => {
    const vals = [...totals.values()];
    return vals.length ? Math.max(...vals) : 0;
  }, [totals]);
  const data = useMemo(
    () => (geo ? enrich(geo, totals, selectedTownId) : null),
    [geo, totals, selectedTownId],
  );
  dataRef.current = data;
  maxRef.current = max;

  useEffect(() => {
    onSelectRef.current = onSelectTown;
  }, [onSelectTown]);

  useEffect(() => {
    let cancelled = false;
    fetch('/geo/zdn-municipalities.json')
      .then((r) => {
        if (!r.ok) throw new Error(`Map data ${r.status}`);
        return r.json() as Promise<FeatureCollection>;
      })
      .then((fc) => { if (!cancelled) setGeo(fc); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Map failed to load');
      });
    return () => { cancelled = true; };
  }, []);

  // Mount MapLibre once; add municipality source/layers on style load.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const map = new MapLibreMap({
      container: el,
      style: BASE_STYLE,
      center: [122.95, 8.05],
      zoom: 8.2,
      attributionControl: { compact: true },
      scrollZoom: false,
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    const ensureLayers = () => {
      const fc = dataRef.current ?? { type: 'FeatureCollection', features: [] };
      if (!map.getSource(SOURCE)) {
        map.addSource(SOURCE, { type: 'geojson', data: fc });
      } else {
        (map.getSource(SOURCE) as GeoJSONSource).setData(fc);
      }
      if (!map.getLayer(FILL)) {
        map.addLayer({
          id: FILL,
          type: 'fill',
          source: SOURCE,
          paint: {
            'fill-color': fillColorExpr(maxRef.current) as never,
            'fill-opacity': 0.92,
          },
        });
      }
      if (!map.getLayer(LINE)) {
        map.addLayer({
          id: LINE,
          type: 'line',
          source: SOURCE,
          paint: {
            'line-color': ['case', ['==', ['get', 'selected'], 1], '#0a44bd', '#ffffff'] as never,
            'line-width': ['case', ['==', ['get', 'selected'], 1], 2.5, 1.25] as never,
          },
        });
      }
      const b = boundsOf(fc);
      if (b && fc.features.length) {
        map.fitBounds(b, { padding: 28, maxZoom: 10, duration: 0 });
      }
      map.resize();
      setReady(true);
    };

    if (map.isStyleLoaded()) ensureLayers();
    else map.on('load', ensureLayers);

    map.on('click', FILL, (e: MapLayerMouseEvent) => {
      const townId = e.features?.[0]?.properties?.townId as string | undefined;
      if (townId) onSelectRef.current(townId);
    });
    map.on('mousemove', FILL, (e: MapLayerMouseEvent) => {
      map.getCanvas().style.cursor = 'pointer';
      const f = e.features?.[0];
      if (!f?.properties) {
        setHover(null);
        return;
      }
      setHover({
        label: String(f.properties.label ?? ''),
        value: Number(f.properties.value ?? 0),
        x: e.point.x,
        y: e.point.y,
      });
    });
    map.on('mouseleave', FILL, () => {
      map.getCanvas().style.cursor = '';
      setHover(null);
    });

    const onResize = () => map.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      setReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Keep source + choropleth in sync with live project totals.
  useEffect(() => {
    if (!ready || !data) return;
    const map = mapRef.current;
    if (!map?.getSource(SOURCE)) return;
    (map.getSource(SOURCE) as GeoJSONSource).setData(data);
    if (map.getLayer(FILL)) {
      map.setPaintProperty(FILL, 'fill-color', fillColorExpr(max) as never);
    }
    const b = boundsOf(data);
    if (b) map.fitBounds(b, { padding: 28, maxZoom: 10, duration: 0 });
  }, [ready, data, max]);

  const towns = useMemo(() => {
    if (!data) return [];
    return data.features
      .map((f) => {
        const p = f.properties as { townId?: string; label?: string; value?: number } | null;
        if (!p?.townId) return null;
        return { townId: p.townId, label: p.label ?? p.townId, value: p.value ?? 0 };
      })
      .filter((t): t is { townId: string; label: string; value: number } => t != null)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data]);

  if (error) return <p className="state" role="alert">Map could not load ({error}).</p>;

  return (
    <div
      className="province-map"
      role="region"
      aria-label="Map of Zamboanga del Norte municipalities shaded by proposed project funding"
    >
      {!geo && <div className="map-skeleton" aria-busy="true">Loading map…</div>}
      <div className="province-map-canvas" ref={containerRef} />
      {hover && (
        <div className="map-tooltip" style={{ left: hover.x, top: hover.y }} role="status">
          {hover.label}: {php(hover.value)}
        </div>
      )}
      <div className="map-legend" aria-hidden="true">
        <span>Less</span>
        <span className="map-legend-bar" />
        <span>More</span>
      </div>
      <p className="map-caption muted">
        OpenStreetMap basemap · shade shows proposed project funding. Tap a town for its projects.
      </p>
      <label className="map-town-select">
        <span className="label">Or choose a town</span>
        <select
          value={selectedTownId ?? ''}
          onChange={(e) => { if (e.target.value) onSelectTown(e.target.value); }}
          aria-label="Choose a municipality"
        >
          <option value="">Select municipality…</option>
          {towns.map((t) => (
            <option key={t.townId} value={t.townId}>
              {t.label} ({php(t.value)})
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
