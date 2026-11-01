import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import type { Feature, FeatureCollection, Position } from 'geojson';
import { php } from '../../lib/format';
import type { ScopedProject } from '../../lib/scope';
import { GEO_NAME_TO_TOWN, TOWN_LABEL, type TownId, townTotals } from '../../lib/towns';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre v6 + Vite: worker must be wired explicitly or GeoJSON sources never load.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(maplibreWorkerUrl);

const SOURCE = 'zdn-munis';
const LABEL_SOURCE = 'zdn-label-pts';
const FILL = 'zdn-fill';
const LINE = 'zdn-line';
const LABELS = 'zdn-labels';
/** Free vector basemap — no API key. We hide its place labels and draw our own. */
const BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';

type LngLatBoundsTuple = [[number, number], [number, number]];

/**
 * Zamboanga peninsula (del Norte, del Sur, Sibugay, Zamboanga City).
 * Unioned with ZDN municipality bounds plus {@link ZDN_COMFORT_DEG}.
 */
const PENINSULA_WINDOW: LngLatBoundsTuple = [[121.8, 6.8], [123.9, 8.9]];
/** Degrees of margin so ZDN never sits on the maxBounds edge. */
const ZDN_COMFORT_DEG = 0.15;
const ZDN_FIT = { padding: 28, maxZoom: 10, duration: 0 } as const;

function roundOut(value: number, direction: -1 | 1): number {
  const scaled = value * 100;
  const snapped = direction < 0 ? Math.floor(scaled + 1e-6) : Math.ceil(scaled - 1e-6);
  return snapped / 100;
}

/** Peninsula window, expanded if the ZDN GeoJSON (plus comfort margin) sticks out. */
function peninsulaMaxBounds(zdn: LngLatBoundsTuple | null): LngLatBoundsTuple {
  if (!zdn) return PENINSULA_WINDOW;
  const [[w, s], [e, n]] = zdn;
  return [
    [
      roundOut(Math.min(PENINSULA_WINDOW[0][0], w - ZDN_COMFORT_DEG), -1),
      roundOut(Math.min(PENINSULA_WINDOW[0][1], s - ZDN_COMFORT_DEG), -1),
    ],
    [
      roundOut(Math.max(PENINSULA_WINDOW[1][0], e + ZDN_COMFORT_DEG), 1),
      roundOut(Math.max(PENINSULA_WINDOW[1][1], n + ZDN_COMFORT_DEG), 1),
    ],
  ];
}

function mercY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(Math.PI / 4 + rad / 2)) / Math.PI) / 2;
}

function latAtMercY(y: number): number {
  return (Math.atan(Math.exp((1 - 2 * y) * Math.PI)) * 2 - Math.PI / 2) * (180 / Math.PI);
}

/**
 * Peninsula lock, widened only when this frame is too short or wide for
 * fitBounds(ZDN) to stay inside it (the mobile map is about half height).
 */
function boundsForViewport(map: MapLibreMap, zdn: LngLatBoundsTuple | null): LngLatBoundsTuple {
  const base = peninsulaMaxBounds(zdn);
  if (!zdn) return base;
  const { clientWidth: vw, clientHeight: vh } = map.getContainer();
  const pad = ZDN_FIT.padding;
  const innerW = vw - pad * 2;
  const innerH = vh - pad * 2;
  if (innerW < 48 || innerH < 48) return base;
  const [[w0, s0], [e0, n0]] = zdn;
  const zw = (e0 - w0) / 360;
  const zh = mercY(s0) - mercY(n0);
  if (zw <= 0 || zh <= 0) return base;
  const world = Math.min(innerW / zw, innerH / zh);
  const needX = (vw / world) * 1.03;
  const needY = (vh / world) * 1.03;
  let west = base[0][0];
  let south = base[0][1];
  let east = base[1][0];
  let north = base[1][1];
  const haveX = (east - west) / 360;
  if (needX > haveX) {
    const grow = ((needX - haveX) * 360) / 2;
    west -= grow;
    east += grow;
  }
  const ySouth = mercY(south);
  const yNorth = mercY(north);
  if (needY > ySouth - yNorth) {
    const mid = (ySouth + yNorth) / 2;
    const half = needY / 2;
    south = latAtMercY(mid + half);
    north = latAtMercY(mid - half);
  }
  return [
    [roundOut(west, -1), roundOut(south, -1)],
    [roundOut(east, 1), roundOut(north, 1)],
  ];
}

function syncPeninsulaLock(map: MapLibreMap, zdn: LngLatBoundsTuple | null): void {
  const maxBounds = boundsForViewport(map, zdn);
  map.setMaxBounds(maxBounds);
  const el = map.getContainer();
  if (el.clientWidth < 32 || el.clientHeight < 32) return;
  // Floor is the zoom at which the lock covers this viewport (lower when the map is shorter).
  map.setMinZoom(0);
  const floor = map.getMinZoom(true);
  if (Number.isFinite(floor)) map.setMinZoom(floor);
}

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

