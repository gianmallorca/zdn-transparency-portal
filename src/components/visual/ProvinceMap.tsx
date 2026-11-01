import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  NavigationControl,
  type GeoJSONSource,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { php } from '../../lib/format';
import type { ScopedProject } from '../../lib/scope';
import { GEO_NAME_TO_TOWN, TOWN_LABEL, type TownId, townTotals } from '../../lib/towns';
import 'maplibre-gl/dist/maplibre-gl.css';

const SOURCE = 'zdn-munis';
const FILL = 'zdn-fill';
const LINE = 'zdn-line';

function shade(value: number, max: number): string {
  if (max <= 0 || value <= 0) return '#e8eef8';
  const t = Math.min(1, Math.sqrt(value / max));
  const light = { r: 232, g: 238, b: 248 };
  const deep = { r: 11, g: 79, b: 217 };
  const r = Math.round(light.r + (deep.r - light.r) * t);
  const g = Math.round(light.g + (deep.g - light.g) * t);
  const b = Math.round(light.b + (deep.b - light.b) * t);
  return `rgb(${r},${g},${b})`;
}

function enrich(
  geo: FeatureCollection,
  totals: Map<TownId, number>,
  max: number,
  selectedTownId: TownId | null,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: geo.features.map((f) => {
      const geoName = String((f.properties as { adm3_en?: string } | null)?.adm3_en ?? '');
      const townId = GEO_NAME_TO_TOWN[geoName] ?? null;
      const value = townId ? (totals.get(townId) ?? 0) : 0;
      const label = townId ? (TOWN_LABEL[townId] ?? townId) : geoName;
      return {
        ...f,
        properties: {
          ...f.properties,
          townId,
          label,
          value,
          fill: shade(value, max),
          selected: townId != null && townId === selectedTownId ? 1 : 0,
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
      const lng = coords[0] as number;
      const lat = coords[1] as number;
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
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
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelectTown);

  const [geo, setGeo] = useState<FeatureCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ label: string; value: number; x: number; y: number } | null>(null);

  const totals = useMemo(() => townTotals(projects), [projects]);
  const max = useMemo(() => Math.max(0, ...totals.values()), [totals]);
  const data = useMemo(
    () => (geo ? enrich(geo, totals, max, selectedTownId) : null),
    [geo, totals, max, selectedTownId],
  );

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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: [122.9, 8.1],
      zoom: 8,
      attributionControl: { compact: true },
      scrollZoom: false,
    });
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    const onLoad = () => {
      map.addSource(SOURCE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: FILL,
        type: 'fill',
        source: SOURCE,
        paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': 0.92 },
      });
      map.addLayer({
        id: LINE,
        type: 'line',
        source: SOURCE,
        paint: {
          'line-color': ['case', ['==', ['get', 'selected'], 1], '#0a44bd', '#ffffff'],
          'line-width': ['case', ['==', ['get', 'selected'], 1], 2.5, 1],
        },
      });
    };
    map.on('load', onLoad);

    const pickTown = (feature: MapGeoJSONFeature | undefined) => {
      const townId = feature?.properties?.townId as string | null | undefined;
      if (townId) onSelectRef.current(townId);
    };

    map.on('click', FILL, (e: MapLayerMouseEvent) => pickTown(e.features?.[0]));
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

    return () => {
      map.remove();
      mapRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;

    const apply = () => {
      const src = map.getSource(SOURCE) as GeoJSONSource | undefined;
      if (!src) return;
      src.setData(data);
      const b = boundsOf(data);
      if (b && !fittedRef.current) {
        map.fitBounds(b, { padding: 24, maxZoom: 10, duration: 0 });
        fittedRef.current = true;
      }
    };

    if (map.getSource(SOURCE)) apply();
    else map.once('load', apply);
  }, [data]);

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