/** Ring average — good enough for municipality label anchors. */
function ringCentroid(ring: Position[]): [number, number] {
  let x = 0;
  let y = 0;
  const n = Math.max(ring.length - 1, 1);
  for (let i = 0; i < n; i++) {
    x += ring[i][0];
    y += ring[i][1];
  }
  return [x / n, y / n];
}

function featureCentroid(f: Feature): [number, number] | null {
  const g = f.geometry;
  if (!g) return null;
  if (g.type === 'Polygon') return ringCentroid(g.coordinates[0]);
  if (g.type === 'MultiPolygon') {
    let best: Position[] = g.coordinates[0][0];
    let bestLen = best.length;
    for (const poly of g.coordinates) {
      if (poly[0].length > bestLen) {
        best = poly[0];
        bestLen = poly[0].length;
      }
    }
    return ringCentroid(best);
  }
  return null;
}

function labelPoints(fc: FeatureCollection): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: fc.features.flatMap((f) => {
      const p = f.properties as { townId?: string; label?: string; value?: number } | null;
      if (!p?.townId) return [];
      const c = featureCentroid(f);
      if (!c) return [];
      return [{
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: c },
        properties: { townId: p.townId, label: p.label ?? p.townId, value: p.value ?? 0 },
      }];
    }),
  };
}

function hideBasemapLabels(map: MapLibreMap): void {
  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type === 'symbol') {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
}

export default function ProvinceMap({
  projects,
  selectedTownId,
  onSelectTown,
  pointsNote,
}: {
  projects: readonly ScopedProject[];
  selectedTownId: TownId | null;
  onSelectTown: (townId: TownId) => void;
  /** Optional API caption about how many projects have coordinates. */
  pointsNote?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const zdnBoundsRef = useRef<LngLatBoundsTuple | null>(null);
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

  useEffect(() => {
    dataRef.current = data;
    maxRef.current = max;
  }, [data, max]);

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
      style: BASEMAP_STYLE,
      center: [122.95, 8.05],
      zoom: 8.2,
      attributionControl: { compact: true },
      scrollZoom: false,
      maxBounds: PENINSULA_WINDOW,
      dragRotate: false,
      touchPitch: false,
    });
    map.dragRotate.disable();
    map.touchPitch.disable();
    map.touchZoomRotate.disableRotation();
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    const lock = () => syncPeninsulaLock(map, zdnBoundsRef.current);

    const ensureLayers = () => {
      hideBasemapLabels(map);
      const fc = dataRef.current ?? { type: 'FeatureCollection', features: [] };
      const pts = labelPoints(fc);
      if (!map.getSource(SOURCE)) {
        map.addSource(SOURCE, { type: 'geojson', data: fc });
      } else {
        (map.getSource(SOURCE) as GeoJSONSource).setData(fc);
      }
      if (!map.getSource(LABEL_SOURCE)) {
        map.addSource(LABEL_SOURCE, { type: 'geojson', data: pts });
      } else {
        (map.getSource(LABEL_SOURCE) as GeoJSONSource).setData(pts);
      }
      if (!map.getLayer(FILL)) {
        map.addLayer({
          id: FILL,
          type: 'fill',
          source: SOURCE,
          paint: {
            'fill-color': fillColorExpr(maxRef.current) as never,
            'fill-opacity': 0.88,
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
      if (!map.getLayer(LABELS)) {
        map.addLayer({
          id: LABELS,
          type: 'symbol',
          source: LABEL_SOURCE,
          layout: {
            'text-field': ['get', 'label'],
            'text-font': ['Noto Sans Bold'],
            'text-size': [
              'interpolate', ['linear'], ['zoom'],
              7, 10,
              9, 12,
              11, 14,
            ],
            'text-max-width': 7,
            'text-padding': 6,
            'text-allow-overlap': false,
            'text-ignore-placement': false,
            'symbol-sort-key': ['-', ['to-number', ['get', 'value']]],
          },
          paint: {
            'text-color': '#0c2340',
            'text-halo-color': 'rgba(255,255,255,0.95)',
            'text-halo-width': 1.75,
          },
        });
      }
      const b = boundsOf(fc);
      if (b && fc.features.length) zdnBoundsRef.current = b;
      lock();
      if (b && fc.features.length) map.fitBounds(b, ZDN_FIT);
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

    map.on('resize', lock);
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
    if (map.getSource(LABEL_SOURCE)) {
      (map.getSource(LABEL_SOURCE) as GeoJSONSource).setData(labelPoints(data));
    }
    if (map.getLayer(FILL)) {
      map.setPaintProperty(FILL, 'fill-color', fillColorExpr(max) as never);
    }
    const b = boundsOf(data);
    if (b) {
      zdnBoundsRef.current = b;
      syncPeninsulaLock(map, b);
      map.fitBounds(b, ZDN_FIT);
    }
  }, [ready, data, max]);

  const resetView = () => {
    const map = mapRef.current;
    const b = zdnBoundsRef.current;
    if (!map || !b) return;
    map.fitBounds(b, ZDN_FIT);
  };

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
      {ready && (
        <button type="button" className="button button-quiet map-reset" onClick={resetView}>
          Reset view
        </button>
      )}
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
        Shade shows proposed project funding. Tap a town for its projects.
        {pointsNote ? <> {pointsNote}</> : null}
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
