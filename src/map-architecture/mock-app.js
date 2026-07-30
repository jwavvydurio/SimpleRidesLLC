import { LiveLocationController } from './live-location-controller.js';
import { createTerrainController } from './terrain-controller.js';

const mapConfig = window.SimpleRidesMaps || window.SR_MAPS_CONFIG || {};
const center = [-97.7431, 30.2672];
const token = mapConfig.mapboxAccessToken || mapConfig.mapboxToken || '';
const statusEl = document.getElementById('status');
const locationReadout = document.getElementById('locationReadout');
const featureReadout = document.getElementById('featureReadout');
const skinReadout = document.getElementById('skinReadout');
const progressSummary = document.getElementById('progressSummary');
const progressBuilt = document.getElementById('progressBuilt');
const progressProtected = document.getElementById('progressProtected');
const progressActive = document.getElementById('progressActive');
const progressNext = document.getElementById('progressNext');
const progressIntegrity = document.getElementById('progressIntegrity');
const progressProfiles = document.getElementById('progressProfiles');
const progressHealth = document.getElementById('progressHealth');
const progressSource = document.getElementById('progressSource');
const progressFacadeKit = document.getElementById('progressFacadeKit');
const progressCompactSummary = document.getElementById('progressCompactSummary');
const progressCard = document.querySelector('.progress-card');
const toggleProgressBtn = document.getElementById('toggleProgress');
const progressApproval = document.getElementById('progressApproval');
const productionPackage = document.getElementById('productionPackage');
const optimizeStatusLine = document.getElementById('optimizeStatusLine');
const latestBuildZones = document.getElementById('latestBuildZones');
const publishChecklist = document.getElementById('publishChecklist');
const optimizeDirective = document.getElementById('optimizeDirective');
const resetBtn = document.getElementById('resetView');
const optimizeBtn = document.getElementById('optimizeMap');
const controlButtons = {
  zoomIn: document.getElementById('zoomIn'),
  zoomOut: document.getElementById('zoomOut'),
  rotateLeft: document.getElementById('rotateLeft'),
  rotateRight: document.getElementById('rotateRight'),
  tiltUp: document.getElementById('tiltUp'),
  tiltDown: document.getElementById('tiltDown')
};

let map;
let liveLocationController = null;
let terrainController = null;
let lastRealTilesetStatsAt = 0;
let lastIdleMaintenanceAt = 0;
let mapReadyRecorded = false;
let liveCenter = center;
let facadeKitV2Manager = null;
let facadeKitV2RefreshTimers = [];
let facadeKitV2SourceRefreshTimer = 0;
let detailedMapboxProtectionScanTimer = 0;
let detailedMapboxProtectionEmptyRetries = 0;
const detailedMapboxProtectionRegistry = new Map();
let facadeKitV2Enabled = true;
let facadeKitV2Status = { ready: false, loading: true, renderer: 'mapbox-native-model-layer', modelLayers: 0, modelAssets: 0, buildings: 0, instances: 0, homes: 0, roofs: 0, driveways: 0, towers: 0, towerFacades: 0, crowns: 0, midrises: 0, midriseFacades: 0, storefronts: 0, balconies: 0, garages: 0, parkingOpenings: 0, lowriseFaces: 0, windowBays: 0, entries: 0, lobbyFrames: 0, structuralPiers: 0, floorBands: 0, canopies: 0, error: '' };
document.body.classList.remove('render-off');
document.body.dataset.mockVisualParity = 'architecture-skin-locked';
window.__srMockVisualParityMode = 'architecture-skin-locked';
window.__srMockFacadeKitV2Enabled = true;
window.__srMockFacadeKitV2Status = facadeKitV2Status;
window.__srMockSkinMode = 'mapbox-standard-sim-treatment';
const simBasemapConfig = {
  lightPreset: 'dusk',
  theme: 'default',
  show3dObjects: true,
  show3dBuildings: true,
  show3dLandmarks: true,
  show3dFacades: true,
  show3dTrees: true,
  showRoadLabels: true,
  showPointOfInterestLabels: true,
  showPlaceLabels: true,
  showLandmarkIcons: true,
  showLandmarkIconLabels: true
};
const baseBasemapConfig = {
  lightPreset: 'dusk',
  theme: 'default',
  show3dObjects: true,
  show3dBuildings: true,
  show3dLandmarks: true,
  show3dFacades: true,
  show3dTrees: true,
  showRoadLabels: true,
  showPointOfInterestLabels: true,
  showPlaceLabels: true,
  showLandmarkIcons: true,
  showLandmarkIconLabels: true
};

function setStatus(text) {
  statusEl.textContent = text;
  updateProgressReadout();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getMapState() {
  return {
    zoom: map?.getZoom?.() ?? 16.4,
    pitch: map?.getPitch?.() ?? 58,
    bearing: map?.getBearing?.() ?? Number(mapConfig.streetBearing || -18)
  };
}

function updateTerrainAwareGpsCamera(position) {
  if (!map || !position?.coordinate) return;
  const options = terrainController?.cameraOptions?.(position) || {
    center: position.coordinate,
    bearing: position.heading ?? map.getBearing(),
    zoom: Math.max(map.getZoom(), 16.2),
    pitch: 60,
    duration: 520,
    essential: true
  };
  map.easeTo(options);
}

function recordMapReadyPerformance() {
  if (mapReadyRecorded) return;
  mapReadyRecorded = true;
  const startedAt = Number(window.__srMockMapStartedAt || performance.now());
  window.__srMockPerformanceController?.recordMapReady?.(performance.now() - startedAt);
}

function mapControl(action, amount) {
  if (!map) return;
  liveLocationController?.setMode?.('passive', `map-control-${action}`);
  map.stop?.();
  const current = getMapState();
  if (action === 'zoom') {
    map.easeTo({ zoom: clamp(current.zoom + amount, 14.45, 18.4), duration: 320 });
  } else if (action === 'rotate') {
    // Rotation must remain responsive even while native model assets settle;
    // passive mode prevents GPS follow from reclaiming the camera afterward.
    map.jumpTo({ bearing: current.bearing + amount });
  } else if (action === 'tilt') {
    map.easeTo({ pitch: clamp(current.pitch + amount, 38, 68), duration: 320 });
  }
}

function bindMapboxControls() {
  if (document.body.dataset.mockMapControlsBound === 'true') return;
  controlButtons.zoomIn?.addEventListener('click', () => mapControl('zoom', 0.45));
  controlButtons.zoomOut?.addEventListener('click', () => mapControl('zoom', -0.45));
  controlButtons.rotateLeft?.addEventListener('click', () => mapControl('rotate', -18));
  controlButtons.rotateRight?.addEventListener('click', () => mapControl('rotate', 18));
  controlButtons.tiltUp?.addEventListener('click', () => mapControl('tilt', 7));
  controlButtons.tiltDown?.addEventListener('click', () => mapControl('tilt', -7));
  document.body.dataset.mockMapControlsBound = 'true';
}

function setOptimizeButtonState(state, level = optimizedSkinCoverageLevel) {
  if (!optimizeBtn) return;
  const normalized = state || 'idle';
  const running = normalized === 'running';
  optimizeBtn.disabled = running;
  optimizeBtn.classList.toggle('is-running', running);
  optimizeBtn.textContent = running
    ? `L${level}...`
    : level > 0
    ? `L${level} Opt`
    : 'Optimize';
  optimizeBtn.title = running
    ? `Optimizing architecture level ${level}: building structures, polishing skin, and marking build zones`
    : `Optimize map render${level > 0 ? ` - current architecture level ${level}` : ''}`;
}

function setOptimizePhase(phase, detail = '') {
  const startedAt = Number(window.__srMockOptimizeStartedAt || Date.now());
  const elapsedMs = Math.max(0, Math.round(performance.now() - startedAt));
  window.__srMockOptimizePhase = phase;
  window.__srMockOptimizePhaseDetail = detail;
  window.__srMockOptimizeElapsedMs = elapsedMs;
  document.body.dataset.mockOptimizePhase = phase;
  document.body.dataset.mockOptimizeElapsedMs = String(elapsedMs);
  if (optimizeStatusLine) {
    optimizeStatusLine.textContent = `Optimize ${phase}: ${detail || 'working'} (${elapsedMs}ms)`;
  }
}

function rectanglePolygon(west, south, east, north) {
  return {
    type: 'Polygon',
    coordinates: [[
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south]
    ]]
  };
}

function buildOptimizeZoneGeojson(previousBounds, nextBounds, run, level, state = 'working') {
  const complete = state === 'complete';
  const [prevWest, prevSouth, prevEast, prevNorth] = previousBounds || [
    nextBounds[0] + ((nextBounds[2] - nextBounds[0]) * 0.22),
    nextBounds[1] + ((nextBounds[3] - nextBounds[1]) * 0.22),
    nextBounds[2] - ((nextBounds[2] - nextBounds[0]) * 0.22),
    nextBounds[3] - ((nextBounds[3] - nextBounds[1]) * 0.22)
  ];
  const [west, south, east, north] = nextBounds;
  const centerLng = (west + east) / 2;
  const centerLat = (south + north) / 2;
  const features = [
    {
      direction: 'North',
      geometry: rectanglePolygon(west, Math.max(prevNorth, centerLat), east, north),
      center: [centerLng, (Math.max(prevNorth, centerLat) + north) / 2]
    },
    {
      direction: 'South',
      geometry: rectanglePolygon(west, south, east, Math.min(prevSouth, centerLat)),
      center: [centerLng, (south + Math.min(prevSouth, centerLat)) / 2]
    },
    {
      direction: 'East',
      geometry: rectanglePolygon(Math.max(prevEast, centerLng), Math.max(south, prevSouth), east, Math.min(north, prevNorth)),
      center: [(Math.max(prevEast, centerLng) + east) / 2, centerLat]
    },
    {
      direction: 'West',
      geometry: rectanglePolygon(west, Math.max(south, prevSouth), Math.min(prevWest, centerLng), Math.min(north, prevNorth)),
      center: [(west + Math.min(prevWest, centerLng)) / 2, centerLat]
    }
  ].filter((zone) => {
    const ring = zone.geometry.coordinates[0];
    return Math.abs(ring[1][0] - ring[0][0]) > 0.0001 && Math.abs(ring[2][1] - ring[1][1]) > 0.0001;
  });
  return {
    type: 'FeatureCollection',
    features: features.flatMap((zone) => [
      {
        type: 'Feature',
        properties: {
          direction: zone.direction,
          label: `${complete ? 'Complete' : 'Working'}: ${zone.direction}`,
          run,
          level,
          kind: 'coverage',
          state
        },
        geometry: zone.geometry
      },
      {
        type: 'Feature',
        properties: {
          direction: zone.direction,
          label: `${complete ? 'Complete' : 'Working'}: ${zone.direction} skin + structures`,
          run,
          level,
          kind: 'label',
          state
        },
        geometry: {
          type: 'Point',
          coordinates: zone.center
        }
      },
      {
        type: 'Feature',
        properties: {
          direction: zone.direction,
          label: `${complete ? 'Complete' : 'Working'} radar ping`,
          run,
          level,
          kind: 'radar',
          state
        },
        geometry: {
          type: 'Point',
          coordinates: zone.center
        }
      }
    ])
  };
}

function showLatestOptimizeBuildZones(previousBounds, nextBounds, run, level, state = 'working') {
  const complete = state === 'complete';
  let geojson = { type: 'FeatureCollection', features: [] };
  let zoneNames = [];
  try {
    if (!map?.addSource || !Array.isArray(nextBounds) || nextBounds.length !== 4) return null;
    geojson = buildOptimizeZoneGeojson(previousBounds, nextBounds, run, level, state);
    zoneNames = [...new Set(geojson.features
      .filter((feature) => feature.properties?.kind === 'coverage')
      .map((feature) => feature.properties.direction))];
  } catch (error) {
    window.__srMockLatestBuildZoneError = String(error?.message || error || 'zone geojson failed');
    zoneNames = ['North', 'East', 'South', 'West'];
    const [west, south, east, north] = nextBounds || [];
    if ([west, south, east, north].every((value) => Number.isFinite(value))) {
      geojson = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { direction: 'All', label: `${complete ? 'Complete' : 'Working'}: skin + structures`, run, level, kind: 'coverage', state },
            geometry: rectanglePolygon(west, south, east, north)
          },
          {
            type: 'Feature',
            properties: { direction: 'All', label: `${complete ? 'Complete' : 'Working'}: skin + structures`, run, level, kind: 'label', state },
            geometry: { type: 'Point', coordinates: [(west + east) / 2, (south + north) / 2] }
          },
          {
            type: 'Feature',
            properties: { direction: 'All', label: `${complete ? 'Complete' : 'Working'} radar ping`, run, level, kind: 'radar', state },
            geometry: { type: 'Point', coordinates: [(west + east) / 2, (south + north) / 2] }
          }
        ]
      };
    }
  }
  if (optimizeMapboxBuildZoneOverlayEnabled) {
    try {
    if (map.getSource?.(optimizeBuildZoneSourceId)) {
      map.getSource(optimizeBuildZoneSourceId).setData(geojson);
    } else {
      map.addSource(optimizeBuildZoneSourceId, { type: 'geojson', data: geojson });
    }
    if (!map.getLayer?.(optimizeBuildZoneFillLayerId)) {
      map.addLayer({
        id: optimizeBuildZoneFillLayerId,
        type: 'fill',
        source: optimizeBuildZoneSourceId,
        filter: ['==', ['get', 'kind'], 'coverage'],
        paint: {
          'fill-color': [
            'match',
            ['get', 'state'],
            'complete', simpleRidesRadarGreen,
            'working', simpleRidesRadarGreen,
            simpleRidesRadarGreen
          ],
          'fill-opacity': [
            'case',
            ['==', ['get', 'state'], 'complete'],
            0.2,
            0.26
          ]
        }
      });
    }
    if (!map.getLayer?.(optimizeBuildZoneLabelLayerId)) {
      map.addLayer({
        id: optimizeBuildZoneLabelLayerId,
        type: 'symbol',
        source: optimizeBuildZoneSourceId,
        filter: ['==', ['get', 'kind'], 'label'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-anchor': 'center',
          'text-allow-overlap': false
        },
        paint: {
          'text-color': '#f8fff7',
          'text-halo-color': '#06110f',
          'text-halo-width': 1.5
        }
      });
    }
    if (!map.getLayer?.(optimizeRadarPingLayerId)) {
      map.addLayer({
        id: optimizeRadarPingLayerId,
        type: 'circle',
        source: optimizeBuildZoneSourceId,
        filter: ['==', ['get', 'kind'], 'radar'],
        paint: {
          'circle-radius': [
            'case',
            ['==', ['get', 'state'], 'complete'],
            18,
            24
          ],
          'circle-color': [
            'case',
            ['==', ['get', 'state'], 'complete'],
            simpleRidesRadarGreen,
            simpleRidesRadarGreen
          ],
          'circle-opacity': [
            'case',
            ['==', ['get', 'state'], 'complete'],
            0.18,
            0.24
          ],
          'circle-stroke-width': 2,
          'circle-stroke-color': [
            'case',
            ['==', ['get', 'state'], 'complete'],
            '#d9ff9d',
            '#d9ff9d'
          ],
          'circle-stroke-opacity': 0.85
        }
      });
    }
    if (!map.getLayer?.(optimizeRadarCoreLayerId)) {
      map.addLayer({
        id: optimizeRadarCoreLayerId,
        type: 'circle',
        source: optimizeBuildZoneSourceId,
        filter: ['==', ['get', 'kind'], 'radar'],
        paint: {
          'circle-radius': 5,
          'circle-color': [
            'case',
            ['==', ['get', 'state'], 'complete'],
            simpleRidesRadarGreen,
            simpleRidesRadarGreen
          ],
          'circle-opacity': 0.95,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#06110f',
          'circle-stroke-opacity': 0.9
        }
      });
    }
    } catch (error) {
      window.__srMockLatestBuildZoneError = String(error?.message || error);
    }
  } else {
    [optimizeBuildZoneFillLayerId, optimizeBuildZoneLabelLayerId, optimizeRadarPingLayerId, optimizeRadarCoreLayerId]
      .forEach(removeMockLayerIfPresent);
    removeMockSourceIfPresent(optimizeBuildZoneSourceId);
  }
  const overlayInstalled = Boolean(map.getLayer?.(optimizeBuildZoneFillLayerId) || map.getLayer?.(optimizeBuildZoneLabelLayerId));
  const radarInstalled = showDomOptimizeRadarPings(geojson, state, nextBounds, run, level);
  window.__srMockLatestBuildZones = {
    run,
    level,
    zones: zoneNames,
    bounds: nextBounds,
    featureCount: geojson.features.length,
    overlayInstalled,
    radarInstalled,
    state,
    message: zoneNames.length
      ? `${complete ? 'Complete' : 'Working on'} ${zoneNames.join(', ')} skin + structures with green radar.`
      : `${complete ? 'Complete' : 'Working on'} current-view skin + structures with green radar.`
  };
  document.body.dataset.mockLatestBuildZones = window.__srMockLatestBuildZones.message;
  document.body.dataset.mockLatestBuildZoneOverlay = overlayInstalled ? 'visible' : 'hud-only';
  updateOptimizeRadarPing(state);
  if (latestBuildZones) {
    latestBuildZones.textContent = `${complete ? 'Complete' : 'Working'}: ${zoneNames.length ? zoneNames.join(', ') : 'current view'} + green radar`;
    latestBuildZones.title = `Run ${run}, level ${level}. Bounds: ${nextBounds.map((value) => value.toFixed(5)).join(', ')}`;
  }
  return window.__srMockLatestBuildZones;
}

function getRadarFeatures(geojson) {
  return (geojson?.features || [])
    .filter((feature) => feature?.properties?.kind === 'radar' && feature?.geometry?.type === 'Point')
    .filter((feature) => Array.isArray(feature.geometry.coordinates) && feature.geometry.coordinates.length >= 2);
}

function buildDirectionalRadarFeatures(bounds, run, level, state = 'working') {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every((value) => Number.isFinite(value))) return [];
  const [west, south, east, north] = bounds;
  const centerLng = (west + east) / 2;
  const centerLat = (south + north) / 2;
  const lngSpan = east - west;
  const latSpan = north - south;
  return [
    ['North', [centerLng, centerLat + (latSpan * 0.31)]],
    ['East', [centerLng + (lngSpan * 0.31), centerLat]],
    ['South', [centerLng, centerLat - (latSpan * 0.31)]],
    ['West', [centerLng - (lngSpan * 0.31), centerLat]]
  ].map(([direction, coordinates]) => ({
    type: 'Feature',
    properties: {
      direction,
      label: `${state === 'complete' ? 'Complete' : 'Working'} radar ping`,
      run,
      level,
      kind: 'radar',
      state
    },
    geometry: { type: 'Point', coordinates }
  }));
}

function updateDomOptimizeRadarPositions() {
  if (!map?.project || !map?.getContainer) return;
  const rect = map.getContainer().getBoundingClientRect();
  optimizeRadarDomMarkers.forEach((marker) => {
    const coords = marker.__srCoords;
    if (!coords) return;
    const projected = map.project(coords);
    const visible = projected.x >= -80
      && projected.y >= -80
      && projected.x <= rect.width + 80
      && projected.y <= rect.height + 80;
    marker.style.left = `${rect.left + projected.x}px`;
    marker.style.top = `${rect.top + projected.y}px`;
    marker.style.display = visible ? 'block' : 'none';
  });
}

function showDomOptimizeRadarPings(geojson, state = 'working', bounds = window.__srMockLatestBuildZones?.bounds, run = window.__srMockLatestBuildZones?.run, level = window.__srMockLatestBuildZones?.level) {
  const directionalFallback = buildDirectionalRadarFeatures(bounds, run, level, state);
  const sourceFeatures = getRadarFeatures(geojson);
  const features = (sourceFeatures.length >= 4 ? sourceFeatures : directionalFallback.length ? directionalFallback : sourceFeatures).slice(0, 5);
  const activeKeys = new Set();
  if (!features.length || !map?.project) return false;
  if (!optimizeRadarDomBound && map?.on) {
    optimizeRadarDomBound = true;
    map.on('move', updateDomOptimizeRadarPositions);
    map.on('zoom', updateDomOptimizeRadarPositions);
    map.on('rotate', updateDomOptimizeRadarPositions);
    map.on('pitch', updateDomOptimizeRadarPositions);
  }
  features.forEach((feature, index) => {
    const direction = feature.properties?.direction || `Zone ${index + 1}`;
    const key = `${feature.properties?.run || 'run'}-${direction}`;
    activeKeys.add(key);
    let marker = optimizeRadarDomMarkers.get(key);
    if (!marker) {
      marker = document.createElement('div');
      marker.className = 'optimize-radar-marker';
      marker.setAttribute('aria-hidden', 'true');
      marker.innerHTML = `<span class="optimize-radar-label"></span>`;
      document.body.appendChild(marker);
      optimizeRadarDomMarkers.set(key, marker);
    }
    marker.__srCoords = feature.geometry.coordinates;
    marker.classList.toggle('is-complete', state === 'complete');
    const label = marker.querySelector('.optimize-radar-label');
    if (label) label.textContent = `${state === 'complete' ? 'Built' : 'Building'} ${direction}`;
  });
  optimizeRadarDomMarkers.forEach((marker, key) => {
    if (!activeKeys.has(key)) {
      marker.remove();
      optimizeRadarDomMarkers.delete(key);
    }
  });
  window.requestAnimationFrame(updateDomOptimizeRadarPositions);
  document.body.dataset.mockOptimizeRadar = state === 'complete' ? 'complete-green-visible' : 'active-green-visible';
  return true;
}

function updateOptimizeRadarPing(state = window.__srMockLatestBuildZones?.state || 'working') {
  if (!map?.getLayer?.(optimizeRadarPingLayerId)) return;
  const complete = state === 'complete';
  window.clearInterval(optimizeRadarTimer);
  optimizeRadarTimer = 0;
  if (complete) {
    setPaintSafe(optimizeRadarPingLayerId, 'circle-radius', 18);
    setPaintSafe(optimizeRadarPingLayerId, 'circle-opacity', 0.2);
    setPaintSafe(optimizeRadarPingLayerId, 'circle-stroke-opacity', 0.85);
    document.body.dataset.mockOptimizeRadar = document.body.dataset.mockOptimizeRadar || 'complete';
    return;
  }
  document.body.dataset.mockOptimizeRadar = document.body.dataset.mockOptimizeRadar || 'active';
  optimizeRadarTimer = window.setInterval(() => {
    optimizeRadarPulse = (optimizeRadarPulse + 1) % 5;
    const radius = 16 + (optimizeRadarPulse * 9);
    const opacity = Math.max(0.1, 0.42 - (optimizeRadarPulse * 0.065));
    setPaintSafe(optimizeRadarPingLayerId, 'circle-radius', radius);
    setPaintSafe(optimizeRadarPingLayerId, 'circle-opacity', opacity);
    setPaintSafe(optimizeRadarPingLayerId, 'circle-stroke-opacity', Math.max(0.18, opacity + 0.28));
  }, 420);
}

function scheduleOptimizeBuildZoneReveal(previousBounds, nextBounds, run, level, state = 'working') {
  const reveal = () => {
    try {
      showLatestOptimizeBuildZones(previousBounds, nextBounds, run, level, state);
    } catch (error) {
      window.__srMockLatestBuildZoneError = String(error?.message || error);
    }
  };
  window.setTimeout(reveal, 350);
  window.setTimeout(reveal, 1250);
  if (map?.once) {
    try {
      map.once('idle', reveal);
    } catch {
      // The timed retries still cover style/camera settling.
    }
  }
}

function buildOptimizeReport(status = window.__srMockOptimizeStatus || 'pending') {
  const audit = window.__srMockNoDoubleLayerAudit || {};
  const gate = getPublishReviewGate(audit);
  const colorStats = gate.colorStats;
  const mountedLayers = gate.mountedLayers;
  const protectedZones = gate.protectedZones;
  const tileRefs = gate.visibleTileFeatures;
  const clean = gate.ready;
  const tileText = tileRefs || (gate.tileRefsReady ? 'mounted skin active' : 'pending');
  const materialText = gate.materialStatsReady && !colorStats.sample
    ? 'visual polish active'
    : `${colorStats.realMatched} matched / ${colorStats.fallback} fallback`;
  const report = {
    status,
    run: Number(window.__srMockUserOptimizeRuns || 0),
    phase: window.__srMockOptimizePhase || status,
    elapsedMs: Number(window.__srMockOptimizeElapsedMs || 0),
    coverage: window.__srMockLastOptimizeCoverage || 'Austin Go Live center',
    latestBuildZones: window.__srMockLatestBuildZones || null,
    architectureCoverageLevel: Number(window.__srMockOptimizedSkinCoverageLevel || optimizedSkinCoverageLevel || 0),
    architectureCoverageStats: window.__srMockOptimizedSkinCoverageStats || null,
    checklist: gate.checklist,
    blockers: gate.blockers,
    completed: [
      'Expanded architecture skin coverage north/east/south/west',
      'Extended storefront, glass, facade, trim, and roof-cap structure geometry with the skin',
      'Polished material colors, glass, trims, roofs, depth, and facade clarity',
      'Refreshed Mapbox-native building skin filters and zoom range',
      'Re-ran protected detailed-building audit',
      'Re-ran replacement-rule cleanup',
      'Marked latest build zones on HUD and map',
      'Refreshed render health and material-color stats'
    ],
    next: clean ? 'Visually review the expanded render, then continue architectural polish.' : `Resolve: ${gate.blockers.slice(0, 2).join(', ') || 'publish gate warming'}.`,
    approval: 'No approval needed for mock-only optimization. Approval is still needed before applying this to real Go Live.',
    summary: `${clean ? 'Clean' : 'Review'}: ${mountedLayers} layers, ${protectedZones} protected zones, ${tileText} tile refs, ${materialText}.`
  };
  window.__srMockLastOptimizeReport = report;
  document.body.dataset.mockOptimizeReport = `${report.summary} Next: ${report.next}`;
  return report;
}

function updateOptimizeStatusLine(report = window.__srMockLastOptimizeReport) {
  if (!optimizeStatusLine) return;
  if (!report) {
    optimizeStatusLine.textContent = 'Optimize: ready';
    return;
  }
  const doneText = report.completed?.slice(0, 3).join('; ') || 'Optimization pass started';
  const state = report.status === 'running'
    ? 'Running'
    : String(report.status || '').startsWith('review')
    ? 'Needs review'
    : 'Complete';
  const levelText = report.architectureCoverageLevel ? `level ${report.architectureCoverageLevel}` : 'base level';
  const reachName = window.__srMockOptimizeReachName || 'Austin Go Live reach';
  optimizeStatusLine.textContent = state === 'Running'
    ? `Optimizing: ${reachName}`
    : `Optimized: ${reachName}`;
  optimizeStatusLine.title = [
    ...(report.completed || []),
    `Reach tier: ${window.__srMockOptimizeReachTier || 0} - ${reachName}`,
    `Coverage: ${report.coverage}`,
    `Latest build zones: ${report.latestBuildZones?.message || 'waiting for optimize pass'}`,
    `Phase: ${report.phase || report.status}`,
    `Elapsed: ${report.elapsedMs || 0}ms`,
    `Architecture coverage: ${levelText}`,
    `Mounted skin layers: ${report.architectureCoverageStats?.mountedLayers ?? 'checking'}`,
    `Visual polish: ${JSON.stringify(report.architectureCoverageStats?.visualPolish || {})}`,
    `Structure geometry: ${JSON.stringify(report.architectureCoverageStats?.structureGeometry || {})}`,
    `Next: ${report.next}`,
    `Approval: ${report.approval}`
  ].join('\n');
}

function getOptimizeOutreachPlan(run, origin = liveCenter || center) {
  const stages = [
    { tier: 1, name: 'Downtown Austin core', halfLng: 0.026, halfLat: 0.020, maxZoom: 16.1, pitch: 58 },
    { tier: 2, name: 'Central Austin neighborhoods', halfLng: 0.052, halfLat: 0.040, maxZoom: 15.35, pitch: 56 },
    { tier: 3, name: 'Greater Austin city reach', halfLng: 0.115, halfLat: 0.085, maxZoom: 14.25, pitch: 52 },
    { tier: 4, name: 'Austin metro and surrounding cities', halfLng: 0.42, halfLat: 0.31, maxZoom: 11.35, pitch: 42 },
    { tier: 5, name: 'Central Texas corridor', halfLng: 1.25, halfLat: 0.92, maxZoom: 9.35, pitch: 30 },
    { tier: 6, name: 'Texas statewide coverage target', halfLng: 5.85, halfLat: 4.45, maxZoom: 6.0, pitch: 0 },
    { tier: 7, name: 'Southern USA coverage target', halfLng: 14.5, halfLat: 8.2, maxZoom: 4.35, pitch: 0 },
    { tier: 8, name: 'USA coverage target', halfLng: 28, halfLat: 16, maxZoom: 3.2, pitch: 0 },
    { tier: 9, name: 'Planet coverage target', halfLng: 175, halfLat: 72, maxZoom: 1.55, pitch: 0 }
  ];
  const stage = stages[Math.min(stages.length - 1, Math.max(0, Number(run || 1) - 1))];
  const centerLng = stage.tier >= 6 ? -99.9018 : origin[0];
  const centerLat = stage.tier >= 6 ? 31.9686 : origin[1];
  const west = Math.max(-179.5, centerLng - stage.halfLng);
  const east = Math.min(179.5, centerLng + stage.halfLng);
  const south = Math.max(-84, centerLat - stage.halfLat);
  const north = Math.min(84, centerLat + stage.halfLat);
  return {
    ...stage,
    center: [centerLng, centerLat],
    bounds: [[west, south], [east, north]],
    flatBounds: [west, south, east, north],
    renderLevel: Math.min(5, stage.tier),
    coverageLabel: `${stage.name}: ${west.toFixed(3)}, ${south.toFixed(3)} to ${east.toFixed(3)}, ${north.toFixed(3)}`
  };
}

function getRegionalBuildingTilesetForTier(tier = window.__srMockOptimizeReachTier || 1) {
  return Object.values(regionalBuildingTilesetConfig)
    .find((config) => (config.reachTiers || []).includes(Number(tier)))
    || regionalBuildingTilesetConfig.austin;
}

function setActiveRealBuildingTilesetForReachTier(tier = window.__srMockOptimizeReachTier || 1, options = {}) {
  const target = getRegionalBuildingTilesetForTier(tier);
  if (!target?.url || !target?.sourceLayer) return false;
  const regionalSwitchEnabled = new URLSearchParams(window.location.search).get('useRegionalTilesets') === '1'
    || window.localStorage?.getItem?.('srMockUseRegionalTilesets') === 'true'
    || window.SimpleRidesMaps?.mockUseRegionalBuildingTilesets === true;
  const publishedRegionalTier = Number(tier) <= 4;
  if (Number(tier) > 3 && !publishedRegionalTier && !regionalSwitchEnabled && options.forcePublished !== true) {
    window.__srMockActiveRegionalTileset = {
      tier: Number(tier),
      label: target.label,
      url: target.url,
      sourceLayer: target.sourceLayer,
      status: 'pending-publish-enable-useRegionalTilesets'
    };
    return false;
  }
  const sameTileset = realBuildingTilesetConfig.url === target.url
    && realBuildingTilesetConfig.sourceLayer === target.sourceLayer;
  window.__srMockActiveRegionalTileset = {
    tier: Number(tier),
    label: target.label,
    url: target.url,
    sourceLayer: target.sourceLayer,
    status: sameTileset ? 'already-active' : 'switching'
  };
  if (sameTileset) return true;
  resetFacadeKitV2Manager();
  [
    realBuildingTilesetConfig.clipLayerId,
    realBuildingTilesetConfig.baseLayerId,
    realBuildingTilesetConfig.entryRevealLayerId,
    realBuildingTilesetConfig.streetGlassLayerId,
    realBuildingTilesetConfig.storefrontCanopyLayerId,
    realBuildingTilesetConfig.parkingBandLayerId,
    realBuildingTilesetConfig.parkingUpperBandLayerId,
    realBuildingTilesetConfig.paleRoofDeckLayerId,
    realBuildingTilesetConfig.glassAccentLayerId,
    realBuildingTilesetConfig.facadeAccentLayerId,
    realBuildingTilesetConfig.upperTrimLayerId,
    realBuildingTilesetConfig.roofLayerId,
    realBuildingTilesetConfig.volumeLayerId
  ].forEach(removeMockLayerIfPresent);
  removeMockSourceIfPresent(realBuildingTilesetConfig.sourceId);
  realBuildingTilesetConfig.url = target.url;
  realBuildingTilesetConfig.sourceLayer = target.sourceLayer;
  window.__srMockRealTilesetConfig = realBuildingTilesetConfig;
  window.__srMockRealTilesetLayersMounted = false;
  window.__srMockActiveRegionalTileset.status = 'selected';
  return true;
}

function activatePublishedBuildingTilesetForCoordinate(coord) {
  if (!Array.isArray(coord) || coord.length < 2) return false;
  const [lng, lat] = coord.map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
  const inAustinSurroundingCities = lng >= -97.93 && lng <= -97.55 && lat >= 30.33 && lat <= 30.57;
  const targetTier = inAustinSurroundingCities ? 4 : 1;
  const changed = setActiveRealBuildingTilesetForReachTier(targetTier, { forcePublished: true });
  if (changed && map?.isStyleLoaded?.()) {
    window.setTimeout(() => {
      installRealBuildingTilesetSource();
      installFacadeKitV2();
      refreshRealBuildingTilesetStats();
    }, 80);
  }
  return changed;
}

function optimizeMapExperience() {
  if (window.__srMockOptimizeStatus === 'running') return;
  const optimizeRun = Number(window.__srMockUserOptimizeRuns || 0) + 1;
  window.__srMockUserOptimizeRuns = optimizeRun;
  const outreachPlan = getOptimizeOutreachPlan(optimizeRun);
  optimizedSkinCoverageLevel = outreachPlan.renderLevel;
  window.__srMockOptimizedSkinCoverageLevel = optimizedSkinCoverageLevel;
  window.__srMockOptimizeReachTier = outreachPlan.tier;
  window.__srMockOptimizeReachName = outreachPlan.name;
  window.__srMockLastOptimizeAt = Date.now();
  window.__srMockOptimizeStartedAt = performance.now();
  window.__srMockOptimizeStatus = 'running';
  setOptimizeButtonState('running', optimizedSkinCoverageLevel);
  document.body.dataset.mockOptimizeRuns = String(window.__srMockUserOptimizeRuns);
  document.body.dataset.mockOptimizeStatus = window.__srMockOptimizeStatus;
  document.body.dataset.mockOptimizeReachTier = String(outreachPlan.tier);
  document.body.dataset.mockOptimizeReachName = outreachPlan.name;
  setActiveRealBuildingTilesetForReachTier(outreachPlan.tier);
  setOptimizePhase('Starting', `run ${optimizeRun}, ${outreachPlan.name}`);
  updateOptimizeStatusLine(buildOptimizeReport('running'));
  setStatus(`Optimizing ${outreachPlan.name}: extending architecture skin outward while polishing realism, color, clarity, and depth...`);
  document.body.classList.remove('render-off');
  const centerCoord = outreachPlan.center;
  window.__srMockLastOptimizeCoverage = outreachPlan.coverageLabel;
  const expandedBounds = outreachPlan.bounds;
  const nextBoundsFlat = outreachPlan.flatBounds;
  const previousBounds = lastOptimizeBounds;
  setOptimizePhase('Marking zones', `showing ${outreachPlan.name} north/east/south/west build reach`);
  try {
    showLatestOptimizeBuildZones(previousBounds, nextBoundsFlat, optimizeRun, optimizedSkinCoverageLevel, 'working');
    scheduleOptimizeBuildZoneReveal(previousBounds, nextBoundsFlat, optimizeRun, optimizedSkinCoverageLevel, 'working');
  } catch (error) {
    window.__srMockLatestBuildZoneError = String(error?.message || error);
    window.__srMockLatestBuildZones = {
      run: optimizeRun,
      level: optimizedSkinCoverageLevel,
      zones: ['North', 'East', 'South', 'West'],
      bounds: nextBoundsFlat,
      featureCount: 0,
      state: 'working',
      radarInstalled: false,
      message: `${outreachPlan.name} expanded North, East, South, and West; green radar needs review.`
    };
    if (latestBuildZones) latestBuildZones.textContent = 'Working: North, East, South, West + green radar';
  }
  lastOptimizeBounds = nextBoundsFlat;
  setOptimizePhase('Expanding view', `moving camera to ${outreachPlan.name}`);
  try {
    if (outreachPlan.tier === 1 && map?.easeTo) {
      map.easeTo({
        center: centerCoord,
        zoom: 14.45,
        pitch: outreachPlan.pitch,
        bearing: Number(mapConfig.streetBearing || -18),
        duration: 650
      });
    } else if (map?.fitBounds) {
      const compactViewport = window.innerWidth <= 720;
      map.fitBounds(expandedBounds, {
        padding: compactViewport
          ? { top: 68, right: 60, bottom: 104, left: 20 }
          : { top: 70, right: 108, bottom: 96, left: 92 },
        pitch: outreachPlan.pitch,
        bearing: Number(mapConfig.streetBearing || -18),
        duration: 650,
        maxZoom: outreachPlan.maxZoom
      });
    } else {
      map?.easeTo?.({ center: centerCoord, zoom: outreachPlan.maxZoom, pitch: outreachPlan.pitch, bearing: Number(mapConfig.streetBearing || -18), duration: 650 });
    }
  } catch {
    map?.easeTo?.({ center: centerCoord, zoom: outreachPlan.maxZoom, pitch: outreachPlan.pitch, bearing: Number(mapConfig.streetBearing || -18), duration: 650 });
  }
  try {
    setOptimizePhase('Loading skin', 'checking real building tileset and Mapbox-native skin layers');
    installRealBuildingTilesetSource();
    setOptimizePhase('Protecting detail', 'auditing detailed Mapbox buildings before adding more skin');
    updateDynamicDetailedMapboxProtections(true);
    setOptimizePhase('Extending structures', 'expanding storefront, glass, facade, trim, and roof-cap geometry');
    applyOptimizedSkinCoverageTuning(optimizedSkinCoverageLevel);
    vectorSkinFilterSignature = '';
    applyVectorSkinProtectionFilters();
    refreshRealBuildingTilesetStats();
    auditMockReplacementRule();
    setOptimizePhase('Polishing visuals', 'refreshing basemap, contrast, material color, and render health');
    setSimArchitectureVisibility(true);
    applySimBasemapConfig(true);
    scheduleGreatMapSkinHealthCheck(900);
    window.setTimeout(() => {
      setOptimizePhase('QA pass', 'checking tiles, materials, protection, replacement rule, and build zones');
      refreshRealBuildingTilesetStats();
      auditMockReplacementRule();
      window.__srMockOptimizeStatus = 'complete';
      document.body.dataset.mockOptimizeStatus = 'complete';
      applyOptimizedSkinCoverageTuning(optimizedSkinCoverageLevel);
      showLatestOptimizeBuildZones(previousBounds, nextBoundsFlat, optimizeRun, optimizedSkinCoverageLevel, 'complete');
      setOptimizePhase('Complete', `${outreachPlan.name} reach extended and polished`);
      updateOptimizeStatusLine(buildOptimizeReport('complete'));
      setStatus(`Optimized ${outreachPlan.name}: structures extended with skin, colors polished, glass clarified, and facade depth improved.`);
      setOptimizeButtonState('complete', optimizedSkinCoverageLevel);
      updateSkinReadout();
    }, 1200);
    window.setTimeout(() => {
      setOptimizePhase('Final review', 'rechecking protection filters, build-zone highlight, and publish readiness');
      updateDynamicDetailedMapboxProtections(true);
      applyOptimizedSkinCoverageTuning(optimizedSkinCoverageLevel);
      applyVectorSkinProtectionFilters();
      scheduleOptimizeBuildZoneReveal(previousBounds, nextBoundsFlat, optimizeRun, optimizedSkinCoverageLevel, 'complete');
      refreshRealBuildingTilesetStats();
      auditMockReplacementRule();
      setOptimizePhase('Complete', `level ${optimizedSkinCoverageLevel} final review clean`);
      updateOptimizeStatusLine(buildOptimizeReport(window.__srMockOptimizeStatus || 'complete'));
      setOptimizeButtonState('complete', optimizedSkinCoverageLevel);
      updateSkinReadout();
    }, 2800);
  } catch (error) {
    window.__srMockOptimizeStatus = `review: ${error?.message || error}`;
    document.body.dataset.mockOptimizeStatus = window.__srMockOptimizeStatus;
    setOptimizePhase('Needs review', String(error?.message || error));
    updateOptimizeStatusLine(buildOptimizeReport(window.__srMockOptimizeStatus));
    setOptimizeButtonState('review', optimizedSkinCoverageLevel);
  }
  updateSkinReadout();
}

const deprecatedMockArchitectureLayerIds = [
  'src-mock-sim-footprint-trim',
  'src-mock-sim-storefront-trim',
  'src-mock-osm-building-footprint-trim',
  'src-mock-osm-depth-edge',
  'src-mock-osm-storefront-awning',
  'src-mock-osm-glass-accent',
  'src-mock-osm-window-rhythm',
  'src-mock-osm-brick-coursing',
  'src-mock-osm-wood-siding',
  'src-mock-osm-concrete-panel-seams',
  'src-mock-osm-entry-paths',
  'src-mock-osm-parking-stripes',
  'src-mock-osm-structural-crowns',
  'src-mock-osm-yard-fences',
  'src-mock-osm-curb-edge-lines',
  'src-mock-osm-terrace-rails',
  'src-mock-osm-driveway-lines',
  'src-mock-osm-entry-canopies',
  'src-mock-osm-awning-dots',
  'src-mock-osm-parking-stripes',
  'src-mock-osm-roof-gardens',
  'src-mock-osm-roof-pool-panels',
  'src-mock-osm-roof-parapets',
  'src-mock-osm-service-boxes',
  'src-mock-osm-solar-panels',
  'src-mock-osm-roof-corner-dots',
  'src-mock-osm-skylight-panels',
  'src-mock-osm-window-light-dots',
  'src-mock-osm-tree-dots',
  'src-mock-osm-car-dots',
  'src-mock-osm-roof-equipment',
  'src-mock-osm-facade-spines',
  'src-mock-osm-balcony-rails',
  'src-mock-osm-lot-pads',
  'src-mock-osm-patio-pads',
  'src-mock-osm-porch-pads',
  'src-mock-osm-sidewalk-halos',
  'src-mock-osm-loading-bays',
  'src-mock-osm-planter-strips',
  'src-mock-osm-billboard-panels'
];
const deprecatedMockArchitectureSourceIds = [
  'src-mock-osm-entry-points',
  'src-mock-osm-roof-points',
  'src-mock-osm-tree-points',
  'src-mock-osm-car-points',
  'src-mock-osm-lot-pad-polygons',
  'src-mock-osm-sidewalk-halo-polygons',
  'src-mock-osm-loading-bay-polygons',
  'src-mock-osm-planter-strip-polygons',
  'src-mock-osm-patio-polygons',
  'src-mock-osm-porch-pad-polygons',
  'src-mock-osm-entry-lines',
  'src-mock-osm-driveway-lines-source',
  'src-mock-osm-entry-canopy-polygons',
  'src-mock-osm-awning-dot-points',
  'src-mock-osm-yard-fence-lines',
  'src-mock-osm-curb-edge-lines-source',
  'src-mock-osm-billboard-panel-polygons',
  'src-mock-osm-parking-lines',
  'src-mock-osm-roof-garden-polygons',
  'src-mock-osm-roof-pool-polygons',
  'src-mock-osm-roof-parapet-polygons',
  'src-mock-osm-service-box-polygons',
  'src-mock-osm-solar-panel-polygons',
  'src-mock-osm-roof-corner-points',
  'src-mock-osm-terrace-rail-lines',
  'src-mock-osm-skylight-panel-polygons',
  'src-mock-osm-window-light-points',
  'src-mock-osm-streetlight-points',
  'src-mock-osm-plaza-dot-points',
  'src-mock-osm-activity-dot-points',
  'src-mock-osm-roof-equipment-polygons',
  'src-mock-osm-roof-ridge-lines',
  'src-mock-osm-structural-crown-polygons',
  'src-mock-osm-facade-spine-lines',
  'src-mock-osm-balcony-lines'
];

function removeMockLayerIfPresent(id) {
  try {
    if (map?.getLayer?.(id)) map.removeLayer(id);
  } catch (error) {
    window.__srMockLayerInstallErrors = [...(window.__srMockLayerInstallErrors || []), `${id}: remove failed ${error?.message || error}`].slice(-80);
  }
}

function removeMockSourceIfPresent(id) {
  try {
    if (map?.getSource?.(id)) map.removeSource(id);
  } catch (error) {
    window.__srMockLayerInstallErrors = [...(window.__srMockLayerInstallErrors || []), `${id}: source remove failed ${error?.message || error}`].slice(-80);
  }
}

function removeMockLayersForSource(sourceId) {
  try {
    const layers = map?.getStyle?.()?.layers || [];
    layers
      .filter((layer) => layer.source === sourceId && /^src-mock-/.test(layer.id || ''))
      .forEach((layer) => removeMockLayerIfPresent(layer.id));
  } catch (error) {
    window.__srMockLayerInstallErrors = [...(window.__srMockLayerInstallErrors || []), `${sourceId}: dependent layer cleanup failed ${error?.message || error}`].slice(-80);
  }
}

function enforceMockReplacementRule() {
  [...simArchitectureLayerIds, ...deprecatedMockArchitectureLayerIds].forEach(removeMockLayerIfPresent);
  deprecatedMockArchitectureSourceIds.forEach(removeMockSourceIfPresent);
  window.__srMockReplacementRule = 'active: old mock layers/sources removed before footprint-aligned surfaces mount';
}

function addMapLayerSafe(layer) {
  try {
    if (layer?.type === 'line' && /^src-mock-/.test(layer.id || '')) {
      if (map?.getLayer?.(layer.id)) map.removeLayer(layer.id);
      return false;
    }
    if (!map) return false;
    removeMockLayerIfPresent(layer.id);
    map.addLayer(layer);
    window.__srMockLayerInstallOk = [...(window.__srMockLayerInstallOk || []), layer.id].slice(-80);
    return true;
  } catch (error) {
    window.__srMockLayerInstallErrors = [...(window.__srMockLayerInstallErrors || []), `${layer.id}: ${error?.message || error}`].slice(-80);
    console.warn(`Skipped mock layer ${layer.id}:`, error);
    return false;
  }
}

const simArchitectureLayerIds = [
  'src-mock-real-building-footprint-data',
  'src-mock-real-building-native-clip',
  'src-mock-real-building-tileset-volume',
  'src-mock-real-building-tileset-storefront-base',
  'src-mock-real-building-tileset-entry-shadow-reveals',
  'src-mock-real-building-tileset-street-glass-bands',
  'src-mock-real-building-tileset-storefront-canopies',
  'src-mock-real-building-tileset-roof-caps',
  'src-mock-real-building-tileset-parking-deck-bands',
  'src-mock-real-building-tileset-parking-upper-deck-bands',
  'src-mock-real-building-tileset-pale-roof-decks',
  'src-mock-real-building-tileset-glass-accents',
  'src-mock-real-building-tileset-photo-facade-accents',
  'src-mock-real-building-tileset-upper-trim'
];
const activeMockArchitectureSourceIds = [
  'src-mock-real-building-tileset'
];
let styledMapboxArchitectureLayerIds = [];
let hiddenOriginalBuildingLayerIds = [];
let basemapConfigApplied = false;
let simArchitectureInstallAttempts = 0;
let simArchitectureInstallTimer = 0;
let osmFootprintLoadStarted = false;
let osmFootprintRequestInFlight = false;
let osmFootprintLoadedBoundsKey = '';
let osmFootprintStableCenter = null;
let osmFootprintStableZoom = 0;
let osmFootprintRefreshTimer = 0;
let greatMapSkinHealthTimer = 0;
let vectorSkinFilterSignature = '';
let vectorSkinFilterLayerCount = 0;
let optimizedSkinCoverageLevel = 0;
let lastOptimizeBounds = null;
let optimizeRadarTimer = 0;
let optimizeRadarPulse = 0;
let optimizeRadarDomBound = false;
const optimizeRadarDomMarkers = new Map();
let renderedFeatureContextCache = new Map();
let renderedFeatureContextStats = { queries: 0, hits: 0 };
const optimizeBuildZoneSourceId = 'src-mock-optimize-build-zones';
const optimizeBuildZoneFillLayerId = 'src-mock-optimize-build-zones-fill';
const optimizeBuildZoneLabelLayerId = 'src-mock-optimize-build-zones-labels';
const optimizeRadarPingLayerId = 'src-mock-optimize-radar-ping';
const optimizeRadarCoreLayerId = 'src-mock-optimize-radar-core';
const optimizeMapboxBuildZoneOverlayEnabled = false;
const simpleRidesRadarGreen = '#aefe4e';
const disabledBulkyArchitectureLayerIds = [
  'src-mock-osm-obvious-facade-plates',
  'src-mock-osm-architectural-projections',
  'src-mock-osm-architectural-setbacks',
  'src-mock-osm-architectural-podiums',
  'src-mock-osm-architectural-reveals',
  'src-mock-osm-structural-facade-frames'
];
const disabledBulkyArchitectureSourceIds = [
  'src-mock-osm-obvious-facade-plate-polygons',
  'src-mock-osm-architectural-projection-polygons',
  'src-mock-osm-architectural-setback-polygons',
  'src-mock-osm-architectural-podium-polygons',
  'src-mock-osm-architectural-reveal-polygons',
  'src-mock-osm-structural-facade-frame-polygons'
];
const disabledClutterArchitectureLayerIds = [
  'src-mock-osm-window-light-dots',
  'src-mock-osm-tree-dots',
  'src-mock-osm-plaza-dots',
  'src-mock-osm-activity-dots',
  'src-mock-osm-streetlight-dots',
  'src-mock-osm-car-dots',
  'src-mock-osm-roof-equipment'
];
const disabledClutterArchitectureSourceIds = [
  'src-mock-osm-window-light-points',
  'src-mock-osm-tree-points',
  'src-mock-osm-plaza-dot-points',
  'src-mock-osm-activity-dot-points',
  'src-mock-osm-streetlight-points',
  'src-mock-osm-car-points',
  'src-mock-osm-roof-equipment-polygons'
];
const disabledRoofOverlayLayerIds = [
  'src-mock-osm-structural-crowns',
  'src-mock-osm-roof-gardens',
  'src-mock-osm-roof-pool-panels',
  'src-mock-osm-roof-parapets',
  'src-mock-osm-service-boxes',
  'src-mock-osm-solar-panels',
  'src-mock-osm-roof-corner-dots',
  'src-mock-osm-skylight-panels',
  'src-mock-osm-roof-equipment'
];
const disabledRoofOverlaySourceIds = [
  'src-mock-osm-structural-crown-polygons',
  'src-mock-osm-roof-garden-polygons',
  'src-mock-osm-roof-pool-polygons',
  'src-mock-osm-roof-parapet-polygons',
  'src-mock-osm-service-box-polygons',
  'src-mock-osm-solar-panel-polygons',
  'src-mock-osm-roof-corner-points',
  'src-mock-osm-skylight-panel-polygons',
  'src-mock-osm-roof-equipment-polygons'
];
const footprintCacheVersion = 'mock-footprint-skin-v21-overture-building-parts';
window.__srMockGreatMapLocked = true;
window.__srMockReplacementRule = 'active: Mapbox-coordinate footprint skin only; no floating mesh or roof/crown double layer';
window.__srMockOptimizeDirective = 'Optimize = expand architecture-skin reach north/east/south/west every tap: Austin core, central Austin, greater Austin, surrounding cities, Texas, USA, then planet; improve visuals and speed, protect detailed Mapbox buildings, and keep replacement rule clean';

function removeDisabledRoofOverlays() {
  disabledRoofOverlayLayerIds.forEach(removeMockLayerIfPresent);
  disabledRoofOverlaySourceIds.forEach(removeMockSourceIfPresent);
  window.__srMockRoofOverlayStatus = 'generic roof overlays disabled; detailed Mapbox roofs preserved';
}

const realBuildingTilesetConfig = {
  sourceId: 'src-mock-real-building-tileset',
  presentationMode: 'facade-kit-structure-only',
  dataLayerId: 'src-mock-real-building-footprint-data',
  clipLayerId: 'src-mock-real-building-native-clip',
  volumeLayerId: 'src-mock-real-building-tileset-volume',
  baseLayerId: 'src-mock-real-building-tileset-storefront-base',
  entryRevealLayerId: 'src-mock-real-building-tileset-entry-shadow-reveals',
  streetGlassLayerId: 'src-mock-real-building-tileset-street-glass-bands',
  storefrontCanopyLayerId: 'src-mock-real-building-tileset-storefront-canopies',
  roofLayerId: 'src-mock-real-building-tileset-roof-caps',
  parkingBandLayerId: 'src-mock-real-building-tileset-parking-deck-bands',
  parkingUpperBandLayerId: 'src-mock-real-building-tileset-parking-upper-deck-bands',
  paleRoofDeckLayerId: 'src-mock-real-building-tileset-pale-roof-decks',
  glassAccentLayerId: 'src-mock-real-building-tileset-glass-accents',
  facadeAccentLayerId: 'src-mock-real-building-tileset-photo-facade-accents',
  upperTrimLayerId: 'src-mock-real-building-tileset-upper-trim',
  url:
    new URLSearchParams(window.location.search).get('tileset')
    || window.localStorage?.getItem?.('srMockBuildingTilesetUrl')
    || window.SimpleRidesMaps?.mockBuildingTilesetUrl
    || 'mapbox://jwavvy512.simplerides-austin-building-skin',
  sourceLayer:
    new URLSearchParams(window.location.search).get('tilesetLayer')
    || window.localStorage?.getItem?.('srMockBuildingTilesetLayer')
    || window.SimpleRidesMaps?.mockBuildingTilesetLayer
    || 'austin_building_skin',
  enabled:
    (new URLSearchParams(window.location.search).get('tileset') || window.SimpleRidesMaps?.mockBuildingTilesetUrl)
    ? true
    : window.localStorage?.getItem?.('srMockUseRealBuildingTileset') !== 'false'
};

function publishedBuildingPresentationLayerIds() {
  return [
    realBuildingTilesetConfig.clipLayerId,
    realBuildingTilesetConfig.volumeLayerId,
    realBuildingTilesetConfig.baseLayerId,
    realBuildingTilesetConfig.entryRevealLayerId,
    realBuildingTilesetConfig.streetGlassLayerId,
    realBuildingTilesetConfig.storefrontCanopyLayerId,
    realBuildingTilesetConfig.parkingBandLayerId,
    realBuildingTilesetConfig.parkingUpperBandLayerId,
    realBuildingTilesetConfig.paleRoofDeckLayerId,
    realBuildingTilesetConfig.glassAccentLayerId,
    realBuildingTilesetConfig.facadeAccentLayerId,
    realBuildingTilesetConfig.upperTrimLayerId,
    realBuildingTilesetConfig.roofLayerId
  ];
}

function enforceMapboxFoundationPresentation() {
  publishedBuildingPresentationLayerIds().forEach(removeMockLayerIfPresent);
  window.__srMockOpaqueReplacementLayers = 0;
  window.__srMockReplacementRule = 'active: Mapbox architecture preserved; published footprints drive shallow Facade Kit structures only';
  document.body.dataset.mockPresentationMode = realBuildingTilesetConfig.presentationMode;
  document.body.dataset.mockReplacementHandoff = 'native-buildings-visible';
}
const regionalBuildingTilesetConfig = {
  austin: {
    reachTiers: [1, 2, 3],
    url: realBuildingTilesetConfig.url,
    sourceLayer: realBuildingTilesetConfig.sourceLayer,
    label: 'Austin core/current published skin'
  },
  austinMetro: {
    reachTiers: [4],
    url:
      new URLSearchParams(window.location.search).get('tilesetAustinMetro')
      || window.localStorage?.getItem?.('srMockAustinMetroTilesetUrl')
      || window.SimpleRidesMaps?.mockAustinMetroBuildingTilesetUrl
      || 'mapbox://jwavvy512.sr-atx-surround-skin',
    sourceLayer:
      new URLSearchParams(window.location.search).get('tilesetAustinMetroLayer')
      || window.localStorage?.getItem?.('srMockAustinMetroTilesetLayer')
      || window.SimpleRidesMaps?.mockAustinMetroBuildingTilesetLayer
      || 'austin_surrounding_cities_building_skin',
    label: 'Austin surrounding cities first expansion skin'
  },
  centralTexas: {
    reachTiers: [5],
    url:
      new URLSearchParams(window.location.search).get('tilesetCentralTexas')
      || window.localStorage?.getItem?.('srMockCentralTexasTilesetUrl')
      || window.SimpleRidesMaps?.mockCentralTexasBuildingTilesetUrl
      || 'mapbox://jwavvy512.simplerides-central-texas-building-skin',
    sourceLayer:
      new URLSearchParams(window.location.search).get('tilesetCentralTexasLayer')
      || window.localStorage?.getItem?.('srMockCentralTexasTilesetLayer')
      || window.SimpleRidesMaps?.mockCentralTexasBuildingTilesetLayer
      || 'central_texas_building_skin',
    label: 'Central Texas corridor skin'
  },
  texas: {
    reachTiers: [6],
    url:
      new URLSearchParams(window.location.search).get('tilesetTexas')
      || window.localStorage?.getItem?.('srMockTexasTilesetUrl')
      || window.SimpleRidesMaps?.mockTexasBuildingTilesetUrl
      || 'mapbox://jwavvy512.simplerides-texas-building-skin',
    sourceLayer:
      new URLSearchParams(window.location.search).get('tilesetTexasLayer')
      || window.localStorage?.getItem?.('srMockTexasTilesetLayer')
      || window.SimpleRidesMaps?.mockTexasBuildingTilesetLayer
      || 'texas_building_skin',
    label: 'Texas statewide skin'
  },
  usa: {
    reachTiers: [7, 8],
    url:
      new URLSearchParams(window.location.search).get('tilesetUsa')
      || window.localStorage?.getItem?.('srMockUsaTilesetUrl')
      || window.SimpleRidesMaps?.mockUsaBuildingTilesetUrl
      || 'mapbox://jwavvy512.simplerides-usa-building-skin',
    sourceLayer:
      new URLSearchParams(window.location.search).get('tilesetUsaLayer')
      || window.localStorage?.getItem?.('srMockUsaTilesetLayer')
      || window.SimpleRidesMaps?.mockUsaBuildingTilesetLayer
      || 'usa_building_skin',
    label: 'USA building skin'
  },
  planet: {
    reachTiers: [9],
    url:
      new URLSearchParams(window.location.search).get('tilesetPlanet')
      || window.localStorage?.getItem?.('srMockPlanetTilesetUrl')
      || window.SimpleRidesMaps?.mockPlanetBuildingTilesetUrl
      || 'mapbox://jwavvy512.simplerides-planet-building-skin',
    sourceLayer:
      new URLSearchParams(window.location.search).get('tilesetPlanetLayer')
      || window.localStorage?.getItem?.('srMockPlanetTilesetLayer')
      || window.SimpleRidesMaps?.mockPlanetBuildingTilesetLayer
      || 'planet_building_skin',
    label: 'Planet building skin'
  }
};
const realWorldColorProfileMode = 'deterministic-real-context-v1';
const realWorldKnownMaterialProfiles = [
  'brick',
  'residentialBrick',
  'retailBrick',
  'softTerracotta',
  'warmWood',
  'storefrontWarm',
  'parkingGarage',
  'officeGlass',
  'midriseGlass',
  'steelStone',
  'hotelStoneGlass',
  'limestone',
  'tanStone',
  'paleConcrete',
  'entertainmentStorefront',
  'creamGlass'
];
const realWorldContextCategories = [
  'storefront',
  'restaurant',
  'retail',
  'hotel',
  'office',
  'parking',
  'residential',
  'civic',
  'building'
];
window.__srMockColorProfileMode = realWorldColorProfileMode;
const footprintBrowserCacheEnabled = new URLSearchParams(window.location.search).get('footprintCache') === '1';
window.__srMockRealTilesetConfig = realBuildingTilesetConfig;
const osmFootprintEndpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const protectedAustinLandmarkZones = [
  { name: 'Austin Convention Center', center: [-97.7404, 30.2637], radiusMeters: 265, protectComplex: true },
  { name: 'The Driskill', center: [-97.7417, 30.2682], radiusMeters: 95 },
  { name: 'Texas State Capitol Complex', center: [-97.7404, 30.2747], radiusMeters: 390, protectComplex: true },
  { name: '111 Congress', center: [-97.7432, 30.2638], radiusMeters: 140 },
  { name: 'W 2nd-3rd Street detailed glass buildings', center: [-97.7451, 30.2649], radiusMeters: 210 }
];
const realWorldAustinSignatureZones = [
  {
    name: 'Indeed Tower',
    center: [-97.7436, 30.2685],
    radiusMeters: 150,
    category: 'signatureGlass',
    source: 'Real-world Austin signature zone',
    preserveMapboxDetail: true,
    material: {
      style: 'signatureBlueGlass',
      wall: '#8ebfd0',
      roof: '#30434d',
      base: '#5ea6af',
      window: '#c7fbff',
      trim: '#f0f3e7'
    }
  },
  {
    name: 'One American Center',
    center: [-97.7425, 30.2686],
    radiusMeters: 115,
    category: 'signatureGlass',
    source: 'Real-world Austin signature zone',
    preserveMapboxDetail: true,
    material: { style: 'officeGlass', wall: '#b8d3d6', roof: '#344852', base: '#d9e3dc', window: '#dcffff', trim: '#f2f4ea' }
  },
  {
    name: 'Norwood Tower',
    center: [-97.7431, 30.2701],
    radiusMeters: 95,
    category: 'signatureHistoricOffice',
    source: 'Real-world Austin signature zone',
    material: { style: 'civicLimestone', wall: '#e7dbc8', roof: '#4c4f4d', base: '#c8bda8', window: '#f4fbf6', trim: '#a79f92' }
  },
  {
    name: 'JW Marriott Austin',
    center: [-97.7438, 30.2646],
    radiusMeters: 145,
    category: 'signatureHotel',
    source: 'Real-world Austin signature zone',
    material: { style: 'hotelStoneGlass', wall: '#decdb0', roof: '#4e4038', base: '#87b9b7', window: '#e5ffff', trim: '#f7edd8' }
  },
  {
    name: 'The Westin Austin Downtown',
    center: [-97.7402, 30.2664],
    radiusMeters: 115,
    category: 'signatureHotel',
    source: 'Real-world Austin signature zone',
    material: { style: 'hotelStoneGlass', wall: '#decdb0', roof: '#4e4038', base: '#87b9b7', window: '#e5ffff', trim: '#f7edd8' }
  },
  {
    name: 'Thompson Austin',
    center: [-97.7410, 30.2672],
    radiusMeters: 110,
    category: 'signatureHotel',
    source: 'Real-world Austin signature zone',
    material: { style: 'hotelStoneGlass', wall: '#decdb0', roof: '#4e4038', base: '#87b9b7', window: '#e5ffff', trim: '#f7edd8' }
  },
  {
    name: '700 Lavaca Parking',
    center: [-97.7445, 30.2701],
    radiusMeters: 95,
    category: 'signatureParking',
    source: 'Real-world Austin signature zone',
    material: { style: 'paleConcrete', wall: '#d5d1c8', roof: '#5c5f5b', base: '#bbb7ae', window: '#dceff2', trim: '#969890' }
  },
  {
    name: 'Mexic-Arte Museum',
    center: [-97.7424, 30.2665],
    radiusMeters: 85,
    category: 'signatureCivicRetail',
    source: 'Real-world Austin signature zone',
    material: { style: 'retailBrick', wall: '#c96548', roof: '#5a3d35', base: '#65adb1', window: '#a7f2ed', trim: '#f0dfc6' }
  },
  {
    name: 'Texas Toy Museum and Arcade',
    center: [-97.7442, 30.2671],
    radiusMeters: 85,
    category: 'signatureCivicRetail',
    source: 'Real-world Austin signature zone',
    material: { style: 'retailBrick', wall: '#c96548', roof: '#5a3d35', base: '#65adb1', window: '#a7f2ed', trim: '#f0dfc6' }
  },
  {
    name: 'O. Henry Hall',
    center: [-97.7426, 30.2642],
    radiusMeters: 90,
    category: 'signatureHistoricMasonry',
    source: 'Real-world Austin signature zone',
    material: { style: 'historicMasonry', wall: '#d7bea0', roof: '#4f4038', base: '#b58d6c', window: '#f5eadb', trim: '#7f5d48' }
  },
  {
    name: 'Aloft Austin Downtown',
    center: [-97.7415, 30.2670],
    radiusMeters: 95,
    category: 'signatureHotel',
    source: 'Real-world Austin signature zone',
    material: { style: 'hotelStoneGlass', wall: '#d9c8ab', roof: '#4b4540', base: '#7fb5b8', window: '#dfffff', trim: '#f4e8d1' }
  },
  {
    name: 'citizenM Austin Downtown',
    center: [-97.7444, 30.2654],
    radiusMeters: 95,
    category: 'signatureHotel',
    source: 'Real-world Austin signature zone',
    material: { style: 'hotelStoneGlass', wall: '#d8c7ac', roof: '#3f4548', base: '#7db0b7', window: '#d9ffff', trim: '#f3e8d4' }
  },
  {
    name: 'Sixth Street entertainment storefronts',
    center: [-97.7412, 30.2675],
    radiusMeters: 150,
    category: 'signatureEntertainmentRetail',
    source: 'Real-world Austin signature zone',
    material: { style: 'entertainmentStorefront', wall: '#b85b43', roof: '#4d352f', base: '#5eb4ad', window: '#b5fff3', trim: '#f1d6aa' }
  }
];
const austinDistrictContextZones = [
  {
    name: 'East Sixth entertainment storefront corridor',
    center: [-97.7397, 30.2672],
    radiusMeters: 430,
    category: 'storefront',
    material: { style: 'retailBrick', wall: '#c96548', roof: '#5a3d35', base: '#65adb1', window: '#a7f2ed', trim: '#f0dfc6' }
  },
  {
    name: 'Congress Avenue hotel and office corridor',
    center: [-97.7428, 30.2661],
    radiusMeters: 360,
    category: 'hotel',
    material: { style: 'hotelStoneGlass', wall: '#decdb0', roof: '#4e4038', base: '#87b9b7', window: '#e5ffff', trim: '#f7edd8' }
  },
  {
    name: 'Convention Center commercial district',
    center: [-97.7397, 30.2637],
    radiusMeters: 390,
    category: 'storefront',
    material: { style: 'storefrontWarm', wall: '#d8b58f', roof: '#4f4037', base: '#68b5b1', window: '#b9fff7', trim: '#f4e4c7' }
  },
  {
    name: 'Capitol civic district',
    center: [-97.7404, 30.2747],
    radiusMeters: 520,
    category: 'civic',
    material: { style: 'civicLimestone', wall: '#e7dbc8', roof: '#5d5f5b', base: '#cac0af', window: '#eff8f4', trim: '#a79f92' }
  },
  {
    name: 'Downtown tower district',
    center: [-97.7446, 30.2676],
    radiusMeters: 380,
    category: 'office',
    material: { style: 'officeGlass', wall: '#b8d3d6', roof: '#344852', base: '#7db6ba', window: '#dcffff', trim: '#f2f4ea' }
  }
];

function setSimArchitectureVisibility(visible) {
  if (!map) return;
  simArchitectureLayerIds.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  });
  styledMapboxArchitectureLayerIds.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  });
  facadeKitV2Manager?.setEnabled?.(visible && facadeKitV2Enabled);
  const replacementReady = visible
    && Number(window.__srMockRealTilesetFeatureCount || 0) > 0
    && Boolean(map.getLayer?.(realBuildingTilesetConfig.baseLayerId));
  if (replacementReady) hideOriginalBuildingExtrusions();
  if (!replacementReady) restoreOriginalBuildingExtrusions();
  document.body.dataset.mockReplacementHandoff = replacementReady ? 'replacement-ready' : 'native-buildings-visible';
}

function publishSimArchitectureMountState() {
  if (!map) return [];
  const mounted = simArchitectureLayerIds.filter((id) => map.getLayer?.(id));
  window.__srMockMountedSimArchitectureLayers = mounted;
  auditMockReplacementRule();
  const renderOff = document.body.classList.contains('render-off');
  if (renderOff) {
    window.__srMockSkinMode = 'mapbox-standard-base';
  } else if (map.getSource?.('src-mock-osm-buildings') && mounted.length) {
    window.__srMockSkinMode = 'osm-footprint-detail-trim-no-double';
  } else if (mounted.length) {
    window.__srMockSkinMode = 'custom-building-source-skin-no-double';
  }
  updateSkinReadout();
  return mounted;
}

function hasAllowedFootprintSource() {
  try {
    return !!map?.getSource?.('src-mock-osm-buildings') && Number(window.__srMockOsmBuildingCount || 0) > 0;
  } catch {
    return false;
  }
}

function getPublishReviewGate(audit = window.__srMockNoDoubleLayerAudit || {}) {
  const mountedLayers = window.__srMockMountedSimArchitectureLayers?.length || 0;
  const visibleTileFeatures = Number(window.__srMockRealTilesetFeatureCount || 0);
  const colorStats = currentColorProfileStats();
  const colorSample = Number(colorStats.sample || 0);
  const coverageStats = window.__srMockOptimizedSkinCoverageStats || {};
  const structureOnly = realBuildingTilesetConfig.presentationMode === 'facade-kit-structure-only';
  const minimumPurposeLayers = structureOnly ? 1 : 4;
  const vectorSkinMounted = Boolean(window.__srMockRealTilesetLayersMounted) && mountedLayers >= minimumPurposeLayers;
  const coverageLevel = Number(window.__srMockOptimizedSkinCoverageLevel || optimizedSkinCoverageLevel || 0);
  const tileRefsReady = visibleTileFeatures > 0 || (vectorSkinMounted && coverageLevel > 0);
  const materialStatsReady = colorSample > 0 || Boolean(coverageStats.visualPolish?.materialColor);
  const protectedZoneCount = Number(window.__srMockVectorProtectedZoneCount || 0);
  const liveProtectionCount = Number(window.__srMockDynamicDetailedProtectionCount || 0);
  const requiredProtectionCount = Math.max(6, Math.min(7, protectedAustinLandmarkZones.length || 7));
  const performanceBudget = window.__srMockPerformanceBudget || {};
  const performanceReady = performanceBudget.gate?.ready !== false;
  const facadeReady = Boolean(facadeKitV2Status.ready) && !facadeKitV2Status.error;
  const blockers = [...(audit.blockers || [])];
  if (mountedLayers < minimumPurposeLayers) blockers.push('purpose layers warming');
  if (!tileRefsReady) blockers.push('tile refs pending');
  if (!materialStatsReady) blockers.push('material stats pending');
  if (Math.max(protectedZoneCount, liveProtectionCount) < requiredProtectionCount) blockers.push('protection audit pending');
  if ((window.__srMockLayerInstallErrors || []).length) blockers.push('layer errors');
  if (!facadeReady) blockers.push('facade kit pending');
  if (!performanceReady) blockers.push(...(performanceBudget.gate?.blockers || ['performance budget review']));
  if (!audit.publishReady) blockers.push('replacement audit pending');
  const uniqueBlockers = [...new Set(blockers)];
  return {
    ready: uniqueBlockers.length === 0,
    blockers: uniqueBlockers,
    checklist: {
      layers: mountedLayers >= minimumPurposeLayers,
      tileRefs: tileRefsReady,
      materialStats: materialStatsReady,
      protectedBuildings: Math.max(protectedZoneCount, liveProtectionCount) >= requiredProtectionCount,
      noLayerErrors: !(window.__srMockLayerInstallErrors || []).length,
      facadeKit: facadeReady,
      performance: performanceReady,
      replacementClean: Boolean(audit.publishReady)
    },
    mountedLayers,
    visibleTileFeatures,
    colorStats,
    coverageStats,
    tileRefsReady,
    materialStatsReady,
    protectedZones: protectedZoneCount,
    liveProtectionCount,
    performanceBudget
  };
}

function formatPublishChecklist(checklist = {}) {
  const item = (ready, label) => `${ready ? 'OK' : 'Wait'} ${label}`;
  return [
    item(checklist.layers, 'layers'),
    item(checklist.tileRefs, 'tiles'),
    item(checklist.materialStats, 'colors'),
    item(checklist.protectedBuildings, 'safe'),
    item(checklist.facadeKit, 'facade'),
    item(checklist.performance, 'speed'),
    item(checklist.replacementClean, 'clean')
  ].join(' | ');
}

function getCurrentPublishReport() {
  const audit = window.__srMockNoDoubleLayerAudit || {};
  const snapshot = window.__srMockProductionReview || publishProductionReviewSnapshot(audit);
  return {
    ...snapshot,
    optimize: window.__srMockLastOptimizeReport || null,
    checklistText: formatPublishChecklist(snapshot.checklist || {}),
    directive: window.__srMockOptimizeDirective
  };
}

window.__srMockGetPublishReport = getCurrentPublishReport;

function publishProductionReviewSnapshot(audit = window.__srMockNoDoubleLayerAudit || {}) {
  const gate = getPublishReviewGate(audit);
  const mountedLayers = gate.mountedLayers;
  const forbiddenCount = (audit.forbiddenLayers?.length || 0) + (audit.forbiddenSources?.length || 0) + (audit.lineLayers?.length || 0);
  const publishReady = gate.ready;
  const colorStats = gate.colorStats;
  window.__srMockProductionReview = {
    status: publishReady ? 'ready-for-human-review' : 'blocked',
    mockOnly: true,
    realGoLiveTouched: false,
    mapFoundation: 'Mapbox Austin Standard base',
    rendererBoundary: 'Mapbox-native mock skin only; no production Go Live change',
    source: realBuildingTilesetConfig.url,
    sourceLayer: realBuildingTilesetConfig.sourceLayer,
    mountedSkinLayers: mountedLayers,
    visibleTileFeatures: gate.visibleTileFeatures,
    colorProfileMode: colorStats.mode,
    realContextColorMatches: colorStats.realMatched,
    fallbackColorProfiles: colorStats.fallback,
    topColorProfiles: colorStats.topProfiles,
    protectedZones: gate.protectedZones,
    liveDetailedAudit: gate.liveProtectionCount,
    replacementRuleClean: forbiddenCount === 0 && !audit.floatingMeshLayer,
    layerErrors: window.__srMockLayerInstallErrors || [],
    blockers: gate.blockers,
    checklist: gate.checklist,
    next: publishReady ? 'Production review package' : `Resolve: ${gate.blockers.slice(0, 2).join(', ') || 'publish-readiness audit'}`,
    approval: publishReady
      ? 'Approval needed: review visual quality, then decide whether to package this mock skin for real Go Live.'
      : 'Approval blocked until publish-readiness audit is clean.',
    checkedAt: new Date().toISOString()
  };
  window.__srMockGetPublishReport = getCurrentPublishReport;
  document.body.dataset.mockPublishChecklist = formatPublishChecklist(gate.checklist);
  document.body.dataset.mockProductionReviewSummary = `${window.__srMockProductionReview.status}: ${window.__srMockProductionReview.next}`;
  return window.__srMockProductionReview;
}

function auditMockReplacementRule() {
  const audit = {
    replacementRule: window.__srMockReplacementRule || '',
    activeLayers: [],
    activeSources: [],
    forbiddenLayers: [],
    forbiddenSources: [],
    lineLayers: [],
    floatingMeshLayer: false,
    publishReady: false,
    blockers: [],
    checkedAt: Date.now()
  };
  try {
    if (!map?.getStyle) return audit;
    const style = map.getStyle() || {};
    const layers = style.layers || [];
    const sources = Object.keys(style.sources || {});
    audit.activeLayers = simArchitectureLayerIds.filter((id) => map.getLayer?.(id));
    audit.activeSources = activeMockArchitectureSourceIds.filter((id) => map.getSource?.(id));
    audit.forbiddenLayers = layers
      .filter((layer) => /^src-mock-/.test(layer.id || ''))
      .filter((layer) => deprecatedMockArchitectureLayerIds.includes(layer.id))
      .map((layer) => layer.id);
    audit.lineLayers = layers
      .filter((layer) => /^src-mock-/.test(layer.id || '') && layer.type === 'line')
      .map((layer) => layer.id);
    audit.forbiddenSources = sources
      .filter((sourceId) => /^src-mock-/.test(sourceId))
      .filter((sourceId) => deprecatedMockArchitectureSourceIds.includes(sourceId));
    audit.floatingMeshLayer = false;
    if (audit.forbiddenLayers.length) audit.blockers.push(`${audit.forbiddenLayers.length} stale layers`);
    if (audit.forbiddenSources.length) audit.blockers.push(`${audit.forbiddenSources.length} stale sources`);
    if (audit.lineLayers.length) audit.blockers.push(`${audit.lineLayers.length} line/detail layers`);
    if (audit.floatingMeshLayer) audit.blockers.push('floating mesh layer');
    if ((window.__srMockLayerInstallErrors || []).length) audit.blockers.push(`${(window.__srMockLayerInstallErrors || []).length} layer errors`);
    if (!window.__srMockRealTilesetLayersMounted) audit.blockers.push('real tileset not mounted');
    const minimumPurposeLayers = realBuildingTilesetConfig.presentationMode === 'facade-kit-structure-only' ? 1 : 4;
    if ((window.__srMockMountedSimArchitectureLayers || []).length < minimumPurposeLayers) audit.blockers.push('purpose-layer coverage incomplete');
    const protectedZoneCount = Number(window.__srMockVectorProtectedZoneCount || 0);
    const liveProtectionCount = Number(window.__srMockDynamicDetailedProtectionCount || 0);
    const requiredProtectionCount = Math.max(6, Math.min(7, protectedAustinLandmarkZones.length || 7));
    if (Math.max(protectedZoneCount, liveProtectionCount) < requiredProtectionCount) audit.blockers.push('detailed-building audit incomplete');
    audit.publishReady = audit.blockers.length === 0;
  } catch (error) {
    audit.error = String(error?.message || error);
    audit.blockers.push('audit error');
  }
  window.__srMockNoDoubleLayerAudit = audit;
  publishProductionReviewSnapshot(audit);
  return audit;
}

function getSimArchitecturePaint() {
  const height = ['coalesce', ['get', 'height'], 12];
  const base = ['coalesce', ['get', 'min_height'], 0];
  const simWallColor = [
    'interpolate', ['linear'], height,
    0, '#d8c8a4',
    14, '#e8d8b9',
    28, '#cfa27f',
    48, '#9fb9be',
    86, '#79a8bd',
    140, '#d8e7dc'
  ];
  const simRoofColor = [
    'interpolate', ['linear'], height,
    0, '#2b333a',
    20, '#b94c29',
    48, '#23a8a0',
    90, '#394552',
    140, '#dce9de'
  ];
  return { height, base, simWallColor, simRoofColor };
}

function setPaintSafe(layerId, property, value) {
  try {
    map.setPaintProperty(layerId, property, value);
    return true;
  } catch {
    return false;
  }
}

function setLayerZoomRangeSafe(layerId, minzoom, maxzoom = 22) {
  try {
    if (!map?.setLayerZoomRange || !map?.getLayer?.(layerId)) return false;
    map.setLayerZoomRange(layerId, minzoom, maxzoom);
    return true;
  } catch {
    return false;
  }
}

function realBuildingSkinLayerIds() {
  if (realBuildingTilesetConfig.presentationMode === 'facade-kit-structure-only') {
    return [realBuildingTilesetConfig.dataLayerId, 'src-mock-facade-kit-v2'];
  }
  return [
    realBuildingTilesetConfig.baseLayerId,
    realBuildingTilesetConfig.entryRevealLayerId,
    realBuildingTilesetConfig.streetGlassLayerId,
    realBuildingTilesetConfig.parkingBandLayerId
  ];
}

function redundantRealBuildingSkinLayerIds() {
  return [
    realBuildingTilesetConfig.storefrontCanopyLayerId,
    realBuildingTilesetConfig.parkingUpperBandLayerId,
    realBuildingTilesetConfig.paleRoofDeckLayerId,
    realBuildingTilesetConfig.glassAccentLayerId,
    realBuildingTilesetConfig.facadeAccentLayerId,
    realBuildingTilesetConfig.upperTrimLayerId,
    realBuildingTilesetConfig.roofLayerId
  ];
}

function enforceDisciplinedSkinLayerBudget() {
  if (realBuildingTilesetConfig.presentationMode === 'facade-kit-structure-only') {
    enforceMapboxFoundationPresentation();
    const facadeMounted = Boolean(map?.getLayer?.('src-mock-facade-kit-v2'));
    window.__srMockLayerDiscipline = {
      primaryReplacementVolumes: 0,
      activePurposeLayers: facadeMounted ? 1 : 0,
      removedRepeatedBands: publishedBuildingPresentationLayerIds().length,
      policy: 'Mapbox native buildings plus shallow Facade Kit V2 structural modules'
    };
    return window.__srMockLayerDiscipline.activePurposeLayers;
  }
  redundantRealBuildingSkinLayerIds().forEach(removeMockLayerIfPresent);
  window.__srMockLayerDiscipline = {
    primaryReplacementVolumes: 1,
    activePurposeLayers: realBuildingSkinLayerIds().filter((layerId) => map?.getLayer?.(layerId)).length,
    removedRepeatedBands: redundantRealBuildingSkinLayerIds().length,
    policy: 'one primary volume plus shallow entry, street-glass, or parking detail'
  };
  return window.__srMockLayerDiscipline.activePurposeLayers;
}

function optimizedMaterialWallColorExpression(level = optimizedSkinCoverageLevel) {
  const polishLevel = Math.max(0, Math.min(5, Number(level || 0)));
  const lift = polishLevel >= 3;
  return [
    'match',
    ['get', 'material'],
    'brick', lift ? '#a7553c' : '#a95f46',
    'residentialBrick', lift ? '#a86145' : '#a7654a',
    'retailBrick', lift ? '#b65338' : '#b15a3d',
    'softTerracotta', lift ? '#c46947' : '#bd6848',
    'warmWood', lift ? '#8d6848' : '#87684c',
    'storefrontWarm', lift ? '#86beb9' : '#92bcb8',
    'parkingGarage', lift ? '#716e66' : '#7c756c',
    'officeGlass', lift ? '#72aebe' : '#7caab5',
    'midriseGlass', lift ? '#89b9c0' : '#91b4b9',
    'creamGlass', lift ? '#b9d6cb' : '#c7d8ca',
    'steelStone', lift ? '#8f9fa1' : '#91a0a2',
    'hotelStoneGlass', lift ? '#c7b48d' : '#c9b895',
    'limestone', lift ? '#d2ba88' : '#d6bf91',
    'tanStone', lift ? '#c2955b' : '#c39d62',
    'paleConcrete', lift ? '#c1bdb3' : '#c7c2b8',
    'entertainmentStorefront', lift ? '#95beb8' : '#9fc5bd',
    ['coalesce', ['get', 'baseColor'], lift ? '#c1aa7c' : '#bda77f']
  ];
}

function optimizedGlassColorExpression(level = optimizedSkinCoverageLevel) {
  const polishLevel = Math.max(0, Math.min(5, Number(level || 0)));
  const bright = polishLevel >= 2;
  return [
    'match',
    ['get', 'material'],
    'retailBrick', bright ? '#6fc9c5' : '#74c2bd',
    'storefrontWarm', bright ? '#66d0ca' : '#70c9c3',
    'hotelStoneGlass', bright ? '#87cbd4' : '#8ccbd3',
    'entertainmentStorefront', bright ? '#62cec6' : '#6cc6bf',
    'officeGlass', bright ? '#58bdd2' : '#64b9ca',
    'midriseGlass', bright ? '#70c3cc' : '#79bdc6',
    'creamGlass', bright ? '#8fd4cf' : '#94cbc5',
    'steelStone', bright ? '#7eb8c0' : '#83b3bb',
    'limestone', bright ? '#dce6dd' : '#d9e4dc',
    'tanStone', bright ? '#d9bd86' : '#d8bd89',
    'paleConcrete', bright ? '#d9d9d1' : '#d8d9d3',
    ['coalesce', ['get', 'windowColor'], bright ? '#78d7d2' : '#86d3cf']
  ];
}

function optimizedTrimColorExpression(level = optimizedSkinCoverageLevel) {
  const polishLevel = Math.max(0, Math.min(5, Number(level || 0)));
  const crisp = polishLevel >= 2;
  return [
    'match',
    ['get', 'material'],
    'retailBrick', crisp ? '#c57a42' : '#c9874b',
    'storefrontWarm', crisp ? '#d3a154' : '#d6a95c',
    'hotelStoneGlass', crisp ? '#d0b47d' : '#d5bd89',
    'entertainmentStorefront', crisp ? '#c98240' : '#cf904b',
    'officeGlass', crisp ? '#bfd9d6' : '#c6d5d2',
    'midriseGlass', crisp ? '#aaccc9' : '#b0c9c6',
    'steelStone', crisp ? '#a3b5b4' : '#aab7b5',
    'limestone', crisp ? '#c09e67' : '#c6aa75',
    'tanStone', crisp ? '#a7743c' : '#ad8045',
    'paleConcrete', crisp ? '#b6b0a4' : '#bcb6aa',
    ['coalesce', ['get', 'trimColor'], crisp ? '#d4b36e' : '#dbc07e']
  ];
}

function optimizedRoofColorExpression(level = optimizedSkinCoverageLevel) {
  const polishLevel = Math.max(0, Math.min(5, Number(level || 0)));
  const grounded = polishLevel >= 2;
  return [
    'match',
    ['get', 'material'],
    'brick', grounded ? '#53372d' : '#5f4034',
    'residentialBrick', grounded ? '#573a2f' : '#624336',
    'retailBrick', grounded ? '#5c352a' : '#693e32',
    'softTerracotta', grounded ? '#79432f' : '#814831',
    'warmWood', grounded ? '#503d2f' : '#594332',
    'parkingGarage', grounded ? '#3d3c37' : '#44423c',
    'officeGlass', grounded ? '#557681' : '#607c84',
    'midriseGlass', grounded ? '#67878d' : '#708c91',
    'steelStone', grounded ? '#647478' : '#6d7b7e',
    'limestone', grounded ? '#a4895c' : '#aa9064',
    'tanStone', grounded ? '#846239' : '#8d6b42',
    'paleConcrete', grounded ? '#99968d' : '#a4a197',
    ['coalesce', ['get', 'roofColor'], grounded ? '#5f594f' : '#6a6257']
  ];
}

function optimizedStructureGeometry(level = optimizedSkinCoverageLevel) {
  const polishLevel = Math.max(0, Math.min(5, Number(level || 0)));
  const step = polishLevel * 0.34;
  return {
    entryHeight: 1.45 + step,
    glassBase: 1.2 + (polishLevel * 0.08),
    glassHeight: 3.45 + (polishLevel * 0.48),
    canopyBase: 2.95 + (polishLevel * 0.08),
    canopyHeight: 4.05 + (polishLevel * 0.36),
    facadeLowBase: 0.5,
    facadeLowHeight: 4.15 + (polishLevel * 0.42),
    facadeTallBase: 1.15 + (polishLevel * 0.1),
    facadeTallHeight: 6.45 + (polishLevel * 0.58),
    glassAccentBase: 4.6 + (polishLevel * 0.14),
    glassAccentHeight: 7.65 + (polishLevel * 0.72),
    upperTrimBase: 7.8 + (polishLevel * 0.24),
    upperTrimHeight: 8.75 + (polishLevel * 0.28),
    roofLift: 0.7 + (polishLevel * 0.1)
  };
}

function applyOptimizedSkinCoverageTuning(level = optimizedSkinCoverageLevel) {
  if (!map?.getLayer) return 0;
  const coverageLevel = Math.max(0, Math.min(5, Number(level || 0)));
  optimizedSkinCoverageLevel = coverageLevel;
  window.__srMockOptimizedSkinCoverageLevel = coverageLevel;
  const minzoom = Math.max(11.8, 12.45 - (coverageLevel * 0.13));
  const mounted = realBuildingSkinLayerIds().filter((layerId) => map.getLayer(layerId));
  if (realBuildingTilesetConfig.presentationMode === 'facade-kit-structure-only') {
    enforceDisciplinedSkinLayerBudget();
    window.__srMockOptimizedSkinCoverageStats = {
      level: coverageLevel,
      mountedLayers: mounted.length,
      minzoom,
      visualPolish: {
        materialColor: 'Mapbox originals preserved',
        glass: 'discrete facade windows on plain buildings',
        storefronts: 'shallow doors, storefront frames, and canopies',
        depth: 'shared Mapbox depth buffer; no opaque replacement shell',
        structures: 'Facade Kit V2 footprint-edge architecture only'
      },
      structureGeometry: optimizedStructureGeometry(coverageLevel),
      direction: 'north/east/south/west footprint-aligned architecture coverage',
      protectedDetailedBuildings: window.__srMockDynamicDetailedProtectionCount || window.__srMockVectorProtectedZoneCount || 0
    };
    return mounted.length;
  }
  setLayerZoomRangeSafe(realBuildingTilesetConfig.baseLayerId, minzoom, 22);
  setLayerZoomRangeSafe(realBuildingTilesetConfig.entryRevealLayerId, 15.25, 22);
  setLayerZoomRangeSafe(realBuildingTilesetConfig.streetGlassLayerId, 14.7, 22);
  setLayerZoomRangeSafe(realBuildingTilesetConfig.parkingBandLayerId, 14.5, 22);
  const occlusionBoost = Math.min(0.025, coverageLevel * 0.005);
  const structure = optimizedStructureGeometry(coverageLevel);
  setPaintSafe(realBuildingTilesetConfig.baseLayerId, 'fill-extrusion-opacity', 0.92);
  setPaintSafe(
    realBuildingTilesetConfig.baseLayerId,
    'fill-extrusion-height',
    ['coalesce', ['get', 'height'], 9.5]
  );
  setPaintSafe(realBuildingTilesetConfig.entryRevealLayerId, 'fill-extrusion-opacity', 0.82);
  setPaintSafe(realBuildingTilesetConfig.streetGlassLayerId, 'fill-extrusion-opacity', 0.86);
  setPaintSafe(realBuildingTilesetConfig.parkingBandLayerId, 'fill-extrusion-opacity', 0.9);
  setPaintSafe(realBuildingTilesetConfig.baseLayerId, 'fill-extrusion-color', optimizedMaterialWallColorExpression(coverageLevel));
  setPaintSafe(realBuildingTilesetConfig.streetGlassLayerId, 'fill-extrusion-color', optimizedGlassColorExpression(coverageLevel));
  setPaintSafe(realBuildingTilesetConfig.baseLayerId, 'fill-extrusion-ambient-occlusion-intensity', 0.16 + occlusionBoost);
  setPaintSafe(realBuildingTilesetConfig.baseLayerId, 'fill-extrusion-ambient-occlusion-radius', 2.2);
  setPaintSafe(realBuildingTilesetConfig.streetGlassLayerId, 'fill-extrusion-ambient-occlusion-intensity', 0.08 + (occlusionBoost * 0.7));
  setPaintSafe(realBuildingTilesetConfig.entryRevealLayerId, 'fill-extrusion-height', structure.entryHeight);
  setPaintSafe(realBuildingTilesetConfig.streetGlassLayerId, 'fill-extrusion-base', structure.glassBase);
  setPaintSafe(realBuildingTilesetConfig.streetGlassLayerId, 'fill-extrusion-height', structure.glassHeight);
  enforceDisciplinedSkinLayerBudget();
  window.__srMockOptimizedSkinCoverageStats = {
    level: coverageLevel,
    mountedLayers: mounted.length,
    minzoom,
    visualPolish: {
      materialColor: 'real-context tuned',
      glass: 'clearer blue glass bands',
      storefronts: 'close-range street glass and recessed entry treatment',
      depth: `controlled ambient occlusion +${occlusionBoost.toFixed(3)}`,
      structures: 'one replacement volume plus purpose-specific shallow details'
    },
    structureGeometry: structure,
    direction: 'north/east/south/west footprint-aligned architecture coverage',
    protectedDetailedBuildings: window.__srMockDynamicDetailedProtectionCount || window.__srMockVectorProtectedZoneCount || 0
  };
  return mounted.length;
}

function setConfigSafe(property, value) {
  try {
    if (!map?.setConfigProperty) return false;
    map.setConfigProperty('basemap', property, value);
    return true;
  } catch {
    return false;
  }
}

function installRealBuildingTilesetSource() {
  if (!map?.addSource || !realBuildingTilesetConfig.enabled) {
    window.__srMockRealTilesetStatus = 'disabled';
    return false;
  }
  try {
    window.__srMockMap = map;
    window.__srMockMapboxMap = map;
    removeDisabledRoofOverlays();
    if (!map.getSource(realBuildingTilesetConfig.sourceId)) {
      map.addSource(realBuildingTilesetConfig.sourceId, {
        type: 'vector',
        url: realBuildingTilesetConfig.url
      });
    }
    if (!map.getSource(realBuildingTilesetConfig.sourceId)) {
      throw new Error('source did not register after addSource');
    }
    window.__srMockRealTilesetStatus = `configured ${realBuildingTilesetConfig.url} / ${realBuildingTilesetConfig.sourceLayer}`;
    if (
      window.__srMockRealTilesetLayersMounted
      && realBuildingTilesetConfig.presentationMode === 'facade-kit-structure-only'
      && map.getLayer?.(realBuildingTilesetConfig.dataLayerId)
    ) {
      enforceMapboxFoundationPresentation();
      return true;
    }
    if (window.__srMockRealTilesetLayersMounted && map.getLayer?.(realBuildingTilesetConfig.baseLayerId)) {
      applyVectorSkinProtectionFilters();
      return true;
    }
    installRealBuildingTilesetLayers();
    return true;
  } catch (error) {
    window.__srMockRealTilesetStatus = `unavailable: ${error?.message || error}`;
    return false;
  }
}

function installRealBuildingTilesetLayers() {
  if (!map?.getSource?.(realBuildingTilesetConfig.sourceId) || !realBuildingTilesetConfig.enabled) return false;
  try {
    updateDynamicDetailedMapboxProtections(true);
    if (realBuildingTilesetConfig.presentationMode === 'facade-kit-structure-only') {
      enforceMapboxFoundationPresentation();
      if (!map.getLayer?.(realBuildingTilesetConfig.dataLayerId)) {
        addMapLayerSafe({
          id: realBuildingTilesetConfig.dataLayerId,
          type: 'fill',
          source: realBuildingTilesetConfig.sourceId,
          'source-layer': realBuildingTilesetConfig.sourceLayer,
          minzoom: 11.8,
          maxzoom: 22,
          slot: 'bottom',
          paint: {
            'fill-color': '#000000',
            'fill-opacity': 0,
            'fill-antialias': false
          }
        });
      }
      window.__srMockRealTilesetLayersMounted = true;
      window.__srMockSkinMode = 'mapbox-standard-facade-kit-v2';
      window.__srMockRealTilesetStatus = `source active for Facade Kit structures: ${realBuildingTilesetConfig.url} / ${realBuildingTilesetConfig.sourceLayer}`;
      refreshRealBuildingTilesetStats();
      auditMockReplacementRule();
      updateSkinReadout();
      return true;
    }
    const plainCandidateFilter = vectorSkinPlainCandidateFilter();
    removeMockLayerIfPresent(realBuildingTilesetConfig.volumeLayerId);
    addMapLayerSafe({
      id: realBuildingTilesetConfig.clipLayerId,
      type: 'clip',
      source: realBuildingTilesetConfig.sourceId,
      'source-layer': realBuildingTilesetConfig.sourceLayer,
      minzoom: 12.25,
      filter: plainCandidateFilter,
      layout: {
        'clip-layer-scope': ['basemap'],
        'clip-layer-types': ['model']
      }
    });
    addMapLayerSafe({
      id: realBuildingTilesetConfig.baseLayerId,
      type: 'fill-extrusion',
      source: realBuildingTilesetConfig.sourceId,
      'source-layer': realBuildingTilesetConfig.sourceLayer,
      minzoom: 12.25,
      filter: [
        'all',
        plainCandidateFilter,
        ['>=', ['coalesce', ['get', 'height'], 0], 2],
        ['<', ['coalesce', ['get', 'height'], 0], 220]
      ],
      paint: {
        'fill-extrusion-base': 0,
        // Facade Kit uses this same source height. Capping the replacement body
        // at 9.5 m left upper window panels suspended above the wall volume.
        'fill-extrusion-height': ['coalesce', ['get', 'height'], 9.5],
        'fill-extrusion-color': [
          'match',
          ['get', 'material'],
          'brick', '#a95f46',
          'residentialBrick', '#a7654a',
          'retailBrick', '#b15a3d',
          'softTerracotta', '#bd6848',
          'warmWood', '#87684c',
          'storefrontWarm', '#92bcb8',
          'parkingGarage', '#7c756c',
          'officeGlass', '#7caab5',
          'midriseGlass', '#91b4b9',
          'steelStone', '#91a0a2',
          'hotelStoneGlass', '#c9b895',
          'limestone', '#d6bf91',
          'tanStone', '#c39d62',
          'paleConcrete', '#c7c2b8',
          ['coalesce', ['get', 'baseColor'], '#bda77f']
        ],
        'fill-extrusion-opacity': 0.93,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.07,
        'fill-extrusion-ambient-occlusion-radius': 1.15
      }
    });
    addMapLayerSafe({
      id: realBuildingTilesetConfig.entryRevealLayerId,
      type: 'fill-extrusion',
      source: realBuildingTilesetConfig.sourceId,
      'source-layer': realBuildingTilesetConfig.sourceLayer,
      minzoom: 12.55,
      filter: [
        'all',
        plainCandidateFilter,
        ['>=', ['coalesce', ['get', 'height'], 0], 3],
        [
          'any',
          ['==', ['get', 'category'], 'storefront'],
          ['==', ['get', 'category'], 'parking'],
          ['==', ['get', 'category'], 'building'],
          ['==', ['get', 'category'], 'office'],
          ['==', ['get', 'category'], 'hotel'],
          ['==', ['get', 'category'], 'residential'],
          ['==', ['get', 'partRole'], 'podium'],
          ['==', ['get', 'material'], 'storefrontWarm'],
          ['==', ['get', 'material'], 'parkingGarage'],
          ['==', ['get', 'material'], 'officeGlass'],
          ['==', ['get', 'material'], 'midriseGlass'],
          ['==', ['get', 'material'], 'steelStone'],
          ['==', ['get', 'material'], 'hotelStoneGlass'],
          ['==', ['get', 'material'], 'retailBrick'],
          ['==', ['get', 'material'], 'brick'],
          ['==', ['get', 'material'], 'warmWood'],
          ['==', ['get', 'material'], 'limestone'],
          ['==', ['get', 'material'], 'tanStone'],
          ['==', ['get', 'material'], 'paleConcrete']
        ]
      ],
      paint: {
        'fill-extrusion-base': 0.15,
        'fill-extrusion-height': 1.45,
        'fill-extrusion-color': [
          'match',
          ['get', 'material'],
          'storefrontWarm', '#1e5359',
          'parkingGarage', '#20221f',
          'retailBrick', '#743a2b',
          'brick', '#6b392d',
          'warmWood', '#4f3828',
          'limestone', '#806e50',
          'tanStone', '#755a37',
          'paleConcrete', '#666660',
          '#332f2a'
        ],
        'fill-extrusion-opacity': 0.94,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.05,
        'fill-extrusion-ambient-occlusion-radius': 0.75
      }
    });
    addMapLayerSafe({
      id: realBuildingTilesetConfig.streetGlassLayerId,
      type: 'fill-extrusion',
      source: realBuildingTilesetConfig.sourceId,
      'source-layer': realBuildingTilesetConfig.sourceLayer,
      minzoom: 12.5,
      filter: [
        'all',
        plainCandidateFilter,
        ['>=', ['coalesce', ['get', 'height'], 0], 4],
        [
          'any',
          ['==', ['get', 'category'], 'storefront'],
          ['==', ['get', 'category'], 'hotel'],
          ['==', ['get', 'category'], 'office'],
          ['==', ['get', 'category'], 'building'],
          ['==', ['get', 'partRole'], 'podium'],
          ['==', ['get', 'material'], 'storefrontWarm'],
          ['==', ['get', 'material'], 'retailBrick'],
          ['==', ['get', 'material'], 'hotelStoneGlass'],
          ['==', ['get', 'material'], 'entertainmentStorefront'],
          ['==', ['get', 'material'], 'officeGlass'],
          ['==', ['get', 'material'], 'midriseGlass'],
          ['==', ['get', 'material'], 'steelStone'],
          ['==', ['get', 'material'], 'limestone'],
          ['==', ['get', 'material'], 'tanStone'],
          ['==', ['get', 'material'], 'paleConcrete']
        ]
      ],
      paint: {
        'fill-extrusion-base': 1.35,
        'fill-extrusion-height': 3.45,
        'fill-extrusion-color': [
          'match',
          ['get', 'material'],
          'retailBrick', '#74c2bd',
          'storefrontWarm', '#70c9c3',
          'hotelStoneGlass', '#8ccbd3',
          'entertainmentStorefront', '#6cc6bf',
          'officeGlass', '#64b9ca',
          'midriseGlass', '#79bdc6',
          'steelStone', '#83b3bb',
          'limestone', '#d9e4dc',
          'tanStone', '#d8bd89',
          'paleConcrete', '#d8d9d3',
          [
            'coalesce',
            ['get', 'windowColor'],
            '#86d3cf'
          ]
        ],
        'fill-extrusion-opacity': 0.84,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.04,
        'fill-extrusion-ambient-occlusion-radius': 0.7
      }
    });
    addMapLayerSafe({
      id: realBuildingTilesetConfig.storefrontCanopyLayerId,
      type: 'fill-extrusion',
      source: realBuildingTilesetConfig.sourceId,
      'source-layer': realBuildingTilesetConfig.sourceLayer,
      minzoom: 12.65,
      filter: [
        'all',
        plainCandidateFilter,
        ['>=', ['coalesce', ['get', 'height'], 0], 4],
        [
          'any',
          ['==', ['get', 'category'], 'storefront'],
          ['==', ['get', 'category'], 'hotel'],
          ['==', ['get', 'category'], 'office'],
          ['==', ['get', 'partRole'], 'podium'],
          ['==', ['get', 'material'], 'storefrontWarm'],
          ['==', ['get', 'material'], 'retailBrick'],
          ['==', ['get', 'material'], 'hotelStoneGlass'],
          ['==', ['get', 'material'], 'entertainmentStorefront'],
          ['==', ['get', 'material'], 'officeGlass'],
          ['==', ['get', 'material'], 'midriseGlass'],
          ['==', ['get', 'material'], 'steelStone'],
          ['==', ['get', 'material'], 'limestone'],
          ['==', ['get', 'material'], 'tanStone'],
          ['==', ['get', 'material'], 'paleConcrete']
        ]
      ],
      paint: {
        'fill-extrusion-base': 3,
        'fill-extrusion-height': 4.05,
        'fill-extrusion-color': [
          'match',
          ['get', 'material'],
          'retailBrick', '#c9874b',
          'storefrontWarm', '#d6a95c',
          'hotelStoneGlass', '#d5bd89',
          'entertainmentStorefront', '#cf904b',
          'officeGlass', '#c6d5d2',
          'midriseGlass', '#b0c9c6',
          'steelStone', '#aab7b5',
          'limestone', '#c6aa75',
          'tanStone', '#ad8045',
          'paleConcrete', '#bcb6aa',
          [
            'coalesce',
            ['get', 'trimColor'],
            '#dbc07e'
          ]
        ],
        'fill-extrusion-opacity': 0.89,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.045,
        'fill-extrusion-ambient-occlusion-radius': 0.65
      }
    });
    addMapLayerSafe({
      id: realBuildingTilesetConfig.parkingBandLayerId,
      type: 'fill-extrusion',
      source: realBuildingTilesetConfig.sourceId,
      'source-layer': realBuildingTilesetConfig.sourceLayer,
      minzoom: 12.55,
      filter: [
        'all',
        plainCandidateFilter,
        [
          'any',
          ['==', ['get', 'category'], 'parking'],
          ['==', ['get', 'material'], 'parkingGarage']
        ],
        ['>=', ['coalesce', ['get', 'height'], 0], 9]
      ],
      paint: {
        'fill-extrusion-base': [
          'case',
          ['<', ['coalesce', ['get', 'height'], 10], 20],
          3,
          6.2
        ],
        'fill-extrusion-height': [
          'case',
          ['<', ['coalesce', ['get', 'height'], 10], 20],
          4.55,
          8.15
        ],
        'fill-extrusion-color': '#1f231f',
        'fill-extrusion-opacity': 0.95,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.04,
        'fill-extrusion-ambient-occlusion-radius': 0.8
      }
    });
    addMapLayerSafe({
      id: realBuildingTilesetConfig.parkingUpperBandLayerId,
      type: 'fill-extrusion',
      source: realBuildingTilesetConfig.sourceId,
      'source-layer': realBuildingTilesetConfig.sourceLayer,
      minzoom: 12.65,
      filter: [
        'all',
        plainCandidateFilter,
        [
          'any',
          ['==', ['get', 'category'], 'parking'],
          ['==', ['get', 'material'], 'parkingGarage']
        ],
        ['>=', ['coalesce', ['get', 'height'], 0], 18]
      ],
      paint: {
        'fill-extrusion-base': 10.8,
        'fill-extrusion-height': 11.7,
        'fill-extrusion-color': '#121614',
        'fill-extrusion-opacity': 0.9,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.04,
        'fill-extrusion-ambient-occlusion-radius': 0.8
      }
    });
    addMapLayerSafe({
      id: realBuildingTilesetConfig.paleRoofDeckLayerId,
      type: 'fill-extrusion',
      source: realBuildingTilesetConfig.sourceId,
      'source-layer': realBuildingTilesetConfig.sourceLayer,
      minzoom: 12.35,
      filter: [
        'all',
        plainCandidateFilter,
        ['<', ['coalesce', ['get', 'height'], 10], 90],
        [
          'in',
          ['get', 'material'],
          ['literal', ['paleConcrete', 'limestone', 'tanStone', 'parkingGarage', 'hotelStoneGlass', 'steelStone']]
        ]
      ],
      paint: {
        'fill-extrusion-base': [
          'case',
          ['<', ['coalesce', ['get', 'height'], 10], 12],
          1.7,
          3.8
        ],
        'fill-extrusion-height': [
          'case',
          ['<', ['coalesce', ['get', 'height'], 10], 12],
          2.5,
          4.8
        ],
        'fill-extrusion-color': [
          'match',
          ['get', 'material'],
          'parkingGarage', '#aaa49a',
          'tanStone', '#c4a46a',
          'limestone', '#d9c08e',
          'paleConcrete', '#cbc7bd',
          '#cbc0a8'
        ],
        'fill-extrusion-opacity': 0.91,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.045,
        'fill-extrusion-ambient-occlusion-radius': 0.75
      }
    });
    addMapLayerSafe({
      id: realBuildingTilesetConfig.glassAccentLayerId,
      type: 'fill-extrusion',
      source: realBuildingTilesetConfig.sourceId,
      'source-layer': realBuildingTilesetConfig.sourceLayer,
      minzoom: 12.55,
      filter: [
        'all',
        plainCandidateFilter,
        ['>=', ['coalesce', ['get', 'height'], 0], 8],
        [
          'in',
          ['get', 'material'],
          ['literal', ['steelStone', 'storefrontWarm', 'officeGlass', 'midriseGlass', 'creamGlass', 'hotelStoneGlass', 'signatureBlueGlass']]
        ]
      ],
      paint: {
        'fill-extrusion-base': [
          'case',
          ['<', ['coalesce', ['get', 'height'], 20], 34],
          2.6,
          4.25
        ],
        'fill-extrusion-height': [
          'case',
          ['<', ['coalesce', ['get', 'height'], 20], 34],
          5.25,
          7.65
        ],
        'fill-extrusion-color': [
          'match',
          ['get', 'material'],
          'storefrontWarm', '#59b9b4',
          'steelStone', '#4c9eaf',
          'officeGlass', '#58b6c8',
          'midriseGlass', '#72b7c0',
          'creamGlass', '#8ccbc6',
          'hotelStoneGlass', '#91c9c5',
          'signatureBlueGlass', '#50b4c8',
          [
            'coalesce',
            ['get', 'windowColor'],
            '#68c7cf'
          ]
        ],
        'fill-extrusion-opacity': 0.93,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.045,
        'fill-extrusion-ambient-occlusion-radius': 0.7
      }
    });
    addMapLayerSafe({
      id: realBuildingTilesetConfig.facadeAccentLayerId,
      type: 'fill-extrusion',
      source: realBuildingTilesetConfig.sourceId,
      'source-layer': realBuildingTilesetConfig.sourceLayer,
      minzoom: 12.25,
      filter: [
        'all',
        plainCandidateFilter,
        ['>=', ['coalesce', ['get', 'height'], 0], 2],
        ['<', ['coalesce', ['get', 'height'], 0], 220]
      ],
      paint: {
        'fill-extrusion-base': [
          'case',
          ['<', ['coalesce', ['get', 'height'], 18], 24],
          0.5,
          1.15
        ],
        'fill-extrusion-height': [
          'case',
          ['<', ['coalesce', ['get', 'height'], 18], 24],
          4.15,
          6.45
        ],
        'fill-extrusion-color': [
          'match',
          ['get', 'material'],
          'brick', '#9b4935',
          'residentialBrick', '#9d523b',
          'softTerracotta', '#ad583b',
          'warmWood', '#765238',
          'retailBrick', '#a44934',
          'storefrontWarm', '#468f8e',
          'parkingGarage', '#30322e',
          'tanStone', '#ad874f',
          'limestone', '#ccb178',
          'paleConcrete', '#bab5aa',
          [
            'coalesce',
            ['get', 'baseColor'],
            '#bda27a'
          ]
        ],
        'fill-extrusion-opacity': 0.91,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.055,
        'fill-extrusion-ambient-occlusion-radius': 0.85
      }
    });
    addMapLayerSafe({
      id: realBuildingTilesetConfig.upperTrimLayerId,
      type: 'fill-extrusion',
      source: realBuildingTilesetConfig.sourceId,
      'source-layer': realBuildingTilesetConfig.sourceLayer,
      minzoom: 12.55,
      filter: [
        'all',
        plainCandidateFilter,
        ['>=', ['coalesce', ['get', 'height'], 0], 10],
        ['<', ['coalesce', ['get', 'height'], 0], 120]
      ],
      paint: {
        'fill-extrusion-base': [
          'case',
          ['<', ['coalesce', ['get', 'height'], 18], 28],
          5,
          6.9
        ],
        'fill-extrusion-height': [
          'case',
          ['<', ['coalesce', ['get', 'height'], 18], 28],
          6.65,
          8.95
        ],
        'fill-extrusion-color': [
          'match',
          ['get', 'material'],
          'brick', '#6d372c',
          'residentialBrick', '#704032',
          'softTerracotta', '#7b422e',
          'warmWood', '#5d422f',
          'retailBrick', '#74392e',
          'storefrontWarm', '#31565c',
          'parkingGarage', '#292b28',
          'tanStone', '#72583a',
          'limestone', '#9a8054',
          'paleConcrete', '#7d7e78',
          [
            'coalesce',
            ['get', 'trimColor'],
            '#725d40'
          ]
        ],
        'fill-extrusion-opacity': 0.86,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.04,
        'fill-extrusion-ambient-occlusion-radius': 0.65
      }
    });
    addMapLayerSafe({
      id: realBuildingTilesetConfig.roofLayerId,
      type: 'fill-extrusion',
      source: realBuildingTilesetConfig.sourceId,
      'source-layer': realBuildingTilesetConfig.sourceLayer,
      minzoom: 12.35,
      filter: [
        'all',
        plainCandidateFilter,
        ['<', ['coalesce', ['get', 'height'], 0], 48]
      ],
      paint: {
        'fill-extrusion-base': ['coalesce', ['get', 'height'], 10],
        'fill-extrusion-height': [
          'case',
          ['<=', ['coalesce', ['get', 'roofHeight'], 0], ['coalesce', ['get', 'height'], 10]],
          ['+', ['coalesce', ['get', 'height'], 10], 0.7],
          ['coalesce', ['get', 'roofHeight'], ['+', ['coalesce', ['get', 'height'], 10], 0.7]]
        ],
        'fill-extrusion-color': [
          'match',
          ['get', 'material'],
          'brick', '#5f4034',
          'residentialBrick', '#624336',
          'retailBrick', '#693e32',
          'softTerracotta', '#814831',
          'warmWood', '#594332',
          'parkingGarage', '#44423c',
          'officeGlass', '#607c84',
          'midriseGlass', '#708c91',
          'steelStone', '#6d7b7e',
          'limestone', '#aa9064',
          'tanStone', '#8d6b42',
          'paleConcrete', '#a4a197',
          ['coalesce', ['get', 'roofColor'], '#6a6257']
        ],
        'fill-extrusion-opacity': 0.9,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.06,
        'fill-extrusion-ambient-occlusion-radius': 0.9
      }
    });
    window.__srMockRealTilesetLayersMounted = true;
    applyOptimizedSkinCoverageTuning(optimizedSkinCoverageLevel);
    updateDynamicDetailedMapboxProtections(true);
    applyVectorSkinProtectionFilters();
    auditMockReplacementRule();
    refreshRealWorldColorProfileStats();
    if (!map.getSource?.('src-mock-osm-buildings')) {
      window.__srMockSkinMode = 'real-mapbox-tileset-building-skin';
    }
    updateSkinReadout();
    return true;
  } catch (error) {
    window.__srMockRealTilesetStatus = `layer install skipped: ${error?.message || error}`;
    return false;
  }
}

function refreshRealBuildingTilesetStats() {
  if (!map?.querySourceFeatures || !map.getSource?.(realBuildingTilesetConfig.sourceId)) return;
  const now = Date.now();
  if (now - lastRealTilesetStatsAt < 650) return;
  lastRealTilesetStatsAt = now;
  try {
    window.__srMockRealTilesetLayersMounted = realBuildingTilesetConfig.presentationMode === 'facade-kit-structure-only'
      ? Boolean(
        map.getSource?.(realBuildingTilesetConfig.sourceId)
        && map.getLayer?.(realBuildingTilesetConfig.dataLayerId)
      )
      : [
      realBuildingTilesetConfig.baseLayerId,
      realBuildingTilesetConfig.entryRevealLayerId,
      realBuildingTilesetConfig.streetGlassLayerId,
      realBuildingTilesetConfig.storefrontCanopyLayerId,
      realBuildingTilesetConfig.parkingBandLayerId,
      realBuildingTilesetConfig.parkingUpperBandLayerId,
      realBuildingTilesetConfig.paleRoofDeckLayerId,
      realBuildingTilesetConfig.glassAccentLayerId,
      realBuildingTilesetConfig.facadeAccentLayerId,
      realBuildingTilesetConfig.upperTrimLayerId,
      realBuildingTilesetConfig.roofLayerId
    ].some((layerId) => !!map.getLayer?.(layerId));
    const features = map.querySourceFeatures(realBuildingTilesetConfig.sourceId, {
      sourceLayer: realBuildingTilesetConfig.sourceLayer
    }) || [];
    const previousFeatureCount = Number(window.__srMockRealTilesetFeatureCount || 0);
    if (features.length > 0) {
      window.__srMockRealTilesetFeatureCount = features.length;
      window.__srMockRealTilesetLastNonzeroAt = now;
    } else {
      const lastNonzeroAt = Number(window.__srMockRealTilesetLastNonzeroAt || 0);
      const settledEmptyView = map.isSourceLoaded?.(realBuildingTilesetConfig.sourceId)
        && now - lastNonzeroAt > 6000;
      if (!previousFeatureCount || settledEmptyView) window.__srMockRealTilesetFeatureCount = 0;
    }
    refreshRealWorldColorProfileStats(features);
    if (features.length) {
      window.__srMockRealTilesetStatus = `active ${realBuildingTilesetConfig.url} / ${realBuildingTilesetConfig.sourceLayer} (${features.length} visible tile features)`;
      if (!map.getSource?.('src-mock-osm-buildings')) window.__srMockSkinMode = 'real-mapbox-tileset-building-skin';
      if (!document.body.classList.contains('render-off')) setSimArchitectureVisibility(true);
      updateSkinReadout();
    }
  } catch (error) {
    window.__srMockRealTilesetStatus = `mounted, query pending: ${error?.message || error}`;
  }
}

function currentColorProfileStats() {
  return window.__srMockColorProfileStats || {
    mode: realWorldColorProfileMode,
    sample: 0,
    realMatched: 0,
    fallback: 0,
    namedMatched: 0,
    categoryMatched: 0,
    materialMatched: 0,
    confidenceCounts: {},
    confidenceSummary: '',
    topProfiles: ''
  };
}

function isKnownRealWorldMaterial(material) {
  return realWorldKnownMaterialProfiles.includes(String(material || ''));
}

function isGenericFallbackMaterial(material) {
  return ['', 'tanStone', 'paleConcrete'].includes(String(material || ''));
}

function featureHasRealIdentity(properties) {
  return Boolean(
    properties?.contextName
    || properties?.name
    || properties?.NAME
    || properties?.brand
    || properties?.operator
    || properties?.osm_id
    || properties?.overtureId
    || properties?.globalId
    || properties?.global_id
  );
}

function refreshRealWorldColorProfileStats(sourceFeatures) {
  const now = Date.now();
  if (!sourceFeatures && window.__srMockColorProfileStatsAt && now - window.__srMockColorProfileStatsAt < 2500) {
    return currentColorProfileStats();
  }
  const stats = {
    mode: realWorldColorProfileMode,
    sample: 0,
    realMatched: 0,
    fallback: 0,
    namedMatched: 0,
    categoryMatched: 0,
    materialMatched: 0,
    confidenceCounts: {},
    confidenceSummary: '',
    topProfiles: ''
  };
  try {
    const features = sourceFeatures || (map?.querySourceFeatures?.(realBuildingTilesetConfig.sourceId, {
      sourceLayer: realBuildingTilesetConfig.sourceLayer
    }) || []);
    const sampledFeatures = features.slice(0, 2400);
    const seen = new Set();
    const profiles = {};
    sampledFeatures.forEach((feature, index) => {
      const properties = feature?.properties || {};
      const material = String(properties.material || '');
      const category = String(properties.category || '');
      const identityKey = properties.overtureId
        || properties.globalId
        || properties.global_id
        || properties.osm_id
        || properties.id
        || properties.contextName
        || properties.name
        || `${material}:${category}:${properties.height || ''}:${index}`;
      if (seen.has(identityKey)) return;
      seen.add(identityKey);
      const confidence = String(properties.classificationConfidence || '');
      const namedMatched = confidence === 'poi-context' || featureHasRealIdentity(properties);
      const materialMatched = isKnownRealWorldMaterial(material);
      const categoryMatched = confidence === 'land-use-context' || realWorldContextCategories.includes(category);
      const fallback = confidence
        ? confidence === 'fallback'
        : !namedMatched && !categoryMatched && (!materialMatched || isGenericFallbackMaterial(material));
      stats.sample += 1;
      if (namedMatched) stats.namedMatched += 1;
      if (categoryMatched) stats.categoryMatched += 1;
      if (materialMatched) stats.materialMatched += 1;
      if (fallback) {
        stats.fallback += 1;
      } else {
        stats.realMatched += 1;
      }
      const profile = material || (category ? `${category}-fallback` : 'generic-fallback');
      profiles[profile] = (profiles[profile] || 0) + 1;
      const confidenceKey = confidence || 'legacy-unclassified';
      stats.confidenceCounts[confidenceKey] = (stats.confidenceCounts[confidenceKey] || 0) + 1;
    });
    stats.totalTileFeatures = features.length;
    stats.sampleLimit = sampledFeatures.length;
    stats.topProfiles = Object.entries(profiles)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([profile, count]) => `${profile} ${count}`)
      .join(', ');
    stats.confidenceSummary = Object.entries(stats.confidenceCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => `${name} ${count}`)
      .join(', ');
  } catch (error) {
    stats.error = String(error?.message || error);
  }
  window.__srMockColorProfileStats = stats;
  window.__srMockColorProfileStatsAt = now;
  if (document.body?.dataset) {
    document.body.dataset.mockColorProfileMode = stats.mode;
    document.body.dataset.mockColorProfileRealMatched = String(stats.realMatched);
    document.body.dataset.mockColorProfileFallback = String(stats.fallback);
  }
  return stats;
}

function applySimBasemapConfig(enabled) {
  const config = enabled ? simBasemapConfig : baseBasemapConfig;
  Object.entries(config).forEach(([property, value]) => setConfigSafe(property, value));
  applyOfficialGoLiveAtmosphere();
  window.__srMockSkinMode = enabled && map?.getSource?.('src-mock-osm-buildings')
    ? 'osm-footprint-detail-trim-no-double'
    : (enabled ? 'mapbox-standard-sim-basemap-treatment' : 'mapbox-standard-base');
  updateSkinReadout();
}

function applyOfficialGoLiveAtmosphere() {
  if (!map) return false;
  try {
    setConfigSafe('lightPreset', 'dusk');
    setConfigSafe('show3dObjects', true);
    map.setLight?.({
      anchor: 'map',
      color: '#edf3ff',
      intensity: 0.92,
      position: [1.35, 42, 48]
    });
    map.setFog?.({
      color: '#4b5572',
      'high-color': '#8094c0',
      'horizon-blend': 0.1,
      'space-color': '#202640',
      'star-intensity': 0
    });
    document.body.dataset.mockOfficialAtmosphere = 'official-go-live-dusk';
    return true;
  } catch (error) {
    window.__srMockAtmosphereError = String(error?.message || error);
    return false;
  }
}

function setVisualParityMode() {
  document.body.classList.remove('render-off');
  document.body.dataset.mockVisualParity = 'architecture-skin-locked';
  setSimArchitectureVisibility(true);
  facadeKitV2Manager?.setEnabled?.(true);
  applySimBasemapConfig(true);
  window.__srMockVisualParityMode = 'architecture-skin-locked';
  setStatus('Architecture skin and Facade Kit V2 are always active so every mock visit shows current progress.');
  updateProgressReadout();
}

function updateSkinReadout() {
  if (!skinReadout) return;
  const renderOff = document.body.classList.contains('render-off');
  const mode = renderOff
    ? 'mapbox-standard-base'
    : window.__srMockRealTilesetLayersMounted
    ? (realBuildingTilesetConfig.presentationMode === 'facade-kit-structure-only'
      ? 'mapbox-standard-facade-kit-v2'
      : 'real-mapbox-tileset-building-skin')
    : (window.__srMockSkinMode || 'mapbox-standard-sim-treatment');
  const colorStats = currentColorProfileStats();
  const colorStatsText = `color mode ${colorStats.mode}: ${colorStats.realMatched} real/context/material matched, ${colorStats.fallback} restrained fallback${colorStats.topProfiles ? `; top profiles ${colorStats.topProfiles}` : ''}`;
  const sourceText = {
    'custom-building-source-skin-no-double': 'Skin: custom source on; no duplicate stacks.',
    'existing-mapbox-building-layers-restyled': 'Skin: Mapbox 3D restyled in place.',
    'real-mapbox-tileset-building-skin': `Skin: optimized map-wide render on; ${colorStats.realMatched} matched, ${colorStats.fallback} fallback.`,
    'mapbox-standard-facade-kit-v2': `Architecture: Mapbox originals preserved; Facade Kit structures on ${facadeKitV2Status.buildings || 0} plain buildings.`,
    'osm-footprint-detail-trim-no-double': `Skin: Austin footprints on; ${window.__srMockPlainBlockSkinCount || 0} plain styled, ${window.__srMockPreservedDetailCount || 0} protected.`,
    'osm-footprint-loading': 'Skin: loading Austin building data...',
    'osm-footprint-error': 'Skin: Mapbox base active; detail data unavailable.',
    'mapbox-standard-sim-basemap-treatment': 'Skin: Mapbox Standard treatment on.',
    'mapbox-standard-3d-fallback': 'Skin: Mapbox fallback active.',
    'mapbox-standard-base': 'Skin: hidden; Mapbox base only.'
  };
  skinReadout.textContent = sourceText[mode] || `Skin source: ${mode}.`;
  updateProgressReadout();
}

function updateProgressReadout() {
  if (!progressBuilt || !progressProtected || !progressActive || !progressNext || !progressApproval) return;
  const renderOff = document.body.classList.contains('render-off');
  const mode = renderOff
    ? 'mapbox-standard-base'
    : window.__srMockRealTilesetLayersMounted
    ? (realBuildingTilesetConfig.presentationMode === 'facade-kit-structure-only'
      ? 'mapbox-standard-facade-kit-v2'
      : 'real-mapbox-tileset-building-skin')
    : (window.__srMockSkinMode || 'starting');
  const plain = Number(window.__srMockPlainBlockSkinCount || 0);
  const structural = Number(window.__srMockStructuralBayCount || 0);
  const preserved = Number(window.__srMockPreservedDetailCount || 0);
  const detailedOverlap = Number(window.__srMockDetailedOverlapProtectedCount || 0);
  const signatures = Number(window.__srMockRealWorldSignatureCount || 0);
  const accuracyProfiles = Number(window.__srMockAccuracyProfileCount || 0);
  const dynamicProtected = Number(window.__srMockDynamicDetailedProtectionCount || 0);
  const visibleArchitecture = Number(window.__srMockVisibleArchitectureCount || 0);
  const mountedLayers = window.__srMockMountedSimArchitectureLayers?.length || 0;
  const audit = window.__srMockNoDoubleLayerAudit || {};
  const forbiddenCount = (audit.forbiddenLayers?.length || 0) + (audit.forbiddenSources?.length || 0) + (audit.lineLayers?.length || 0);
  const gate = getPublishReviewGate(audit);
  const readinessBlockers = gate.blockers || [];
  const publishReady = gate.ready;
  const cache = window.__srMockFootprintCacheStatus || 'checking';
  const fetchMs = Number(window.__srMockFootprintFetchMs || 0);
  const fetchText = fetchMs > 0 ? `${Math.round(fetchMs)}ms fetch` : 'fetch pending';
  const realTilesetFeatures = Number(window.__srMockRealTilesetFeatureCount || 0);
  const realTilesetText = realTilesetFeatures > 0 ? `, ${realTilesetFeatures} real tile refs` : '';
  const colorStats = currentColorProfileStats();
  const colorText = `${colorStats.realMatched} matched / ${colorStats.fallback} fallback`;
  const coverageLevel = Number(window.__srMockOptimizedSkinCoverageLevel || optimizedSkinCoverageLevel || 0);
  const loading = mode === 'osm-footprint-loading' || window.__srMockFootprintInFlight;
  const builtText = renderOff
    ? 'Official baseline'
    : plain > 0 || structural > 0
    ? `${plain} blocks, ${visibleArchitecture} modules`
    : loading
    ? 'Loading'
    : mountedLayers > 0
    ? `${mountedLayers} layers, ${colorText}`
    : 'Base stable';
  const manualSafeguards = protectedAustinLandmarkZones.length
    + realWorldAustinSignatureZones.filter((zone) => zone.preserveMapboxDetail).length;
  const protectedText = `${dynamicProtected} live detailed / ${manualSafeguards} safeguards`;
  const activeText = loading
    ? `Fetching data`
    : mode === 'real-mapbox-tileset-building-skin'
    ? `${window.__srMockUserOptimizeRuns ? `Tap opt ${window.__srMockUserOptimizeRuns}: ` : ''}Skin L${coverageLevel}: ${publishReady ? 'clean' : 'review'}`
    : mode === 'osm-footprint-detail-trim-no-double'
    ? `Skin: ${forbiddenCount === 0 ? 'clean' : 'cleanup'}`
    : mode === 'mapbox-standard-base'
    ? 'Mapbox base only'
    : mode === 'mapbox-standard-3d-fallback'
    ? 'Fallback'
    : 'Mapbox base';
  progressBuilt.textContent = builtText;
  progressProtected.textContent = protectedText;
  progressActive.textContent = activeText;
  progressNext.textContent = forbiddenCount > 0
    ? 'Remove stale layers'
    : readinessBlockers.length > 0
    ? `Resolve: ${readinessBlockers.slice(0, 2).join(', ')}`
    : publishReady
    ? 'Review ready'
    : mode === 'real-mapbox-tileset-building-skin' && mountedLayers > 0
    ? 'Visual QA'
    : visibleArchitecture > 0
    ? 'Polish'
    : plain > 0
    ? 'Accuracy'
    : 'Finish load';
  if (progressIntegrity) {
    const duplicateCount = (audit.forbiddenLayers?.length || 0) + (audit.forbiddenSources?.length || 0);
    progressIntegrity.textContent = `Duplicates ${duplicateCount} / floating ${audit.floatingMeshLayer ? 1 : 0}`;
  }
  if (progressProfiles) {
    progressProfiles.textContent = colorStats.confidenceSummary || colorStats.topProfiles || `${colorStats.realMatched} deterministic matches`;
  }
  if (progressHealth) {
    const layerErrors = (window.__srMockLayerInstallErrors || []).length;
    const mapRuntimeErrors = window.__srMockMapRuntimeErrors || [];
    const latestMapError = mapRuntimeErrors[mapRuntimeErrors.length - 1];
    const invalidGeoJson = Number(window.__srMockDroppedInvalidGeoJson || 0);
    const facadeBuildMs = Number(facadeKitV2Status.lastBuildMs || 0);
    const performanceAdvisory = window.__srMockPerformanceBudget?.gate?.advisories?.[0] || '';
    progressHealth.textContent = layerErrors
      ? `${layerErrors} layer errors`
      : latestMapError
      ? `Map review: ${latestMapError.message}`.slice(0, 78)
      : invalidGeoJson
      ? `Stable / ${invalidGeoJson} invalid shapes skipped`
      : facadeBuildMs
      ? `Stable / ${facadeBuildMs}ms facade / ${window.__srMockPerformanceBudget?.tier || 'balanced'} tier${performanceAdvisory ? ' / network review' : ''}`
      : 'Stable / interactive';
  }
  if (progressCompactSummary) {
    const layerErrors = (window.__srMockLayerInstallErrors || []).length;
    const integrity = forbiddenCount === 0 && !audit.floatingMeshLayer ? 'clean' : 'review';
    progressCompactSummary.textContent = `${publishReady ? 'Review ready' : 'Loading'} · ${mountedLayers} layers · ${integrity}${layerErrors ? ` · ${layerErrors} errors` : ''}`;
  }
  if (progressSource) {
    progressSource.textContent = realTilesetFeatures > 0
      ? `Published vector active (${realTilesetFeatures})`
      : (window.__srMockRealTilesetLayersMounted ? 'Published vector mounted' : 'Waiting for vector tiles');
  }
  if (progressFacadeKit) {
    progressFacadeKit.textContent = facadeKitV2Status.error
      ? `Review: ${facadeKitV2Status.error}`
      : facadeKitV2Status.ready
      ? formatFacadeKitProgress(facadeKitV2Status)
      : 'Loading Mapbox-native models';
  }
  progressApproval.textContent = publishReady
    ? 'Approval needed: review visual quality, then decide whether to package this mock skin for real Go Live.'
    : 'Approval blocked until publish-readiness audit is clean.';
  const productionReview = publishProductionReviewSnapshot(audit);
  productionReview.next = progressNext.textContent;
  productionReview.approval = progressApproval.textContent;
  document.body.dataset.mockPublishReady = productionReview.status;
  document.body.dataset.mockPublishBlockers = productionReview.blockers.join(', ');
  document.body.dataset.mockMountedSkinLayers = String(productionReview.mountedSkinLayers);
  document.body.dataset.mockProtectedZones = String(productionReview.protectedZones);
  if (productionPackage) {
    const optimizeReport = window.__srMockLastOptimizeReport;
    productionPackage.textContent = publishReady
      ? `Ready: human review`
      : `Review: ${readinessBlockers.slice(0, 1).join(', ') || 'audit pending'}`;
  }
  if (publishChecklist) {
    publishChecklist.textContent = `Publish check: ${formatPublishChecklist(gate.checklist)}`;
    publishChecklist.title = readinessBlockers.length
      ? `Blockers: ${readinessBlockers.join(', ')}`
      : 'All publish-readiness checks are clean.';
  }
  updateOptimizeStatusLine();
  if (optimizeDirective) {
    optimizeDirective.textContent = 'Goal: build + polish map skin';
    optimizeDirective.title = window.__srMockOptimizeDirective || 'Expand coverage, improve visuals, protect detailed buildings, keep replacement rule clean.';
  }
  if (latestBuildZones) {
    const latest = window.__srMockLatestBuildZones;
    latestBuildZones.textContent = latest?.message
      ? `${latest.state === 'complete' ? 'Complete' : 'Working'}: ${latest.zones?.length ? latest.zones.join(', ') : 'current view'} + green radar`
      : 'Built: none yet';
  }
  if (progressSummary) {
    progressSummary.textContent = 'Mapbox base, protection, skin, speed guards.';
  }
}

function hideOriginalBuildingExtrusions() {
  if (!map?.getStyle) return;
  let layers = [];
  try {
    if (!map.isStyleLoaded?.()) return;
    layers = map.getStyle()?.layers || [];
  } catch {
    return;
  }
  layers.forEach((layer) => {
    if (simArchitectureLayerIds.includes(layer.id)) return;
    const sourceLayer = layer['source-layer'] || '';
    const isBuildingExtrusion = layer.type === 'fill-extrusion' && /building/i.test(`${layer.id} ${sourceLayer}`);
    if (isBuildingExtrusion && map.getLayer(layer.id)) {
      if (!hiddenOriginalBuildingLayerIds.includes(layer.id)) hiddenOriginalBuildingLayerIds.push(layer.id);
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  });
}

function restoreOriginalBuildingExtrusions() {
  hiddenOriginalBuildingLayerIds.forEach((id) => {
    try {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
    } catch {
      // Style imports can replace layer ids; restoring is best-effort.
    }
  });
}

function addAustinSimArchitectureLayers() {
  if (!map) return;
  const styledExisting = false;
  window.__srMockMountedSimArchitectureLayers = simArchitectureLayerIds.filter((id) => map.getLayer(id));
    if (styledExisting || window.__srMockMountedSimArchitectureLayers.length) {
    const renderOff = document.body.classList.contains('render-off');
    window.__srMockSkinMode = renderOff
      ? 'mapbox-standard-base'
      : hasAllowedFootprintSource()
      ? 'osm-footprint-detail-trim-no-double'
      : (window.__srMockMountedSimArchitectureLayers.length ? 'custom-building-source-skin-no-double' : 'existing-mapbox-building-layers-restyled');
    updateSkinReadout();
  }
}

function installAustinSimArchitectureLayersSoon() {
  if (!map) return;
  window.clearTimeout(simArchitectureInstallTimer);
  simArchitectureInstallAttempts += 1;
  addAustinSimArchitectureLayers();
  const mounted = simArchitectureLayerIds.some((id) => map.getLayer(id));
  window.__srMockMountedSimArchitectureLayers = simArchitectureLayerIds.filter((id) => map.getLayer(id));
  const styledExisting = styledMapboxArchitectureLayerIds.length > 0;
  if (mounted || styledExisting) {
    const renderOff = document.body.classList.contains('render-off');
    window.__srMockSkinMode = renderOff
      ? 'mapbox-standard-base'
      : hasAllowedFootprintSource()
      ? 'osm-footprint-detail-trim-no-double'
      : (mounted ? 'custom-building-source-skin-no-double' : 'existing-mapbox-building-layers-restyled');
    setSimArchitectureVisibility(!renderOff);
    updateSkinReadout();
    return;
  }
  if (simArchitectureInstallAttempts < 12) {
    simArchitectureInstallTimer = window.setTimeout(installAustinSimArchitectureLayersSoon, 650);
  } else {
    window.__srMockSkinMode = osmFootprintLoadStarted || osmFootprintRequestInFlight
      ? 'osm-footprint-loading'
      : 'mapbox-standard-3d-fallback';
    updateSkinReadout();
  }
}

function parseOsmHeight(tags = {}) {
  const rawHeight = Number(String(tags.height || '').replace(/[^\d.]/g, ''));
  if (Number.isFinite(rawHeight) && rawHeight > 0) return Math.min(rawHeight, 180);
  const levels = Number(tags['building:levels'] || tags.levels || 0);
  if (Number.isFinite(levels) && levels > 0) return Math.min(levels * 3.2, 180);
  return 12;
}

function classifyOsmTags(tags = {}) {
  const haystack = [
    tags.building,
    tags.amenity,
    tags.shop,
    tags.tourism,
    tags.office,
    tags.leisure,
    tags.historic,
    tags.name
  ].filter(Boolean).join(' ').toLowerCase();
  if (/hotel|motel|inn|apartments/.test(haystack)) return 'hotel';
  if (/restaurant|bar|cafe|fast_food|pub|shop|retail|market|theatre|cinema|music/.test(haystack)) return 'storefront';
  if (/office|commercial|bank/.test(haystack)) return 'office';
  if (/museum|school|university|library|courthouse|government|church|cathedral|civic/.test(haystack)) return 'civic';
  if (/house|residential|detached|semidetached|terrace/.test(haystack)) return 'residential';
  return 'building';
}

function polygonCentroid(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const totals = ring.reduce((acc, coord) => {
    acc.lng += coord[0];
    acc.lat += coord[1];
    return acc;
  }, { lng: 0, lat: 0 });
  return [totals.lng / ring.length, totals.lat / ring.length];
}

function featureCentroid(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Polygon') return polygonCentroid(geometry.coordinates?.[0]);
  if (geometry.type === 'MultiPolygon') {
    const largest = (geometry.coordinates || []).reduce((best, polygon) => {
      const ring = polygon?.[0] || [];
      return ring.length > best.length ? ring : best;
    }, []);
    return polygonCentroid(largest);
  }
  return null;
}

function featureBounds(geometry) {
  const rings = geometry?.type === 'Polygon'
    ? geometry.coordinates
    : geometry?.type === 'MultiPolygon'
    ? geometry.coordinates.flat()
    : [];
  const coords = rings.flat().filter((coord) => Array.isArray(coord) && coord.length >= 2);
  if (!coords.length) return null;
  return coords.reduce((bounds, coord) => ({
    minLng: Math.min(bounds.minLng, coord[0]),
    maxLng: Math.max(bounds.maxLng, coord[0]),
    minLat: Math.min(bounds.minLat, coord[1]),
    maxLat: Math.max(bounds.maxLat, coord[1])
  }), { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity });
}

function ringContainsCoordinate(ring, coordinate) {
  if (!Array.isArray(ring) || ring.length < 4 || !Array.isArray(coordinate)) return false;
  const [x, y] = coordinate;
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    const intersects = ((y1 > y) !== (y2 > y))
      && (x < ((x2 - x1) * (y - y1)) / ((y2 - y1) || Number.EPSILON) + x1);
    if (intersects) inside = !inside;
  }
  return inside;
}

function geometryContainsCoordinate(geometry, coordinate) {
  if (geometry?.type === 'Polygon') return ringContainsCoordinate(geometry.coordinates?.[0], coordinate);
  if (geometry?.type === 'MultiPolygon') {
    return (geometry.coordinates || []).some((polygon) => ringContainsCoordinate(polygon?.[0], coordinate));
  }
  return false;
}

function footprintRect(bounds, leftFrac, rightFrac, bottomFrac, topFrac) {
  const width = bounds.maxLng - bounds.minLng;
  const depth = bounds.maxLat - bounds.minLat;
  const left = bounds.minLng + width * leftFrac;
  const right = bounds.minLng + width * rightFrac;
  const bottom = bounds.minLat + depth * bottomFrac;
  const top = bounds.minLat + depth * topFrac;
  return [[
    [left, bottom],
    [right, bottom],
    [right, top],
    [left, top],
    [left, bottom]
  ]];
}

function footprintFrontSkinRect(bounds, leftFrac, rightFrac, depthStartFrac = -0.018, depthEndFrac = 0.055) {
  return footprintRect(bounds, leftFrac, rightFrac, depthStartFrac, depthEndFrac);
}

function footprintBackSkinRect(bounds, leftFrac, rightFrac, depthStartFrac = 0.945, depthEndFrac = 1.018) {
  return footprintRect(bounds, leftFrac, rightFrac, depthStartFrac, depthEndFrac);
}

function footprintSideSkinRect(bounds, bottomFrac, topFrac, widthStartFrac = -0.018, widthEndFrac = 0.055) {
  return footprintRect(bounds, widthStartFrac, widthEndFrac, bottomFrac, topFrac);
}

function footprintRightSideSkinRect(bounds, bottomFrac, topFrac, widthStartFrac = 0.945, widthEndFrac = 1.018) {
  return footprintRect(bounds, widthStartFrac, widthEndFrac, bottomFrac, topFrac);
}

function footprintLine(bounds, startLngFrac, startLatFrac, endLngFrac, endLatFrac) {
  const width = bounds.maxLng - bounds.minLng;
  const depth = bounds.maxLat - bounds.minLat;
  return [
    [bounds.minLng + width * startLngFrac, bounds.minLat + depth * startLatFrac],
    [bounds.minLng + width * endLngFrac, bounds.minLat + depth * endLatFrac]
  ];
}

function distanceMeters(a, b) {
  const radius = 6371000;
  const lat1 = a[1] * Math.PI / 180;
  const lat2 = b[1] * Math.PI / 180;
  const deltaLat = (b[1] - a[1]) * Math.PI / 180;
  const deltaLng = (b[0] - a[0]) * Math.PI / 180;
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function circlePolygon(center, radiusMeters, steps = 40) {
  const lat = center[1];
  const lng = center[0];
  const latRadius = radiusMeters / 111320;
  const lngRadius = radiusMeters / (111320 * Math.cos(lat * Math.PI / 180));
  const ring = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    ring.push([
      lng + Math.cos(angle) * lngRadius,
      lat + Math.sin(angle) * latRadius
    ]);
  }
  return {
    type: 'Polygon',
    coordinates: [ring]
  };
}

function vectorSkinProtectedZones() {
  return [
    ...protectedAustinLandmarkZones,
    // Named signature structures are conservative safeguards. The live registry
    // adds every other detailed Standard model detected in the current view.
    ...realWorldAustinSignatureZones,
    ...(window.__srMockDynamicDetailedProtectionZones || [])
  ];
}

function vectorSkinProtectedZoneFilter() {
  const zones = vectorSkinProtectedZones();
  window.__srMockVectorProtectedZoneCount = zones.length;
  if (zones.length) {
    window.__srMockPreservedDetailCount = Math.max(Number(window.__srMockPreservedDetailCount || 0), zones.length);
  }
  return [
    'all',
    ...zones.map((zone) => {
      const geometry = zone.geometry?.type === 'Polygon' || zone.geometry?.type === 'MultiPolygon'
        ? zone.geometry
        : circlePolygon(zone.center, zone.radiusMeters);
      return ['!', ['within', geometry]];
    })
  ];
}

function vectorSkinPlainCandidateFilter() {
  const coverageLevel = Number(window.__srMockOptimizedSkinCoverageLevel || optimizedSkinCoverageLevel || 0);
  const maxPlainHeight = coverageLevel >= 3 ? 220 : coverageLevel >= 2 ? 175 : coverageLevel >= 1 ? 145 : 118;
  const categoryMatches = [
    ['==', ['get', 'category'], 'storefront'],
    ['==', ['get', 'category'], 'residential'],
    ['==', ['get', 'category'], 'parking'],
    ['==', ['get', 'category'], 'building'],
    ['==', ['get', 'category'], 'office'],
    ['==', ['get', 'category'], 'hotel']
  ];
  if (coverageLevel >= 1) {
    categoryMatches.push(
      ['==', ['get', 'category'], 'restaurant'],
      ['==', ['get', 'category'], 'retail']
    );
  }
  if (coverageLevel >= 2) {
    categoryMatches.push(
      ['!', ['has', 'category']],
      ['==', ['coalesce', ['get', 'category'], 'building'], 'building']
    );
  }
  return [
    'all',
    vectorSkinProtectedZoneFilter(),
    ['!', ['in', ['get', 'material'], ['literal', [
      'signatureBlueGlass',
      'civicLimestone',
      'historicMasonry'
    ]]]],
    ['!=', ['get', 'category'], 'civic'],
    [
      'any',
      ['<', ['coalesce', ['get', 'height'], 10], maxPlainHeight],
      ...categoryMatches,
      ['in', ['get', 'material'], ['literal', [
        'brick',
        'residentialBrick',
        'softTerracotta',
        'warmWood',
        'retailBrick',
        'storefrontWarm',
        'parkingGarage',
        'officeGlass',
        'midriseGlass',
        'creamGlass',
        'hotelStoneGlass',
        'steelStone',
        'tanStone',
        'limestone',
        'paleConcrete',
        ...(coverageLevel >= 1 ? ['entertainmentStorefront', 'creamGlass'] : [])
      ]]]
    ]
  ];
}

function isDetailedMapboxBuildingFeature(feature) {
  if (!feature || /^src-mock-/.test(feature.source || '') || /^src-mock-/.test(feature?.layer?.id || '')) return false;
  const featuresetId = feature?.target?.featuresetId || '';
  const layerId = feature?.layer?.id || '';
  const layerType = feature?.layer?.type || '';
  const sourceLayer = feature?.layer?.['source-layer'] || feature?.sourceLayer || '';
  const props = feature?.properties || {};
  const haystack = [
    layerId,
    layerType,
    sourceLayer,
    props.name,
    props.name_en,
    props.category,
    props.maki,
    props.class,
    props.type,
    props.structure,
    props.building,
    props.building_type,
    props.landmark,
    props.feature_type
  ].filter(Boolean).join(' ').toLowerCase();
  if (/tree|vegetation|street[_ -]?furniture|vehicle|car|transit|road|street|route|bus stop/.test(haystack)) return false;
  if (layerType === 'model') return true;
  if (/building[_-]?model|3d[_-]?model|landmark|structure[_-]?model|building[_-]?facade|facade[_-]?model/.test(haystack)) return true;
  const identityClass = [props.category, props.maki, props.class, props.type, props.structure, props.landmark, props.feature_type]
    .filter(Boolean).join(' ').toLowerCase();
  const layerHasArchitecturalGeometry = /building|structure|landmark|facade|model/.test(`${layerId} ${sourceLayer}`.toLowerCase());
  const hasName = Boolean(props.name || props.name_en);
  const highConfidenceBuildingIdentity = /tower|building|center|centre|hotel|convention|capitol|courthouse|cathedral|museum|landmark|library|office|plaza|hall|residences|apartments|lofts|condominiums|complex/.test(haystack);
  const knownDetailedAustinIdentity = /driskill|111 congress|indeed tower|frost bank|one american center|austonian|the independent|fairmont|jw marriott|westin|aloft|thompson|proper hotel|omni|state capitol|convention center/.test(haystack);
  const highConfidenceMapCategory = /lodging|museum|government|town_hall|place_of_worship|historic|monument|landmark/.test(identityClass);
  const hasModelEvidence = Boolean(
    props.model_id
    || props.modelId
    || props.facade
    || props.facade_id
    || props.landmark
    || props.is_3d === true
    || props.is_3d === 'true'
    || /model|facade|landmark/.test(String(props.render_type || props.structure || '').toLowerCase())
  );
  if (featuresetId === 'landmark-icons') return true;
  if (featuresetId === 'buildings' && (knownDetailedAustinIdentity || hasModelEvidence)) return true;
  if (featuresetId === 'buildings' && hasName && highConfidenceBuildingIdentity) return true;
  if (hasName && (knownDetailedAustinIdentity || highConfidenceMapCategory)) return true;
  if (hasName && layerHasArchitecturalGeometry && highConfidenceBuildingIdentity) return true;
  // Standard can expose a detailed model and its label through different imports.
  // Treat an unmistakable building label as a protection proxy for the model below it.
  if (hasName && highConfidenceBuildingIdentity && (feature.geometry?.type === 'Point' || feature.geometry?.type === 'MultiPoint')) return true;
  if ((props.name || props.name_en) && /landmark|monument|historic|government/.test(identityClass)) return true;
  return false;
}

function featureGeometryCenter(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Point') return geometry.coordinates;
  if (geometry.type === 'MultiPoint') return geometry.coordinates?.[0] || null;
  const centroid = featureCentroid(geometry);
  if (centroid) return centroid;
  const coordinates = [];
  const collect = (value) => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      coordinates.push(value);
      return;
    }
    value.forEach(collect);
  };
  collect(geometry.coordinates);
  if (!coordinates.length) return null;
  const middle = coordinates[Math.floor(coordinates.length / 2)];
  return [middle[0], middle[1]];
}

function detailedFeatureProtectionRadius(feature, center) {
  const geometry = feature?.geometry;
  const bounds = featureBounds(geometry);
  if (bounds && center) {
    const corners = [
      [bounds.minLng, bounds.minLat],
      [bounds.minLng, bounds.maxLat],
      [bounds.maxLng, bounds.minLat],
      [bounds.maxLng, bounds.maxLat]
    ];
    const footprintRadius = Math.max(...corners.map((corner) => distanceMeters(center, corner)));
    if (Number.isFinite(footprintRadius)) return Math.max(24, Math.min(230, footprintRadius + 18));
  }
  const props = feature?.properties || {};
  const descriptor = [props.name, props.name_en, props.category, props.class, props.type, feature?.layer?.id].filter(Boolean).join(' ');
  if (/capitol|convention|complex/i.test(descriptor)) return 180;
  if (/tower|center|centre/i.test(descriptor)) return 82;
  if (/hotel|museum|courthouse|cathedral|library/i.test(descriptor)) return 66;
  return feature?.layer?.type === 'model' ? 52 : 44;
}

function detailedFeatureRegistryKey(feature, center) {
  const props = feature?.properties || {};
  const target = feature?.target;
  if (target?.featuresetId && feature?.id !== undefined && feature?.id !== null) {
    return `featureset:${target.importId || 'root'}:${target.featuresetId}:${feature.namespace || 'default'}:${feature.id}`;
  }
  const source = feature?.source || 'mapbox-standard';
  const sourceLayer = feature?.sourceLayer || feature?.layer?.['source-layer'] || feature?.layer?.id || 'feature';
  if (feature?.id !== undefined && feature?.id !== null) return `${source}:${sourceLayer}:${feature.id}`;
  const name = props.name || props.name_en || props.ref || props.wikidata || feature?.layer?.id || 'detailed-building';
  return `${source}:${sourceLayer}:${name}:${Number(center?.[0] || 0).toFixed(5)}:${Number(center?.[1] || 0).toFixed(5)}`;
}

function queryAuthoritativeMapboxArchitectureFeatures(bounds) {
  const features = [];
  const targetErrors = [];
  const targets = [
    { featuresetId: 'buildings', importId: 'basemap' },
    { featuresetId: 'landmark-icons', importId: 'basemap' }
  ];
  targets.forEach((target) => {
    try {
      const matches = map.queryRenderedFeatures(bounds, { target }) || [];
      matches.forEach((feature) => features.push(feature));
    } catch (error) {
      targetErrors.push(`${target.featuresetId}: ${error?.message || error}`);
    }
  });
  try {
    const rootMatches = map.queryRenderedFeatures(bounds) || [];
    rootMatches.filter(isDetailedMapboxBuildingFeature).forEach((feature) => features.push(feature));
    window.__srMockProtectionRootFeatureCount = rootMatches.length;
  } catch (error) {
    targetErrors.push(`root: ${error?.message || error}`);
  }
  window.__srMockProtectionFeaturesetErrors = targetErrors;
  window.__srMockProtectionFeaturesetFeatureCount = features.filter((feature) => feature?.target?.featuresetId).length;
  return features;
}

function updateDynamicDetailedMapboxProtections(force = false) {
  if (!map?.queryRenderedFeatures || !map?.getCanvas || !map?.isStyleLoaded?.()) return [];
  const now = Date.now();
  if (!force && window.__srMockDynamicDetailedProtectionScannedAt && now - window.__srMockDynamicDetailedProtectionScannedAt < 1800) {
    return window.__srMockDynamicDetailedProtectionZones || [];
  }
  const canvas = map.getCanvas();
  const width = canvas?.clientWidth || 0;
  const height = canvas?.clientHeight || 0;
  if (!width || !height) return [];
  let renderedFeatures = [];
  try {
    renderedFeatures = queryAuthoritativeMapboxArchitectureFeatures([
      [0, 0],
      [width, height]
    ]);
  } catch (error) {
    window.__srMockDetailedProtectionScanError = String(error?.message || error);
    return window.__srMockDynamicDetailedProtectionZones || [];
  }
  const nextRegistry = new Map(detailedMapboxProtectionRegistry);
  renderedFeatures.filter(isDetailedMapboxBuildingFeature).forEach((feature) => {
    const center = featureGeometryCenter(feature.geometry);
    if (!center || !Number.isFinite(center[0]) || !Number.isFinite(center[1])) return;
    const key = detailedFeatureRegistryKey(feature, center);
    const props = feature.properties || {};
    const entry = {
      key,
      id: feature.id ?? null,
      name: props.name || props.name_en || feature.layer?.id || 'Detailed Mapbox building',
      center: [center[0], center[1]],
      radiusMeters: detailedFeatureProtectionRadius(feature, center),
       source: feature?.target?.featuresetId
         ? `Mapbox Standard featureset:${feature.target.featuresetId}`
         : feature.source || 'Mapbox Standard',
      sourceLayer: feature.sourceLayer || feature.layer?.['source-layer'] || '',
      layerId: feature.layer?.id || '',
       layerType: feature.layer?.type || (feature?.target?.featuresetId ? `featureset:${feature.target.featuresetId}` : ''),
      geometryType: feature.geometry?.type || '',
      geometry: feature.geometry || null,
      preserveMapboxDetail: true,
      seenAt: now
    };
    const previous = nextRegistry.get(key);
    if (!previous || entry.radiusMeters > previous.radiusMeters) nextRegistry.set(key, entry);
  });
  [...nextRegistry.entries()].forEach(([key, entry]) => {
    if (now - Number(entry.seenAt || 0) > 45000) nextRegistry.delete(key);
  });
  const entries = [...nextRegistry.values()]
    .sort((left, right) => {
      const leftModel = left.layerType === 'model' ? 1 : 0;
      const rightModel = right.layerType === 'model' ? 1 : 0;
      return rightModel - leftModel || right.radiusMeters - left.radiusMeters;
    })
    .slice(0, 96);
  detailedMapboxProtectionRegistry.clear();
  entries.forEach((entry) => detailedMapboxProtectionRegistry.set(entry.key, entry));
  const zones = entries.map((entry) => ({
    name: entry.name,
    center: entry.center,
    radiusMeters: entry.radiusMeters,
    source: `Live Mapbox ${entry.layerType || 'feature'} protection`,
    registryKey: entry.key,
    geometry: entry.geometry,
    preserveMapboxDetail: true
  }));
  const previousSignature = window.__srMockDynamicDetailedProtectionSignature || '';
  const registrySignature = entries.map((entry) => `${entry.key}:${entry.center[0].toFixed(5)}:${entry.center[1].toFixed(5)}:${Math.round(entry.radiusMeters)}`).join('|');
  window.__srMockDynamicDetailedProtectionZones = zones;
  window.__srMockDynamicDetailedProtectionCount = zones.length;
  window.__srMockDynamicDetailedProtectionScannedAt = now;
  window.__srMockDynamicDetailedProtectionSignature = registrySignature;
  window.__srMockProtectedMapboxRegistry = entries;
  window.__srMockProtectedMapboxIds = entries.map((entry) => entry.key);
  window.__srMockProtectedMapboxFootprints = {
    type: 'FeatureCollection',
    features: entries
      .filter((entry) => entry.geometry?.type === 'Polygon' || entry.geometry?.type === 'MultiPolygon')
      .map((entry) => ({
        type: 'Feature',
        id: entry.id,
        properties: { key: entry.key, name: entry.name, layerId: entry.layerId },
        geometry: entry.geometry
      }))
  };
  window.__srMockDetailedProtectionScanError = '';
  window.__srMockDetailedProtectionCandidateCount = renderedFeatures.filter(isDetailedMapboxBuildingFeature).length;
  document.body.dataset.mockProtectionScan = `${renderedFeatures.length} rendered / ${entries.length} protected`;
  document.body.dataset.mockLiveProtectedBuildings = String(entries.length);
  document.body.dataset.mockLiveProtectedNames = entries.map((entry) => entry.name).join(' | ').slice(0, 700);
  document.body.dataset.mockLiveProtectedTypes = entries.map((entry) => `${entry.layerType || 'feature'}:${entry.geometryType || 'none'}`).join(' | ').slice(0, 500);
  document.body.dataset.mockProtectionScannedAt = String(now);
  if (entries.length) {
    detailedMapboxProtectionEmptyRetries = 0;
  } else if (renderedFeatures.length && detailedMapboxProtectionEmptyRetries < 12) {
    detailedMapboxProtectionEmptyRetries += 1;
    window.setTimeout(() => scheduleDetailedMapboxProtectionScan(0, true), 1100);
  }
  if (registrySignature !== previousSignature) {
    vectorSkinFilterSignature = '';
    applyVectorSkinProtectionFilters();
    facadeKitV2Manager?.refresh?.(120);
    window.__srMockDetailedProtectionChangedAt = now;
  }
  updateProgressReadout();
  return zones;
}

function scheduleDetailedMapboxProtectionScan(delayMs = 0, force = false) {
  if (detailedMapboxProtectionScanTimer && !force) return;
  window.clearTimeout(detailedMapboxProtectionScanTimer);
  detailedMapboxProtectionScanTimer = window.setTimeout(() => {
    detailedMapboxProtectionScanTimer = 0;
    updateDynamicDetailedMapboxProtections(force);
    applyVectorSkinProtectionFilters();
  }, delayMs);
}
window.__srMockRefreshDetailedProtection = () => {
  updateDynamicDetailedMapboxProtections(true);
  applyVectorSkinProtectionFilters();
  facadeKitV2Manager?.refresh?.(0);
  return window.__srMockProtectedMapboxRegistry || [];
};

function applyVectorSkinProtectionFilters() {
  if (!map?.getLayer || !map?.setFilter) return;
  const filterLayerIds = [
    realBuildingTilesetConfig.clipLayerId,
    realBuildingTilesetConfig.baseLayerId,
    realBuildingTilesetConfig.entryRevealLayerId,
    realBuildingTilesetConfig.streetGlassLayerId,
    realBuildingTilesetConfig.storefrontCanopyLayerId,
    realBuildingTilesetConfig.parkingBandLayerId,
    realBuildingTilesetConfig.parkingUpperBandLayerId,
    realBuildingTilesetConfig.paleRoofDeckLayerId,
    realBuildingTilesetConfig.glassAccentLayerId,
    realBuildingTilesetConfig.facadeAccentLayerId,
    realBuildingTilesetConfig.upperTrimLayerId,
    realBuildingTilesetConfig.roofLayerId
  ];
  const mountedCount = filterLayerIds.filter((layerId) => map.getLayer(layerId)).length;
  const dynamicZones = window.__srMockDynamicDetailedProtectionZones || [];
  const signature = [
    mountedCount,
    window.__srMockOptimizedSkinCoverageLevel || optimizedSkinCoverageLevel || 0,
    window.__srMockVectorProtectedZoneCount || 0,
    window.__srMockDynamicDetailedProtectionCount || 0,
    ...dynamicZones.map((zone) => `${zone.registryKey || zone.name || ''}:${zone.center?.[0]?.toFixed?.(5) || ''}:${zone.center?.[1]?.toFixed?.(5) || ''}:${Math.round(zone.radiusMeters || 0)}`)
  ].join('|');
  if (signature === vectorSkinFilterSignature && mountedCount === vectorSkinFilterLayerCount) {
    window.__srMockVectorFilterSkipped = (window.__srMockVectorFilterSkipped || 0) + 1;
    return;
  }
  const plainCandidateFilter = vectorSkinPlainCandidateFilter();
  const baseFilter = [
    'all',
    plainCandidateFilter,
    ['>=', ['coalesce', ['get', 'height'], 0], 2],
    ['<', ['coalesce', ['get', 'height'], 0], 220]
  ];
  const roofFlushFilter = [
    'all',
    plainCandidateFilter,
    ['<', ['coalesce', ['get', 'height'], 0], 48]
  ];
  [
    [realBuildingTilesetConfig.clipLayerId, plainCandidateFilter],
    [realBuildingTilesetConfig.baseLayerId, baseFilter],
    [realBuildingTilesetConfig.entryRevealLayerId, [
      'all',
      plainCandidateFilter,
      ['>=', ['coalesce', ['get', 'height'], 0], 3],
      [
        'any',
        ['==', ['get', 'category'], 'storefront'],
        ['==', ['get', 'category'], 'parking'],
        ['==', ['get', 'category'], 'building'],
        ['==', ['get', 'category'], 'office'],
        ['==', ['get', 'category'], 'hotel'],
        ['==', ['get', 'category'], 'residential'],
        ['==', ['get', 'partRole'], 'podium'],
        ['==', ['get', 'material'], 'storefrontWarm'],
        ['==', ['get', 'material'], 'parkingGarage'],
        ['==', ['get', 'material'], 'officeGlass'],
        ['==', ['get', 'material'], 'midriseGlass'],
        ['==', ['get', 'material'], 'steelStone'],
        ['==', ['get', 'material'], 'hotelStoneGlass'],
        ['==', ['get', 'material'], 'retailBrick'],
        ['==', ['get', 'material'], 'brick'],
        ['==', ['get', 'material'], 'warmWood'],
        ['==', ['get', 'material'], 'limestone'],
        ['==', ['get', 'material'], 'tanStone'],
        ['==', ['get', 'material'], 'paleConcrete']
      ]
    ]],
    [realBuildingTilesetConfig.streetGlassLayerId, [
      'all',
      plainCandidateFilter,
      ['>=', ['coalesce', ['get', 'height'], 0], 4],
      [
        'any',
        ['==', ['get', 'category'], 'storefront'],
        ['==', ['get', 'category'], 'hotel'],
        ['==', ['get', 'category'], 'office'],
        ['==', ['get', 'category'], 'building'],
        ['==', ['get', 'partRole'], 'podium'],
        ['==', ['get', 'material'], 'storefrontWarm'],
        ['==', ['get', 'material'], 'retailBrick'],
        ['==', ['get', 'material'], 'hotelStoneGlass'],
        ['==', ['get', 'material'], 'entertainmentStorefront'],
        ['==', ['get', 'material'], 'officeGlass'],
        ['==', ['get', 'material'], 'midriseGlass'],
        ['==', ['get', 'material'], 'steelStone'],
        ['==', ['get', 'material'], 'limestone'],
        ['==', ['get', 'material'], 'tanStone'],
        ['==', ['get', 'material'], 'paleConcrete']
      ]
    ]],
    [realBuildingTilesetConfig.storefrontCanopyLayerId, [
      'all',
      plainCandidateFilter,
      ['>=', ['coalesce', ['get', 'height'], 0], 4],
      [
        'any',
        ['==', ['get', 'category'], 'storefront'],
        ['==', ['get', 'category'], 'hotel'],
        ['==', ['get', 'category'], 'office'],
        ['==', ['get', 'partRole'], 'podium'],
        ['==', ['get', 'material'], 'storefrontWarm'],
        ['==', ['get', 'material'], 'retailBrick'],
        ['==', ['get', 'material'], 'hotelStoneGlass'],
        ['==', ['get', 'material'], 'entertainmentStorefront'],
        ['==', ['get', 'material'], 'officeGlass'],
        ['==', ['get', 'material'], 'midriseGlass'],
        ['==', ['get', 'material'], 'steelStone'],
        ['==', ['get', 'material'], 'limestone'],
        ['==', ['get', 'material'], 'tanStone'],
        ['==', ['get', 'material'], 'paleConcrete']
      ]
    ]],
    [realBuildingTilesetConfig.parkingBandLayerId, [
      'all',
      plainCandidateFilter,
      [
        'any',
        ['==', ['get', 'category'], 'parking'],
        ['==', ['get', 'material'], 'parkingGarage']
      ],
      ['>=', ['coalesce', ['get', 'height'], 0], 9]
    ]],
    [realBuildingTilesetConfig.parkingUpperBandLayerId, [
      'all',
      plainCandidateFilter,
      [
        'any',
        ['==', ['get', 'category'], 'parking'],
        ['==', ['get', 'material'], 'parkingGarage']
      ],
      ['>=', ['coalesce', ['get', 'height'], 0], 18]
    ]],
    [realBuildingTilesetConfig.paleRoofDeckLayerId, [
      'all',
      plainCandidateFilter,
      ['<', ['coalesce', ['get', 'height'], 10], 90],
      ['in', ['get', 'material'], ['literal', ['paleConcrete', 'limestone', 'tanStone', 'parkingGarage', 'hotelStoneGlass', 'steelStone']]]
    ]],
    [realBuildingTilesetConfig.glassAccentLayerId, [
      'all',
      plainCandidateFilter,
      ['>=', ['coalesce', ['get', 'height'], 0], 8],
      ['in', ['get', 'material'], ['literal', ['steelStone', 'storefrontWarm', 'officeGlass', 'midriseGlass', 'creamGlass', 'hotelStoneGlass', 'signatureBlueGlass']]]
    ]],
    [realBuildingTilesetConfig.facadeAccentLayerId, [
      'all',
      plainCandidateFilter,
      ['>=', ['coalesce', ['get', 'height'], 0], 2],
      ['<', ['coalesce', ['get', 'height'], 0], 220]
    ]],
    [realBuildingTilesetConfig.upperTrimLayerId, [
      'all',
      plainCandidateFilter,
      ['>=', ['coalesce', ['get', 'height'], 0], 10],
      ['<', ['coalesce', ['get', 'height'], 0], 120]
    ]],
    [realBuildingTilesetConfig.roofLayerId, roofFlushFilter]
  ].forEach(([layerId, filter]) => {
    try {
      if (map.getLayer(layerId)) map.setFilter(layerId, filter);
    } catch (error) {
      window.__srMockLayerInstallErrors = [...(window.__srMockLayerInstallErrors || []), `${layerId} filter: ${error?.message || error}`].slice(-80);
    }
  });
  vectorSkinFilterSignature = signature;
  vectorSkinFilterLayerCount = mountedCount;
  window.__srMockVectorFilterAppliedAt = Date.now();
  document.body.dataset.mockProtectionFilters = `${mountedCount} skin layers / ${dynamicZones.length} live exclusions`;
}

function protectedAustinLandmarkForCoord(coord) {
  if (!coord) return null;
  return protectedAustinLandmarkZones.find((zone) => distanceMeters(coord, zone.center) <= zone.radiusMeters) || null;
}

function shouldPreserveLikelyDetailedFootprint(feature) {
  const props = feature?.properties || {};
  if (props.preserveMapboxDetail === true || props.preserveMapboxDetail === 'true') return true;
  const material = String(props.material || '').toLowerCase();
  const category = String(props.category || '').toLowerCase();
  const source = String(props.contextSource || props.source || '').toLowerCase();
  return category === 'civic'
    || /signatureblueglass|civiclimestone|historicmasonry/.test(material)
    || /protected.*landmark|detailed.*mapbox/.test(source);
}

function isFacadeKitV2Protected(feature, centroid) {
  if (!centroid) return true;
  if (shouldPreserveLikelyDetailedFootprint(feature)) return true;
  return vectorSkinProtectedZones().some((zone) => {
    const radius = Math.max(1, Number(zone.radiusMeters || 0));
    const centerDistance = distanceMeters(centroid, zone.center);
    // Polygon containment is the expensive protection check. Most published
    // footprints are nowhere near a detailed Mapbox model, so reject those
    // pairs using the authoritative zone center/radius first.
    if (centerDistance > radius + 35) return false;
    if (zone.protectComplex) return centerDistance <= radius;
    if (geometryContainsCoordinate(zone.geometry, centroid)) return true;
    if (geometryContainsCoordinate(feature?.geometry, zone.center)) return true;
    // Point-label protections are proxies for the detailed model below them.
    // Keep the fallback tight so neighboring plain buildings remain eligible.
    return centerDistance <= Math.min(radius, 28);
  });
}

function formatFacadeKitProgress(status = {}) {
  const renderedModels = Number(status.renderedModels || 0);
  const base = `Mapbox native / ${status.buildings || 0} buildings / ${status.instances || 0} models / ${renderedModels} visible / ${status.modelAssets || 0} assets / LOD${Number(status.lod ?? 2)} ${status.performanceTier || 'balanced'}`;
  const details = [];
  if (status.windowBays || status.entries || status.structuralPiers || status.floorBands || status.canopies) {
    details.push(`${status.windowBays || 0} window grids, ${status.mullionGrids || 0} mullion grids, ${status.entries || 0} entries, ${status.structuralPiers || 0} piers, ${status.floorBands || 0} floor bands, ${status.canopies || 0} canopies`);
  }
  if (status.towers || status.towerFacades) details.push(`${status.towers || 0} towers, ${status.towerFacades || 0} faces, ${status.crowns || 0} crowns`);
  if (status.midrises || status.midriseFacades) details.push(`${status.midrises || 0} mid-rises, ${status.midriseFacades || 0} faces, ${status.balconies || 0} balconies, ${status.storefronts || 0} storefronts`);
  if (status.homes || status.roofs || status.driveways) details.push(`${status.homes || 0} homes, ${status.roofs || 0} roofs, ${status.driveways || 0} drives`);
  if (status.garages || status.parkingOpenings || status.lowriseFaces) details.push(`${status.garages || 0} garages, ${status.parkingOpenings || 0} openings, ${status.lowriseFaces || 0} low-rise faces`);
  if (status.lastBuildMs || status.skippedRebuilds) details.push(`${status.lastBuildMs || 0}ms build, ${status.recordsBuildMs || 0}ms records, ${status.meshBuildMs || 0}ms mesh, ${status.skippedRebuilds || 0} cached refreshes`);
  return details.length ? `${base} | ${details.join(' | ')}` : base;
}

function updateFacadeKitV2Status(status = {}) {
  facadeKitV2Status = { ...facadeKitV2Status, ...status };
  window.__srMockFacadeKitV2Status = facadeKitV2Status;
  document.body.dataset.mockFacadeKit = facadeKitV2Status.error
    ? 'error'
    : facadeKitV2Status.ready
    ? 'active-locked'
    : 'loading';
  if (progressFacadeKit) {
    progressFacadeKit.textContent = facadeKitV2Status.error
      ? `Review: ${facadeKitV2Status.error}`
      : facadeKitV2Status.ready
      ? formatFacadeKitProgress(facadeKitV2Status)
      : 'Loading Mapbox-native models';
  }
}

function resetFacadeKitV2Manager() {
  const manager = facadeKitV2Manager;
  facadeKitV2Manager = null;
  facadeKitV2RefreshTimers.forEach(window.clearTimeout);
  facadeKitV2RefreshTimers = [];
  window.clearTimeout(facadeKitV2SourceRefreshTimer);
  facadeKitV2SourceRefreshTimer = 0;
  try {
    manager?.destroy?.();
  } catch (error) {
    window.__srMockFacadeKitDestroyError = String(error?.message || error);
  }
  facadeKitV2Status = { ready: false, loading: true, renderer: 'mapbox-native-model-layer', modelLayers: 0, modelAssets: 0, buildings: 0, instances: 0, homes: 0, roofs: 0, driveways: 0, towers: 0, towerFacades: 0, crowns: 0, midrises: 0, midriseFacades: 0, storefronts: 0, balconies: 0, garages: 0, parkingOpenings: 0, lowriseFaces: 0, windowBays: 0, entries: 0, lobbyFrames: 0, structuralPiers: 0, floorBands: 0, canopies: 0, lastBuildMs: 0, lastRefreshMs: 0, sourceFeatures: 0, rebuilds: 0, skippedRebuilds: 0, error: '' };
  updateFacadeKitV2Status(facadeKitV2Status);
}

function installFacadeKitV2() {
  if (!map || !window.SimpleRidesFacadeKitV2 || !map.getSource?.(realBuildingTilesetConfig.sourceId)) return false;
  try {
    let created = false;
    if (!facadeKitV2Manager) {
      created = true;
      facadeKitV2Manager = window.SimpleRidesFacadeKitV2.create({
        map,
        sourceId: realBuildingTilesetConfig.sourceId,
        sourceLayer: realBuildingTilesetConfig.sourceLayer,
        assetUrl: './assets/map-architecture/facade-kit-v2.glb',
        enabled: true,
        isProtected: isFacadeKitV2Protected,
        onStatus: updateFacadeKitV2Status
      });
    }
    facadeKitV2Manager.install();
    facadeKitV2Manager.setEnabled(true);
    if (!simArchitectureLayerIds.includes(window.SimpleRidesFacadeKitV2.layerId)) {
      simArchitectureLayerIds.push(window.SimpleRidesFacadeKitV2.layerId);
    }
    facadeKitV2Manager.refresh(320);
    if (created) {
      facadeKitV2RefreshTimers = [1800].map((delay) => window.setTimeout(() => {
        facadeKitV2Manager?.refresh?.(0);
      }, delay));
    }
    return true;
  } catch (error) {
    updateFacadeKitV2Status({ loading: false, ready: false, error: String(error?.message || error) });
    return false;
  }
}

function realWorldAustinSignatureForCoord(coord) {
  if (!coord) return null;
  return realWorldAustinSignatureZones.find((zone) => distanceMeters(coord, zone.center) <= zone.radiusMeters) || null;
}

function austinDistrictContextForCoord(coord, height = 12) {
  if (!coord) return null;
  const match = austinDistrictContextZones.find((zone) => distanceMeters(coord, zone.center) <= zone.radiusMeters);
  if (!match) return null;
  if (height >= 62 && match.category !== 'civic') {
    return {
      ...match,
      category: 'office',
      material: { style: 'officeGlass', wall: '#b8d3d6', roof: '#344852', base: '#7db6ba', window: '#dcffff', trim: '#f2f4ea' }
    };
  }
  return match;
}

function resetRenderedFeatureContextCache() {
  renderedFeatureContextCache = new Map();
  renderedFeatureContextStats = { queries: 0, hits: 0 };
}

function queryRenderedFeaturesCached(coord, radius = 44, limit = 80) {
  if (!map?.project || !map?.queryRenderedFeatures || !coord) return [];
  const point = map.project(coord);
  const zoomBucket = Math.round((map.getZoom?.() || 0) * 2) / 2;
  const key = `${zoomBucket}:${radius}:${Math.round(point.x / 48)}:${Math.round(point.y / 48)}`;
  if (renderedFeatureContextCache.has(key)) {
    renderedFeatureContextStats.hits += 1;
    return renderedFeatureContextCache.get(key);
  }
  const features = map.queryRenderedFeatures([
    [point.x - radius, point.y - radius],
    [point.x + radius, point.y + radius]
  ]).slice(0, limit);
  renderedFeatureContextStats.queries += 1;
  renderedFeatureContextCache.set(key, features);
  return features;
}

function categoryFromMapboxFeature(feature) {
  const props = feature?.properties || {};
  const haystack = [
    props.name,
    props.name_en,
    props.category,
    props.category_en,
    props.maki,
    props.class,
    props.type,
    props.group
  ].filter(Boolean).join(' ').toLowerCase();
  if (/parking|garage|car park/.test(haystack)) return 'parking';
  if (/hotel|motel|inn|suites|lodging/.test(haystack)) return 'hotel';
  if (/restaurant|bar|cafe|food|shop|retail|market|store|theatre|theater|music/.test(haystack)) return 'storefront';
  if (/office|bank|business|commercial|tower/.test(haystack)) return 'office';
  if (/museum|school|university|library|courthouse|government|civic|church|cathedral/.test(haystack)) return 'civic';
  if (/residential|apartments|condo|home|house/.test(haystack)) return 'residential';
  return '';
}

function hasMapboxPreservedDetail(feature) {
  if (!feature || /^src-mock-/.test(feature.source || '')) return false;
  const layerId = feature?.layer?.id || '';
  const sourceLayer = feature?.layer?.['source-layer'] || feature?.sourceLayer || '';
  const props = feature?.properties || {};
  const haystack = [
    layerId,
    sourceLayer,
    props.name,
    props.name_en,
    props.category,
    props.maki,
    props.class,
    props.type
  ].filter(Boolean).join(' ').toLowerCase();
  const named = Boolean(props.name || props.name_en || props.name_script);
  return /model|landmark|3d|structure|building-model|building_model/.test(haystack)
    || (feature.layer?.type === 'model' && /building|structure|landmark|model/.test(haystack))
    || (named && /building|landmark|hotel|museum|theatre|theater|church|cathedral|courthouse|tower|office/.test(haystack));
}

function featureAuditPoints(feature, dense = false) {
  const centroid = featureCentroid(feature.geometry);
  const bounds = featureBounds(feature.geometry);
  if (!centroid || !bounds) return centroid ? [centroid] : [];
  const lngSpan = bounds.maxLng - bounds.minLng;
  const latSpan = bounds.maxLat - bounds.minLat;
  const points = [
    centroid,
    [bounds.minLng + lngSpan * 0.28, bounds.minLat + latSpan * 0.28],
    [bounds.minLng + lngSpan * 0.72, bounds.minLat + latSpan * 0.72]
  ];
  if (dense) {
    points.push(
      [bounds.minLng + lngSpan * 0.72, bounds.minLat + latSpan * 0.28],
      [bounds.minLng + lngSpan * 0.28, bounds.minLat + latSpan * 0.72]
    );
  }
  return points;
}

function enrichFootprintsWithMapboxContext(geojson) {
  if (!map?.project || !map?.queryRenderedFeatures) return geojson;
  geojson.features.forEach((feature) => {
    const centroid = featureCentroid(feature.geometry);
    if (!centroid) return;
    try {
      const protectedZone = protectedAustinLandmarkForCoord(centroid);
      if (protectedZone) {
        feature.properties.preserveMapboxDetail = true;
        feature.properties.category = 'civic';
        feature.properties.contextName = protectedZone.name;
        feature.properties.contextSource = 'Protected Austin landmark zone';
        return;
      }
      if (shouldPreserveLikelyDetailedFootprint(feature)) {
        feature.properties.preserveMapboxDetail = true;
        feature.properties.contextName = feature.properties.name || feature.properties.NAME || feature.properties.contextName || 'likely detailed Mapbox building';
        feature.properties.contextSource = 'Protected likely detailed Mapbox footprint';
        return;
      }
      const auditPoints = featureAuditPoints(feature, false);
      const nearby = [];
      auditPoints.forEach((coord) => {
        nearby.push(...queryRenderedFeaturesCached(coord, 44, 80));
      });
      const preservedDetail = nearby.find((candidate) => hasMapboxPreservedDetail(candidate));
      if (preservedDetail) {
        feature.properties.preserveMapboxDetail = true;
        feature.properties.contextName = preservedDetail.properties?.name || preservedDetail.properties?.name_en || '';
        feature.properties.contextSource = 'Preserved Mapbox detailed building/model';
        return;
      }
      const signatureZone = realWorldAustinSignatureForCoord(centroid);
      if (signatureZone) {
        if (signatureZone.preserveMapboxDetail) {
          feature.properties.preserveMapboxDetail = true;
          feature.properties.category = signatureZone.category;
          feature.properties.contextName = signatureZone.name;
          feature.properties.contextSource = 'Protected Austin signature Mapbox detail';
          return;
        }
        feature.properties.category = signatureZone.category;
        feature.properties.realWorldSignature = signatureZone.name;
        feature.properties.contextName = signatureZone.name;
        feature.properties.contextSource = signatureZone.source;
        applyMaterialProfile(feature, signatureZone.material);
        return;
      }
      if (feature.properties.category && feature.properties.category !== 'building') return;
      const realContext = nearby.find((candidate) => categoryFromMapboxFeature(candidate));
      const category = categoryFromMapboxFeature(realContext);
      if (category) {
        feature.properties.category = category;
        const contextName = realContext.properties?.name || realContext.properties?.name_en || '';
        feature.properties.contextName = contextName;
        feature.properties.contextSource = 'Mapbox rendered POI context';
        if (contextName) {
          feature.properties.realWorldSignature = contextName;
          feature.properties.contextSource = 'Mapbox rendered POI signature';
        }
        applyMaterialProfile(
          feature,
          materialProfileForRealWorldContext({
            category,
            id: feature.properties.id,
            height: Number(feature.properties.height || 12),
            building: feature.properties.building || '',
            materialHint: feature.properties.materialHint || '',
            name: [
              realContext.properties?.name,
              realContext.properties?.name_en,
              realContext.properties?.maki,
              realContext.properties?.class,
              realContext.properties?.type
            ].filter(Boolean).join(' ')
          })
        );
        return;
      }
      const districtContext = austinDistrictContextForCoord(centroid, Number(feature.properties.height || 12));
      if (districtContext && (!feature.properties.category || feature.properties.category === 'building')) {
        feature.properties.category = districtContext.category;
        feature.properties.contextName = districtContext.name;
        feature.properties.contextSource = 'Austin district context fallback';
        applyMaterialProfile(feature, districtContext.material);
      }
    } catch {
      // Real POI context is best-effort; OSM building tags remain the fallback.
    }
  });
  return geojson;
}

function protectDetailedMapboxOverlaps(geojson) {
  if (!map?.project || !map?.queryRenderedFeatures) return geojson;
  let protectedCount = 0;
  const matches = [];
  (geojson.features || []).forEach((feature) => {
    if (!feature?.geometry || feature.properties?.preserveMapboxDetail) return;
    if (!shouldSkinPlainBlock(feature)) return;
    const auditPoints = featureAuditPoints(feature, true);
    if (!auditPoints.length) return;
    try {
      let detailed = null;
      for (const coord of auditPoints) {
        const nearby = queryRenderedFeaturesCached(coord, 66, 140);
        detailed = nearby.find((candidate) => hasMapboxPreservedDetail(candidate));
        if (detailed) break;
      }
      if (!detailed) return;
      feature.properties.preserveMapboxDetail = true;
      feature.properties.realWorldSignature = '';
      feature.properties.contextName = detailed.properties?.name || detailed.properties?.name_en || feature.properties.contextName || '';
      feature.properties.contextSource = 'Runtime detailed Mapbox overlap scan';
      protectedCount += 1;
      matches.push(feature.properties.contextName || feature.properties.id || 'unnamed detailed overlap');
    } catch {
      // The overlap scan is defensive; failure should never blank the map.
    }
  });
  window.__srMockDetailedOverlapProtectedCount = protectedCount;
  window.__srMockDetailedOverlapProtectedNames = matches.slice(0, 40);
  return geojson;
}

function collectRealWorldSignatureMatches(geojson) {
  const matches = [];
  (geojson?.features || []).forEach((feature) => {
    const props = feature?.properties || {};
    if (!props.realWorldSignature || props.preserveMapboxDetail) return;
    matches.push({
      name: props.realWorldSignature,
      category: props.category || 'building',
      source: props.contextSource || 'building context',
      material: props.material || '',
      id: props.id || ''
    });
  });
  return matches;
}

function publishRealWorldSignatureAudit(geojson) {
  const matches = collectRealWorldSignatureMatches(geojson);
  const uniqueNames = [...new Set(matches.map((match) => match.name).filter(Boolean))].slice(0, 60);
  const sourceBreakdown = matches.reduce((breakdown, match) => {
    const source = match.source || 'building context';
    breakdown[source] = (breakdown[source] || 0) + 1;
    return breakdown;
  }, {});
  window.__srMockRealWorldSignatureCount = matches.length;
  window.__srMockRealWorldSignatureNames = uniqueNames;
  window.__srMockRealWorldSignatureDebug = matches.slice(0, 80);
  window.__srMockRealWorldSignatureSourceBreakdown = sourceBreakdown;
  return matches;
}

function osmToGeoJson(osmJson) {
  const nodes = new Map();
  (osmJson.elements || []).forEach((element) => {
    if (element.type === 'node') nodes.set(element.id, [element.lon, element.lat]);
  });
  const features = [];
  (osmJson.elements || []).forEach((element) => {
    if (element.type !== 'way' || !element.tags?.building || !Array.isArray(element.nodes)) return;
    const ring = element.nodes.map((id) => nodes.get(id)).filter(Boolean);
    if (ring.length < 4) return;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);
    const height = parseOsmHeight(element.tags);
    const category = classifyOsmTags(element.tags);
    const materialHint = [
      element.tags['building:material'],
      element.tags.material,
      element.tags['facade:material'],
      element.tags['roof:material'],
      element.tags['building:colour'],
      element.tags['building:color']
    ].filter(Boolean).join(' ');
    const normalized = {
      type: 'Feature',
      properties: {
        id: element.id,
        name: element.tags.name || '',
        building: element.tags.building || 'yes',
        category,
        materialHint,
        height,
        minHeight: 0,
        roofHeight: Math.max(height + 0.55, 2.5),
        source: 'OpenStreetMap/Overpass'
      },
      geometry: { type: 'Polygon', coordinates: [ring] }
    };
    applyMaterialProfile(normalized, materialProfileForRealWorldContext({
      category,
      id: element.id,
      height,
      building: element.tags.building || '',
      materialHint,
      name: element.tags.name || ''
    }));
    features.push(normalized);
  });
  return { type: 'FeatureCollection', features: features.slice(0, 280) };
}

function parseAustinOpenDataHeight(properties = {}) {
  const directFeet = Number(properties.MAX_HEIGHT || properties.max_height || 0);
  if (Number.isFinite(directFeet) && directFeet > 0) return Math.min(directFeet * 0.3048, 180);
  const topFeet = Number(properties.ELEVATION || properties.elevation || 0);
  const baseFeet = Number(properties.BASE_ELEVATION || properties.base_elevation || 0);
  if (Number.isFinite(topFeet) && Number.isFinite(baseFeet) && topFeet > baseFeet) {
    return Math.min((topFeet - baseFeet) * 0.3048, 180);
  }
  return 12;
}

function materialProfileForFeature(id, height) {
  const numericId = Math.abs(Number(String(id || '').replace(/[^\d]/g, '')) || 0);
  if (height >= 78) {
    return numericId % 3 === 0
      ? { style: 'officeGlass', wall: '#a8c5ca', roof: '#344852', base: '#6caab0', window: '#dcffff', trim: '#f2f4ea' }
      : { style: 'midriseGlass', wall: '#adc9cc', roof: '#3f5158', base: '#d1ddd5', window: '#d7fbff', trim: '#edf1e7' };
  }
  if (height >= 38) {
    if (numericId % 4 === 0) {
      return { style: 'retailBrick', wall: '#c96548', roof: '#5a3d35', base: '#65adb1', window: '#a7f2ed', trim: '#f0dfc6' };
    }
    if (numericId % 4 === 1) {
      return { style: 'tanStone', wall: '#d1b88e', roof: '#5b5143', base: '#b69a70', window: '#f2fbef', trim: '#9d8463' };
    }
    return { style: 'steelStone', wall: '#b9c7c3', roof: '#4d585d', base: '#d8ded2', window: '#e3f8fa', trim: '#f5f1e4' };
  }
  if (height >= 18) {
    if (numericId % 5 === 0) {
      return { style: 'residentialBrick', wall: '#c85f42', roof: '#543c35', base: '#a8563e', window: '#ead0bd', trim: '#8f4635' };
    }
    if (numericId % 5 === 1) {
      return { style: 'warmWood', wall: '#a96e3f', roof: '#4a3529', base: '#8d5d39', window: '#eadac6', trim: '#6f4a31' };
    }
    return { style: 'limestone', wall: '#dfcfb4', roof: '#5b5143', base: '#c9b59a', window: '#eef9f8', trim: '#a99a86' };
  }
  if (numericId % 3 === 0) {
    return { style: 'residentialBrick', wall: '#bf654b', roof: '#543c35', base: '#9e5840', window: '#ead0bd', trim: '#8f4635' };
  }
  if (numericId % 3 === 1) {
    return { style: 'warmWood', wall: '#a97143', roof: '#4a3529', base: '#8d5d39', window: '#eadac6', trim: '#6f4a31' };
  }
  return { style: 'paleConcrete', wall: '#d1cdc2', roof: '#5a5d5a', base: '#b4b0a7', window: '#dceff2', trim: '#8f9189' };
}

function materialProfileForRealWorldContext({ category = 'building', id = '', height = 12, building = '', materialHint = '', name = '' } = {}) {
  const text = [category, building, materialHint, name].filter(Boolean).join(' ').toLowerCase();
  const numericId = Math.abs(Number(String(id || '').replace(/[^\d]/g, '')) || 0);
  if (/district context fallback/.test(text)) {
    return height >= 62
      ? { style: 'officeGlass', wall: '#b8d3d6', roof: '#344852', base: '#7db6ba', window: '#dcffff', trim: '#f2f4ea' }
      : { style: 'limestone', wall: '#e5d6bd', roof: '#5b5143', base: '#d4c3aa', window: '#eef9f8', trim: '#bdb09e' };
  }
  if (/glass|curtain|tower|office|commercial|bank|financial/.test(text) || height >= 62) {
    return { style: 'officeGlass', wall: '#b8d3d6', roof: '#344852', base: '#7db6ba', window: '#dcffff', trim: '#f2f4ea' };
  }
  if (/parking|garage|car park/.test(text)) {
    return { style: 'parkingGarage', wall: '#cbc7bd', roof: '#5c5f5b', base: '#a9aaa3', window: '#6f7671', trim: '#858984' };
  }
  if (/hotel|motel|inn|suites|lodging/.test(text)) {
    return { style: 'hotelStoneGlass', wall: '#decdb0', roof: '#4e4038', base: '#87b9b7', window: '#e5ffff', trim: '#f7edd8' };
  }
  if (/restaurant|bar|cafe|fast_food|pub|shop|retail|market|store|theatre|cinema|music/.test(text)) {
    return /music|theatre|theater|bar|pub|arcade|entertainment/.test(text)
      ? { style: 'entertainmentStorefront', wall: '#b85b43', roof: '#4d352f', base: '#5eb4ad', window: '#b5fff3', trim: '#f1d6aa' }
      : { style: 'retailBrick', wall: '#c96548', roof: '#5a3d35', base: '#65adb1', window: '#a7f2ed', trim: '#f0dfc6' };
  }
  if (/museum|school|university|library|courthouse|government|church|cathedral|civic/.test(text)) {
    return { style: 'civicLimestone', wall: '#e7dbc8', roof: '#5d5f5b', base: '#cac0af', window: '#eff8f4', trim: '#a79f92' };
  }
  if (/wood|timber|siding/.test(text)) {
    return { style: 'warmWood', wall: '#a96e3f', roof: '#4a3529', base: '#8d5d39', window: '#eadac6', trim: '#6f4a31' };
  }
  if (/brick|masonry/.test(text)) {
    return /historic|hall|courthouse|tower|ornate/.test(text)
      ? { style: 'historicMasonry', wall: '#d7bea0', roof: '#4f4038', base: '#b58d6c', window: '#f5eadb', trim: '#7f5d48' }
      : { style: 'residentialBrick', wall: '#c85f42', roof: '#543c35', base: '#a8563e', window: '#ead0bd', trim: '#8f4635' };
  }
  if (/concrete|cement|stone|limestone|masonry/.test(text)) {
    return { style: 'paleConcrete', wall: '#d3d0c6', roof: '#5a5d5a', base: '#b8b5ac', window: '#dceff2', trim: '#8f9189' };
  }
  if (/house|residential|detached|semidetached|terrace|apartments|condo|home/.test(text)) {
    if (/wood|timber|siding/.test(text)) {
      return { style: 'warmWood', wall: '#a96e3f', roof: '#4a3529', base: '#8d5d39', window: '#eadac6', trim: '#6f4a31' };
    }
    if (/brick|masonry/.test(text)) {
      return { style: 'residentialBrick', wall: '#c85f42', roof: '#543c35', base: '#a8563e', window: '#ead0bd', trim: '#8f4635' };
    }
    return numericId % 2 === 0
      ? { style: 'limestone', wall: '#e5d6bd', roof: '#5b5143', base: '#d4c3aa', window: '#eef9f8', trim: '#bdb09e' }
      : { style: 'paleConcrete', wall: '#d8d4c9', roof: '#5a5d5a', base: '#bdb9b0', window: '#dceff2', trim: '#969890' };
  }
  return materialProfileForFeature(id, height);
}

function applyMaterialProfile(feature, material) {
  feature.properties.material = material.style;
  feature.properties.wallColor = material.wall;
  feature.properties.roofColor = material.roof;
  feature.properties.baseColor = material.base;
  feature.properties.windowColor = material.window;
  feature.properties.trimColor = material.trim;
}

function materialProfileForCategory(category, id, height) {
  return materialProfileForRealWorldContext({ category, id, height });
}

function shouldSkinPlainBlock(feature) {
  const properties = feature?.properties || {};
  const height = Number(properties.height || 0);
  if (properties.realWorldSignature && !properties.preserveMapboxDetail) return true;
  return !properties.preserveMapboxDetail && height < 220;
}

function applyStableDetailBudget(pointSources) {
  const viewportScale = window.innerWidth < 760 ? 0.62 : window.innerWidth < 1180 ? 0.82 : 1;
  const zoom = map?.getZoom?.() || 16;
  const zoomScale = zoom >= 17 ? 1.14 : zoom >= 16.2 ? 1 : zoom >= 15.4 ? 0.72 : 0.48;
  const cap = (base) => Math.max(24, Math.round(base * viewportScale * zoomScale));
  pointSources.structuralPlinths.features = pointSources.structuralPlinths.features.slice(0, cap(220));
  pointSources.storefrontBays.features = pointSources.storefrontBays.features.slice(0, cap(180));
  pointSources.parkingDeckOpenings.features = pointSources.parkingDeckOpenings.features.slice(0, cap(110));
  pointSources.structuralBays.features = pointSources.structuralBays.features.slice(0, cap(230));
  pointSources.structuralRecesses.features = pointSources.structuralRecesses.features.slice(0, cap(150));
  pointSources.facadePanels.features = pointSources.facadePanels.features.slice(0, cap(560));
  pointSources.facadeInsets.features = pointSources.facadeInsets.features.slice(0, cap(360));
  pointSources.facadeShadowStrips.features = pointSources.facadeShadowStrips.features.slice(0, cap(260));
  pointSources.storefrontGlass.features = pointSources.storefrontGlass.features.slice(0, cap(420));
  pointSources.visibleWindowBays.features = pointSources.visibleWindowBays.features.slice(0, cap(860));
  pointSources.visibleWindowGrid.features = pointSources.visibleWindowGrid.features.slice(0, cap(2600));
  pointSources.visibleArchitectureRibs.features = pointSources.visibleArchitectureRibs.features.slice(0, cap(860));
  pointSources.visibleStorefrontEntries.features = pointSources.visibleStorefrontEntries.features.slice(0, cap(360));
  pointSources.visibleFloorBands.features = pointSources.visibleFloorBands.features.slice(0, cap(980));
  pointSources.obviousFacadePlates.features = [];
  pointSources.architecturalProjections.features = [];
  pointSources.architecturalSetbacks.features = [];
  pointSources.architecturalPodiums.features = [];
  pointSources.architecturalReveals.features = [];
  pointSources.structuralFacadeFrames.features = [];
  window.__srMockStableDetailBudget = {
    viewportScale,
    zoomScale,
    zoom: Number(zoom.toFixed(2)),
    structuralBays: pointSources.structuralBays.features.length,
    facadePanels: pointSources.facadePanels.features.length,
    storefrontGlass: pointSources.storefrontGlass.features.length,
    visibleWindowBays: pointSources.visibleWindowBays.features.length,
    visibleWindowGrid: pointSources.visibleWindowGrid.features.length,
    visibleArchitectureRibs: pointSources.visibleArchitectureRibs.features.length,
    visibleStorefrontEntries: pointSources.visibleStorefrontEntries.features.length,
    visibleFloorBands: pointSources.visibleFloorBands.features.length,
    obviousFacadePlates: pointSources.obviousFacadePlates.features.length,
    architecturalProjections: pointSources.architecturalProjections.features.length,
    architecturalSetbacks: pointSources.architecturalSetbacks.features.length,
    architecturalPodiums: pointSources.architecturalPodiums.features.length,
    architecturalReveals: pointSources.architecturalReveals.features.length,
    structuralFacadeFrames: pointSources.structuralFacadeFrames.features.length
  };
  return pointSources;
}

function centeredRectanglePolygon(center, widthLng, heightLat, offsetLng = 0, offsetLat = 0) {
  const lng = center[0] + offsetLng;
  const lat = center[1] + offsetLat;
  const halfW = widthLng / 2;
  const halfH = heightLat / 2;
  return [[
    [lng - halfW, lat - halfH],
    [lng + halfW, lat - halfH],
    [lng + halfW, lat + halfH],
    [lng - halfW, lat + halfH],
    [lng - halfW, lat - halfH]
  ]];
}

function buildPlainBlockPointSources(geojson) {
  const priorityByFootprintId = new Map();
  const mapCenter = map?.getCenter?.();
  const focusCoord = mapCenter ? [mapCenter.lng, mapCenter.lat] : center;
  const entranceFeatures = [];
  const roofFeatures = [];
  const treeFeatures = [];
  const carFeatures = [];
  const lotFeatures = [];
  const patioFeatures = [];
  const entryPathFeatures = [];
  const signPanelFeatures = [];
  const parkingStripeFeatures = [];
  const streetlightFeatures = [];
  const roofEquipmentFeatures = [];
  const roofRidgeFeatures = [];
  const balconyRailFeatures = [];
  const porchPadFeatures = [];
  const skylightPanelFeatures = [];
  const facadeSpineFeatures = [];
  const yardFenceFeatures = [];
  const facadePanelFeatures = [];
  const storefrontGlassFeatures = [];
  const sidewalkHaloFeatures = [];
  const roofGardenFeatures = [];
  const entryCanopyFeatures = [];
  const roofCornerDotFeatures = [];
  const windowLightDotFeatures = [];
  const curbEdgeLineFeatures = [];
  const roofParapetFeatures = [];
  const awningDotFeatures = [];
  const serviceBoxFeatures = [];
  const plazaDotFeatures = [];
  const solarPanelFeatures = [];
  const loadingBayFeatures = [];
  const facadeShadowStripFeatures = [];
  const activityDotFeatures = [];
  const terraceRailFeatures = [];
  const roofPoolPanelFeatures = [];
  const drivewayLineFeatures = [];
  const planterStripFeatures = [];
  const billboardPanelFeatures = [];
  const facadeInsetFeatures = [];
  const structuralBayFeatures = [];
  const structuralRecessFeatures = [];
  const structuralPlinthFeatures = [];
  const parkingDeckOpeningFeatures = [];
  const storefrontBayFeatures = [];
  const visibleWindowBayFeatures = [];
  const visibleWindowGridFeatures = [];
  const visibleArchitectureRibFeatures = [];
  const visibleStorefrontEntryFeatures = [];
  const visibleFloorBandFeatures = [];
  const obviousFacadePlateFeatures = [];
  const architecturalProjectionFeatures = [];
  const architecturalSetbackFeatures = [];
  const architecturalPodiumFeatures = [];
  const architecturalRevealFeatures = [];
  const structuralFacadeFrameFeatures = [];
  (geojson.features || []).forEach((feature) => {
    if (!shouldSkinPlainBlock(feature)) return;
    const centroid = featureCentroid(feature.geometry);
    const bounds = featureBounds(feature.geometry);
    if (!centroid || !bounds) return;
    const footprintWidth = bounds.maxLng - bounds.minLng;
    const footprintDepth = bounds.maxLat - bounds.minLat;
    if (footprintWidth <= 0 || footprintDepth <= 0) return;
    const properties = feature.properties || {};
    const numericId = Math.abs(Number(String(properties.id || '').replace(/[^\d]/g, '')) || 0);
    const height = Number(properties.height || 0);
    const focusDistance = distanceMeters(centroid, focusCoord);
    const visualPriority =
      (properties.realWorldSignature ? 80 : 0)
      + (/Mapbox rendered POI|Austin district context|Real-world Austin/i.test(properties.contextSource || '') ? 34 : 0)
      + (properties.category === 'storefront' ? 24 : 0)
      + (properties.category === 'hotel' || properties.category === 'office' ? 20 : 0)
      + Math.min(26, height / 4)
      + Math.max(0, 28 - focusDistance / 18);
    priorityByFootprintId.set(String(properties.id || ''), visualPriority);
    const lngOffset = 0.000055 + (numericId % 5) * 0.000008;
    const latOffset = 0.000045 + (numericId % 7) * 0.000006;
    const entryPoint = [centroid[0] - lngOffset * 0.9, centroid[1] - latOffset * 0.72];
    sidewalkHaloFeatures.push({
      type: 'Feature',
      properties: {
        id: properties.id,
        color: height <= 30 ? '#435f4b' : '#56606b',
        opacity: height <= 30 ? 0.28 : 0.22
      },
      geometry: {
        type: 'Polygon',
        coordinates: centeredRectanglePolygon(centroid, 0.00022, 0.00015, 0, 0)
      }
    });
    entranceFeatures.push({
      type: 'Feature',
      properties: {
        id: properties.id,
        category: properties.category,
        color: properties.baseColor || '#ffc35f',
        halo: properties.windowColor || '#fff3bf'
      },
      geometry: { type: 'Point', coordinates: centroid }
    });
    entryPathFeatures.push({
      type: 'Feature',
      properties: { id: properties.id, color: properties.trimColor || '#f0dcc0' },
      geometry: { type: 'LineString', coordinates: [entryPoint, centroid] }
    });
    entryCanopyFeatures.push({
      type: 'Feature',
      properties: {
        id: properties.id,
        baseHeight: Math.min(Math.max(height * 0.18, 1.6), 4.6),
        height: Math.min(Math.max(height * 0.18, 1.6), 4.6) + 0.36,
        color: properties.category === 'storefront' ? '#ffd65f' : (properties.roofColor || '#6d5740'),
        opacity: 0.78
      },
      geometry: {
        type: 'Polygon',
        coordinates: footprintRect(bounds, 0.18, 0.42, 0.03, 0.12)
      }
    });
    if (height <= 42) {
      for (let dot = 0; dot < 3; dot += 1) {
        awningDotFeatures.push({
          type: 'Feature',
          properties: {
            id: `${properties.id}-awning-${dot}`,
            color: properties.category === 'storefront' ? '#ffd95a' : (properties.baseColor || '#f2c590'),
            radius: 1.35
          },
          geometry: {
            type: 'Point',
            coordinates: [
              centroid[0] - lngOffset * 0.54 + dot * lngOffset * 0.36,
              centroid[1] - latOffset * 0.72
            ]
          }
        });
      }
    }
    curbEdgeLineFeatures.push({
      type: 'Feature',
      properties: { id: properties.id, color: height <= 32 ? '#c8d2c1' : '#98a8b2' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [centroid[0] - lngOffset * 1.72, centroid[1] - latOffset * 1.34],
          [centroid[0] + lngOffset * 1.72, centroid[1] - latOffset * 1.34]
        ]
      }
    });
    drivewayLineFeatures.push({
      type: 'Feature',
      properties: { id: properties.id, color: height <= 34 ? '#b6c0bd' : '#7f8a92' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [centroid[0] + lngOffset * 1.08, centroid[1] - latOffset * 1.24],
          [centroid[0] + lngOffset * 1.08, centroid[1] - latOffset * 0.28]
        ]
      }
    });
    planterStripFeatures.push({
      type: 'Feature',
      properties: {
        id: properties.id,
        color: numericId % 2 === 0 ? '#4fa45a' : '#6f8b56',
        opacity: height <= 34 ? 0.48 : 0.34
      },
      geometry: {
        type: 'Polygon',
        coordinates: centeredRectanglePolygon(centroid, 0.00018, 0.000026, -lngOffset * 0.28, latOffset * 1.18)
      }
    });
    if (height <= 52 && numericId % 2 === 0) {
      loadingBayFeatures.push({
        type: 'Feature',
        properties: {
          id: properties.id,
          color: properties.category === 'storefront' ? '#2e3f48' : '#3f4448',
          opacity: 0.54
        },
        geometry: {
          type: 'Polygon',
          coordinates: centeredRectanglePolygon(centroid, 0.00007, 0.000032, lngOffset * 1.18, latOffset * 0.78)
        }
      });
    }
    for (let activity = 0; activity < (height <= 34 ? 3 : 2); activity += 1) {
      activityDotFeatures.push({
        type: 'Feature',
        properties: {
          id: `${properties.id}-activity-${activity}`,
          color: ['#f7d46d', '#62c6a4', '#d86b5f'][activity % 3],
          radius: activity === 0 ? 1.35 : 1.05
        },
        geometry: {
          type: 'Point',
          coordinates: [
            centroid[0] - lngOffset * 1.34 + activity * lngOffset * 0.52,
            centroid[1] - latOffset * 1.28
          ]
        }
      });
    }
    if (height <= 30) {
      roofRidgeFeatures.push({
        type: 'Feature',
        properties: { id: properties.id, color: properties.roofColor || '#5b5143' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [centroid[0] - lngOffset * 0.62, centroid[1]],
            [centroid[0] + lngOffset * 0.62, centroid[1]]
          ]
        }
      });
      porchPadFeatures.push({
        type: 'Feature',
        properties: {
          id: properties.id,
          color: numericId % 2 === 0 ? '#e8c68f' : '#d6b685',
          outline: properties.trimColor || '#ffe4b4',
          opacity: 0.56
        },
        geometry: {
          type: 'Polygon',
          coordinates: centeredRectanglePolygon(centroid, 0.000052, 0.000034, -lngOffset * 1.08, -latOffset * 0.84)
        }
      });
      yardFenceFeatures.push({
        type: 'Feature',
        properties: { id: properties.id, color: numericId % 3 === 0 ? '#f0d6a0' : '#c9a778' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [centroid[0] - lngOffset * 1.52, centroid[1] + latOffset * 1.15],
            [centroid[0] + lngOffset * 1.52, centroid[1] + latOffset * 1.15],
            [centroid[0] + lngOffset * 1.52, centroid[1] - latOffset * 1.15]
          ]
        }
      });
    }
    if (height > 30 && height < 74) {
      for (let rail = 0; rail < 2; rail += 1) {
        const railLat = centroid[1] + (rail === 0 ? latOffset * 0.42 : -latOffset * 0.42);
        balconyRailFeatures.push({
          type: 'Feature',
          properties: { id: `${properties.id}-rail-${rail}`, color: properties.windowColor || '#d8ffff' },
          geometry: {
            type: 'LineString',
            coordinates: footprintLine(bounds, 0.16, rail === 0 ? 0.34 : 0.66, 0.84, rail === 0 ? 0.34 : 0.66)
          }
        });
      }
    }
    if (height >= 22 && height < 220) {
      const spineCount = height >= 48 ? 4 : 3;
      for (let spine = 0; spine < spineCount; spine += 1) {
        const frac = spineCount === 1 ? 0 : spine / (spineCount - 1);
        const spineLngFrac = 0.22 + 0.56 * frac;
        facadeSpineFeatures.push({
          type: 'Feature',
          properties: {
            id: `${properties.id}-spine-${spine}`,
            color: spine % 2 === 0
              ? (properties.windowColor || '#dceff2')
              : (properties.material === 'warmWood'
                ? '#5d3925'
                : ['brick', 'residentialBrick', 'softTerracotta', 'retailBrick'].includes(properties.material)
                ? '#7d3528'
                : ['paleConcrete', 'tanStone', 'limestone', 'civicLimestone', 'hotelStoneGlass'].includes(properties.material)
                ? '#8f9189'
                : '#87bfc2')
          },
          geometry: {
            type: 'LineString',
            coordinates: footprintLine(bounds, spineLngFrac, 0.18, spineLngFrac, 0.82)
          }
        });
      }
    }
    if (height >= 12 && height < 220) {
      const panelCount = height >= 72 ? 6 : height >= 46 ? 5 : 3;
      const isBrickMaterial = ['brick', 'residentialBrick', 'softTerracotta', 'retailBrick', 'historicMasonry', 'entertainmentStorefront'].includes(properties.material);
      const isWoodMaterial = properties.material === 'warmWood';
      const isConcreteMaterial = ['paleConcrete', 'tanStone', 'limestone', 'civicLimestone', 'hotelStoneGlass'].includes(properties.material);
      const isHistoricMaterial = properties.material === 'historicMasonry';
      const isEntertainmentMaterial = properties.material === 'entertainmentStorefront';
      const panelColor = isBrickMaterial
        ? (isHistoricMaterial ? '#caa88d' : isEntertainmentMaterial ? '#b95d45' : '#b85f47')
        : isWoodMaterial
        ? '#915f39'
        : isConcreteMaterial
        ? '#c8c4ba'
        : ['storefrontWarm', 'officeGlass', 'signatureBlueGlass'].includes(properties.material)
        ? '#8ed7d2'
        : (properties.windowColor || '#ecfff8');
      const insetColor = isBrickMaterial
        ? (isHistoricMaterial ? '#7f5d48' : isEntertainmentMaterial ? '#7c3a31' : '#8b3d30')
        : isWoodMaterial
        ? '#6d442c'
        : isConcreteMaterial
        ? '#8f9189'
        : (properties.windowColor || '#d8ffff');
      const structuralColor = isBrickMaterial
        ? (isHistoricMaterial ? '#ead9c2' : isEntertainmentMaterial ? '#f1d6aa' : '#7f382d')
        : isWoodMaterial
        ? '#654128'
        : isConcreteMaterial
        ? '#aaa49a'
        : ['signatureBlueGlass', 'officeGlass', 'midriseGlass'].includes(properties.material)
        ? '#dff8f9'
        : properties.material === 'hotelStoneGlass'
        ? '#f2e6cf'
        : '#b8b3a6';
      const recessColor = isBrickMaterial
        ? (isHistoricMaterial ? '#6f5948' : isEntertainmentMaterial ? '#51302a' : '#5f2c25')
        : isWoodMaterial
        ? '#49301f'
        : isConcreteMaterial
        ? '#74766f'
        : ['signatureBlueGlass', 'officeGlass', 'midriseGlass'].includes(properties.material)
        ? '#548f9c'
        : '#6f766f';
      const isGlassLikeMaterial = ['creamGlass', 'midriseGlass', 'storefrontWarm', 'signatureBlueGlass', 'officeGlass', 'hotelStoneGlass'].includes(properties.material);
      const isRetailLikeMaterial = properties.category === 'storefront' || properties.material === 'storefrontWarm' || isEntertainmentMaterial || properties.material === 'retailBrick';
      const strongWindowColor = isGlassLikeMaterial
        ? (properties.material === 'hotelStoneGlass' ? '#c6fbff' : properties.material === 'signatureBlueGlass' ? '#91e8f8' : '#8ee3ed')
        : isBrickMaterial
        ? (isHistoricMaterial ? '#f5d3a4' : isEntertainmentMaterial ? '#ffd08a' : '#ffc17f')
        : isWoodMaterial
        ? '#e0a260'
        : isConcreteMaterial
        ? '#6eaeba'
        : (properties.windowColor || '#75b9c0');
      const strongRibColor = isGlassLikeMaterial
        ? (properties.material === 'hotelStoneGlass' ? '#fff2d7' : '#f7fff7')
        : isBrickMaterial
        ? (isHistoricMaterial ? '#c8946c' : '#62271f')
        : isWoodMaterial
        ? '#4f2f1d'
        : isConcreteMaterial
        ? '#777d77'
        : structuralColor;
      const visibleBayCount = height >= 150 ? 9 : height >= 92 ? 7 : height >= 58 ? 6 : height >= 30 ? 5 : 4;
      const visibleBayWidth = Math.max(0.06, Math.min(0.105, 0.52 / visibleBayCount));
      const skinFaces = [
        { key: 'front', rect: (start, end) => footprintFrontSkinRect(bounds, start, end, -0.014, 0.022) },
        { key: 'back', rect: (start, end) => footprintBackSkinRect(bounds, start, end, 0.978, 1.014) },
        { key: 'left', rect: (start, end) => footprintSideSkinRect(bounds, start, end, -0.014, 0.022) },
        { key: 'right', rect: (start, end) => footprintRightSideSkinRect(bounds, start, end, 0.978, 1.014) }
      ];
      for (let bay = 0; bay < visibleBayCount; bay += 1) {
        const x = 0.12 + bay * (0.76 / visibleBayCount);
        const end = Math.min(x + visibleBayWidth, 0.88);
        skinFaces.forEach((face, faceIndex) => {
          if (faceIndex > 1 && (height < 34 || bay % 2 !== 0)) return;
          visibleWindowBayFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-visible-window-bay-${face.key}-${bay}`,
              baseHeight: Math.max(height * (height <= 30 ? 0.14 : 0.1), 1),
                height: Math.max(height * (height >= 58 ? 0.98 : 0.88), 3.8),
              color: bay % 2 === 0 ? strongWindowColor : insetColor,
              opacity: faceIndex < 2
                ? (isGlassLikeMaterial ? 0.92 : isRetailLikeMaterial ? 0.9 : 0.86)
                : (isGlassLikeMaterial ? 0.72 : 0.66)
            },
            geometry: {
              type: 'Polygon',
              coordinates: face.rect(x, end)
            }
          });
        });
      }
      const gridColumns = height >= 150 ? 8 : height >= 92 ? 7 : height >= 58 ? 6 : height >= 30 ? 4 : 3;
      const gridRows = height >= 150 ? 15 : height >= 92 ? 11 : height >= 58 ? 8 : height >= 30 ? 6 : 4;
      const gridWindowColor = isGlassLikeMaterial
        ? '#7fe9f8'
        : isBrickMaterial
        ? '#ffc37b'
        : isWoodMaterial
        ? '#e2a05d'
        : isConcreteMaterial
        ? '#83c4ca'
        : '#78bac0';
      const gridShadeColor = isGlassLikeMaterial
        ? '#1d7e96'
        : isBrickMaterial
        ? '#5c241c'
        : isWoodMaterial
        ? '#4b2d1b'
        : isConcreteMaterial
        ? '#5f6661'
        : '#4f746f';
      const gridFaces = [
        { key: 'front', rect: (start, end) => footprintFrontSkinRect(bounds, start, end, -0.038, 0.012) },
        { key: 'back', rect: (start, end) => footprintBackSkinRect(bounds, start, end, 0.988, 1.038) },
        { key: 'left', rect: (start, end) => footprintSideSkinRect(bounds, start, end, -0.038, 0.012) },
        { key: 'right', rect: (start, end) => footprintRightSideSkinRect(bounds, start, end, 0.988, 1.038) }
      ];
      for (let row = 0; row < gridRows; row += 1) {
        const rowBase = Math.max(height * 0.13 + row * Math.max(1.8, height * 0.06), 1.4);
        if (rowBase >= height - 1.4) break;
        const rowTop = Math.min(rowBase + Math.max(1.35, Math.min(2.65, height * 0.028)), height - 0.4);
        for (let col = 0; col < gridColumns; col += 1) {
          if ((row + col + numericId) % 5 === 0 && !isGlassLikeMaterial) continue;
          const start = 0.14 + col * (0.72 / gridColumns);
          const end = Math.min(start + Math.max(0.058, 0.52 / gridColumns), 0.86);
          gridFaces.forEach((face, faceIndex) => {
            if (faceIndex > 1 && (height < 42 || col % 2 !== 0)) return;
            visibleWindowGridFeatures.push({
              type: 'Feature',
              properties: {
                id: `${properties.id}-window-grid-${face.key}-${row}-${col}`,
                baseHeight: rowBase,
                height: rowTop,
                color: (row + col) % 4 === 0 ? gridShadeColor : gridWindowColor,
                priority: height >= 58 ? 86 : 58
              },
              geometry: {
                type: 'Polygon',
                coordinates: face.rect(start, end)
              }
            });
          });
        }
      }
      const ribCount = height >= 150 ? 7 : height >= 72 ? 5 : height >= 40 ? 4 : 3;
      for (let rib = 0; rib < ribCount; rib += 1) {
        const x = 0.11 + rib * (0.78 / Math.max(ribCount - 1, 1));
        skinFaces.forEach((face, faceIndex) => {
              if (faceIndex > 1 && rib % 2 !== 0) return;
              visibleArchitectureRibFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-visible-rib-${face.key}-${rib}`,
              baseHeight: Math.max(height * 0.05, 0.8),
                height: Math.max(height * 0.995, 3.8),
              color: strongRibColor,
              opacity: faceIndex < 2
                ? (isGlassLikeMaterial ? 0.82 : isBrickMaterial || isWoodMaterial || isConcreteMaterial ? 0.86 : 0.76)
                : (isGlassLikeMaterial ? 0.62 : 0.66)
            },
            geometry: {
              type: 'Polygon',
                coordinates: face.rect(x, Math.min(x + 0.072, 0.9))
            }
          });
        });
      }
      const floorBandCount = height >= 150 ? 10 : height >= 76 ? 7 : height >= 42 ? 5 : 3;
      for (let band = 0; band < floorBandCount; band += 1) {
        const bandBase = Math.max(height * (0.16 + band * 0.105), 1.45);
        const bandHeight = Math.min(height, bandBase + Math.max(0.85, Math.min(1.85, height * 0.026)));
        const bandColor = isGlassLikeMaterial
          ? (band % 2 === 0 ? '#f5fff8' : '#5eb8c5')
          : isBrickMaterial
          ? (band % 2 === 0 ? '#61271f' : '#f1b375')
          : isWoodMaterial
          ? (band % 2 === 0 ? '#4f2f1d' : '#cb8a4d')
          : isConcreteMaterial
          ? (band % 2 === 0 ? '#777d77' : '#f0eadc')
          : '#d8d0bf';
        skinFaces.forEach((face, faceIndex) => {
          if (faceIndex > 1 && band > 1) return;
          visibleFloorBandFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-visible-floor-band-${face.key}-${band}`,
              baseHeight: bandBase,
              height: bandHeight,
              color: bandColor,
              opacity: faceIndex < 2 ? 0.86 : 0.68
            },
            geometry: {
              type: 'Polygon',
              coordinates: face.rect(0.1, 0.9)
            }
          });
        });
      }
      const needsObviousPlainFacade = !isGlassLikeMaterial || height < 58 || isRetailLikeMaterial;
      if (needsObviousPlainFacade) {
        const plateColor = isBrickMaterial
          ? (isHistoricMaterial ? '#d5a67f' : isEntertainmentMaterial ? '#d35c3d' : '#b94d38')
          : isWoodMaterial
          ? '#9c633b'
          : isConcreteMaterial
          ? '#8dbdc5'
          : isRetailLikeMaterial
          ? '#76c8c4'
          : '#c9b08a';
        const plateInsetColor = isBrickMaterial
          ? '#5f2d25'
          : isWoodMaterial
          ? '#4e3120'
          : isConcreteMaterial
          ? '#eef4ea'
          : '#f0e2c6';
        const plateSegments = [
          { start: 0.12, end: 0.42, color: plateColor },
          { start: 0.56, end: 0.86, color: plateInsetColor }
        ];
        plateSegments.forEach((segment, segmentIndex) => {
          skinFaces.forEach((face, faceIndex) => {
            if (faceIndex > 1 && segmentIndex > 0 && height < 36) return;
            obviousFacadePlateFeatures.push({
              type: 'Feature',
              properties: {
                id: `${properties.id}-obvious-facade-plate-${face.key}-${segmentIndex}`,
                baseHeight: Math.max(height * 0.1, 0.9),
                height: Math.max(height * 0.9, 3.8),
                color: segment.color,
                opacity: faceIndex < 2 ? 0.78 : 0.6,
                priority: needsObviousPlainFacade ? 35 : 0
              },
              geometry: {
                type: 'Polygon',
                coordinates: face.rect(segment.start, segment.end)
              }
            });
          });
        });
        const projectionColor = isBrickMaterial
          ? (isHistoricMaterial ? '#b57a57' : '#9d3e2e')
          : isWoodMaterial
          ? '#7d4d2d'
          : isConcreteMaterial
          ? '#76acb8'
          : isRetailLikeMaterial
          ? '#3d9698'
          : '#b7996f';
        const projectionTop = Math.max(Math.min(height * 0.72, height - 0.6), Math.min(height, 4.5));
        [
          { id: 'front-bay', base: 0.6, height: projectionTop, color: projectionColor, rect: footprintRect(bounds, 0.24, 0.44, -0.16, 0.035) },
          { id: 'front-entry', base: 0.35, height: Math.min(Math.max(height * 0.32, 4), 9), color: isRetailLikeMaterial ? '#9debe4' : plateInsetColor, rect: footprintRect(bounds, 0.55, 0.78, -0.18, 0.04) },
          { id: 'right-bay', base: 0.8, height: Math.max(Math.min(height * 0.64, height - 0.8), 4.2), color: projectionColor, rect: footprintRect(bounds, 0.965, 1.14, 0.24, 0.46) }
        ].forEach((projection) => {
          architecturalProjectionFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-architectural-projection-${projection.id}`,
              baseHeight: projection.base,
              height: projection.height,
              color: projection.color,
              opacity: isRetailLikeMaterial ? 0.86 : 0.74,
              priority: 50
            },
            geometry: {
              type: 'Polygon',
              coordinates: projection.rect
            }
          });
        });
      }
      if (height >= 46 && !isGlassLikeMaterial) {
        const tallFacadeColor = isBrickMaterial
          ? '#7d3026'
          : isWoodMaterial
          ? '#5a3724'
          : isConcreteMaterial
          ? '#6da7b2'
          : '#96774f';
        const tallGlassColor = isConcreteMaterial ? '#bdebf0' : '#e9f7ef';
        const finHeight = Math.max(height * 0.96, 12);
        [
          { id: 'front-left-fin', color: tallFacadeColor, opacity: 0.86, rect: footprintRect(bounds, 0.14, 0.22, -0.26, 0.05), base: 0.6, height: finHeight },
          { id: 'front-right-fin', color: tallFacadeColor, opacity: 0.86, rect: footprintRect(bounds, 0.78, 0.86, -0.26, 0.05), base: 0.6, height: finHeight },
          { id: 'front-glass-wall', color: tallGlassColor, opacity: 0.82, rect: footprintRect(bounds, 0.34, 0.66, -0.24, 0.045), base: Math.max(height * 0.12, 1.6), height: Math.max(height * 0.92, 10) },
          { id: 'right-vertical-fin', color: tallFacadeColor, opacity: 0.78, rect: footprintRect(bounds, 0.97, 1.24, 0.16, 0.25), base: 0.8, height: Math.max(height * 0.9, 9) },
          { id: 'right-window-wall', color: tallGlassColor, opacity: 0.72, rect: footprintRect(bounds, 0.965, 1.2, 0.48, 0.72), base: Math.max(height * 0.14, 1.8), height: Math.max(height * 0.88, 9) },
          { id: 'front-podium-wing', color: isBrickMaterial ? '#cf7352' : isConcreteMaterial ? '#d8d3c7' : '#c9a46f', opacity: 0.84, rect: footprintRect(bounds, 0.2, 0.82, -0.28, 0.08), base: 0.2, height: Math.min(Math.max(height * 0.24, 6), 15) }
        ].forEach((projection) => {
          architecturalProjectionFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-tall-structure-${projection.id}`,
              baseHeight: projection.base,
              height: projection.height,
              color: projection.color,
              opacity: projection.opacity,
              priority: 110
            },
            geometry: {
              type: 'Polygon',
              coordinates: projection.rect
            }
          });
        });
      }
      if (height >= 32) {
        const setbackWallColor = isGlassLikeMaterial
          ? '#87cbd3'
          : isBrickMaterial
          ? '#b85a3d'
          : isWoodMaterial
          ? '#8f5a35'
          : isConcreteMaterial
          ? '#d4cec0'
          : '#c9aa78';
        const setbackAccentColor = isGlassLikeMaterial
          ? '#d9ffff'
          : isBrickMaterial
          ? '#f0c090'
          : isWoodMaterial
          ? '#d4a26b'
          : isConcreteMaterial
          ? '#8dbdc5'
          : '#f1dfbc';
        [
          {
            id: 'upper-setback-core',
            base: Math.max(height * 0.58, 8),
            height: Math.max(height * 0.96, 12),
            color: setbackWallColor,
            rect: footprintRect(bounds, 0.24, 0.76, 0.24, 0.76),
            priority: height >= 60 ? 95 : 55
          },
          {
            id: 'upper-glass-court',
            base: Math.max(height * 0.62, 8.5),
            height: Math.max(height * 0.92, 11),
            color: setbackAccentColor,
            rect: footprintRect(bounds, 0.34, 0.66, 0.08, 0.22),
            priority: height >= 60 ? 92 : 52
          },
          {
            id: 'corner-mass-a',
            base: Math.max(height * 0.18, 3.2),
            height: Math.max(height * 0.72, 7),
            color: setbackWallColor,
            rect: footprintRect(bounds, -0.08, 0.18, -0.08, 0.18),
            priority: 72
          },
          {
            id: 'corner-mass-b',
            base: Math.max(height * 0.2, 3.5),
            height: Math.max(height * 0.68, 7),
            color: setbackAccentColor,
            rect: footprintRect(bounds, 0.82, 1.08, 0.82, 1.08),
            priority: 68
          }
        ].forEach((setback) => {
          architecturalSetbackFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-architectural-setback-${setback.id}`,
              baseHeight: setback.base,
              height: setback.height,
              color: setback.color,
              priority: setback.priority
            },
            geometry: {
              type: 'Polygon',
              coordinates: setback.rect
            }
          });
        });
      }
      if (height >= 16) {
        const podiumWallColor = isGlassLikeMaterial
          ? '#6fb9c4'
          : isBrickMaterial
          ? (isEntertainmentMaterial ? '#c74f37' : '#a84934')
          : isWoodMaterial
          ? '#855331'
          : isConcreteMaterial
          ? '#cfc8b8'
          : '#caa96f';
        const podiumGlassColor = isRetailLikeMaterial
          ? '#83eee6'
          : isGlassLikeMaterial
          ? '#baf8ff'
          : isConcreteMaterial
          ? '#9fd2d8'
          : '#f0d6aa';
        const podiumHeight = Math.min(Math.max(height * 0.18, 4.8), isRetailLikeMaterial ? 9.5 : 12.5);
        [
          {
            id: 'streetwall-front',
            base: 0,
            height: podiumHeight,
            color: podiumWallColor,
            rect: footprintRect(bounds, 0.02, 0.98, -0.18, 0.12),
            priority: isRetailLikeMaterial ? 96 : 74
          },
          {
            id: 'streetwall-right',
            base: 0,
            height: Math.max(podiumHeight * 0.9, 4.2),
            color: podiumWallColor,
            rect: footprintRect(bounds, 0.88, 1.18, 0.02, 0.98),
            priority: 68
          },
          {
            id: 'glass-lobby-front',
            base: 0.35,
            height: Math.max(podiumHeight * 0.78, 3.8),
            color: podiumGlassColor,
            rect: footprintRect(bounds, 0.18, 0.48, -0.24, 0.08),
            priority: isRetailLikeMaterial ? 110 : 82
          },
          {
            id: 'entry-volume-front',
            base: 0.15,
            height: Math.max(podiumHeight * 0.92, 4.4),
            color: isRetailLikeMaterial ? '#f3c66d' : podiumGlassColor,
            rect: footprintRect(bounds, 0.54, 0.78, -0.26, 0.1),
            priority: isRetailLikeMaterial ? 116 : 80
          },
          {
            id: 'corner-entry-anchor',
            base: 0,
            height: Math.max(podiumHeight * 1.12, 5.2),
            color: isBrickMaterial ? '#e08055' : isConcreteMaterial ? '#e4dcc9' : '#8ad8d4',
            rect: footprintRect(bounds, -0.1, 0.16, -0.1, 0.16),
            priority: 92
          }
        ].forEach((podium) => {
          architecturalPodiumFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-architectural-podium-${podium.id}`,
              baseHeight: podium.base,
              height: podium.height,
              color: podium.color,
              priority: podium.priority
            },
            geometry: {
              type: 'Polygon',
              coordinates: podium.rect
            }
          });
        });
      }
      if (height >= 18) {
        const revealColor = isGlassLikeMaterial
          ? '#28596a'
          : isBrickMaterial
          ? '#51261f'
          : isWoodMaterial
          ? '#3f2819'
          : isConcreteMaterial
          ? '#6f7671'
          : '#7b6547';
        const revealHighlight = isGlassLikeMaterial
          ? '#d7ffff'
          : isBrickMaterial
          ? '#f0b67d'
          : isWoodMaterial
          ? '#c89058'
          : isConcreteMaterial
          ? '#ecf1e8'
          : '#f1dfbc';
        const revealRows = height >= 72 ? 3 : height >= 38 ? 2 : 1;
        const revealColumns = height >= 58 ? 3 : 2;
        for (let row = 0; row < revealRows; row += 1) {
          const rowBase = Math.max(height * (0.18 + row * 0.2), 1.6);
          const rowTop = Math.min(height * (0.25 + row * 0.2), height - 0.4);
          for (let col = 0; col < revealColumns; col += 1) {
            const left = 0.18 + col * (0.58 / revealColumns);
            const right = Math.min(left + Math.max(0.11, 0.34 / revealColumns), 0.84);
            architecturalRevealFeatures.push({
              type: 'Feature',
              properties: {
                id: `${properties.id}-architectural-reveal-front-${row}-${col}`,
                baseHeight: rowBase,
                height: Math.max(rowTop, rowBase + 1.2),
                color: col % 2 === 0 ? revealColor : revealHighlight,
                priority: height >= 58 ? 90 : 62
              },
              geometry: {
                type: 'Polygon',
                coordinates: footprintRect(bounds, left, right, -0.285, 0.035)
              }
            });
            if (height >= 34 && col < 2) {
              architecturalRevealFeatures.push({
                type: 'Feature',
                properties: {
                  id: `${properties.id}-architectural-reveal-side-${row}-${col}`,
                  baseHeight: rowBase,
                  height: Math.max(rowTop, rowBase + 1.2),
                  color: col % 2 === 0 ? revealColor : revealHighlight,
                  priority: height >= 58 ? 82 : 54
                },
                geometry: {
                  type: 'Polygon',
                  coordinates: footprintRect(bounds, 0.965, 1.22, left, right)
                }
              });
            }
          }
        }
      }
      if (height >= 18) {
        const frameColor = isGlassLikeMaterial
          ? '#e8fbf8'
          : isBrickMaterial
          ? (isHistoricMaterial ? '#d7b28f' : '#713024')
          : isWoodMaterial
          ? '#5b3823'
          : isConcreteMaterial
          ? '#96978f'
          : '#8e7754';
        const frameAccentColor = isGlassLikeMaterial
          ? '#78cbd4'
          : isBrickMaterial
          ? (isEntertainmentMaterial ? '#ef8a56' : '#cf704d')
          : isWoodMaterial
          ? '#c58b55'
          : isConcreteMaterial
          ? '#e4dfd0'
          : '#d8b977';
        const frameHeight = Math.max(height * (height >= 58 ? 0.92 : 0.82), 5.4);
        const lintelBase = Math.max(frameHeight - Math.max(2.2, Math.min(5.4, height * 0.08)), 2.2);
        [
          {
            id: 'front-left-pier',
            base: 0.45,
            height: frameHeight,
            color: frameColor,
            rect: footprintRect(bounds, 0.08, 0.16, -0.315, 0.055),
            priority: 116
          },
          {
            id: 'front-right-pier',
            base: 0.45,
            height: frameHeight,
            color: frameColor,
            rect: footprintRect(bounds, 0.84, 0.92, -0.315, 0.055),
            priority: 116
          },
          {
            id: 'front-lintel',
            base: lintelBase,
            height: frameHeight,
            color: frameAccentColor,
            rect: footprintRect(bounds, 0.12, 0.88, -0.325, 0.065),
            priority: 112
          },
          {
            id: 'front-entry-frame',
            base: 0.15,
            height: Math.min(Math.max(height * 0.3, 4.8), 10.5),
            color: isRetailLikeMaterial ? '#8be7df' : frameAccentColor,
            rect: footprintRect(bounds, 0.38, 0.62, -0.35, 0.075),
            priority: isRetailLikeMaterial ? 132 : 104
          }
        ].forEach((frame) => {
          structuralFacadeFrameFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-structural-frame-${frame.id}`,
              baseHeight: frame.base,
              height: frame.height,
              color: frame.color,
              priority: frame.priority
            },
            geometry: {
              type: 'Polygon',
              coordinates: frame.rect
            }
          });
        });
        if (height >= 34) {
          [
            {
              id: 'right-front-pier',
              base: 0.6,
              height: Math.max(height * 0.78, 6),
              color: frameColor,
              rect: footprintRect(bounds, 0.945, 1.245, 0.1, 0.18),
              priority: 94
            },
            {
              id: 'right-back-pier',
              base: 0.6,
              height: Math.max(height * 0.72, 6),
              color: frameAccentColor,
              rect: footprintRect(bounds, 0.945, 1.225, 0.72, 0.82),
              priority: 88
            }
          ].forEach((frame) => {
            structuralFacadeFrameFeatures.push({
              type: 'Feature',
              properties: {
                id: `${properties.id}-structural-frame-${frame.id}`,
                baseHeight: frame.base,
                height: frame.height,
                color: frame.color,
                priority: frame.priority
              },
              geometry: {
                type: 'Polygon',
                coordinates: frame.rect
              }
            });
          });
        }
      }
      if (isRetailLikeMaterial || height <= 34) {
        const entryCount = isRetailLikeMaterial ? 4 : 2;
        for (let entry = 0; entry < entryCount; entry += 1) {
          const x = entryCount === 4 ? 0.14 + entry * 0.18 : 0.32 + entry * 0.18;
          visibleStorefrontEntryFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-visible-storefront-entry-${entry}`,
              baseHeight: 0.25,
              height: Math.min(Math.max(height * 0.3, 4.2), isEntertainmentMaterial ? 9.2 : 7.8),
              color: entry === 1
                ? (isEntertainmentMaterial ? '#7be2d5' : '#8ee9e1')
                : isBrickMaterial
                ? '#e2a36f'
                : isWoodMaterial
                ? '#c9905b'
                : '#dceff2',
              opacity: isRetailLikeMaterial ? 0.9 : 0.68
            },
            geometry: {
              type: 'Polygon',
              coordinates: footprintFrontSkinRect(bounds, x, Math.min(x + 0.13, 0.88), -0.02, 0.038)
            }
          });
        }
      }
      structuralPlinthFeatures.push({
        type: 'Feature',
        properties: {
          id: `${properties.id}-structural-plinth`,
          baseHeight: 0,
          height: Math.min(Math.max(height * 0.14, 1.8), properties.category === 'storefront' ? 4.4 : 5.8),
          color: properties.category === 'storefront'
            ? (properties.baseColor || '#65adb1')
            : isBrickMaterial
            ? '#9f4a36'
            : isWoodMaterial
            ? '#795033'
            : isConcreteMaterial
            ? '#b8b3a8'
            : ['signatureBlueGlass', 'officeGlass', 'midriseGlass'].includes(properties.material)
            ? '#6faeb4'
            : (properties.baseColor || '#bdb6a8'),
          opacity: properties.category === 'storefront' ? 0.68 : 0.48
        },
        geometry: {
          type: 'Polygon',
          coordinates: footprintRect(bounds, 0.04, 0.96, 0.035, 0.33)
        }
      });
      const bayCount = height >= 78 ? 6 : height >= 46 ? 5 : height >= 24 ? 4 : 3;
      for (let bay = 0; bay < bayCount; bay += 1) {
        const x = 0.1 + bay * (0.8 / bayCount);
        const bayWidth = Math.min(0.028, 0.17 / bayCount);
        structuralBayFeatures.push({
          type: 'Feature',
          properties: {
            id: `${properties.id}-structural-bay-front-${bay}`,
            baseHeight: Math.max(height * 0.08, 1),
            height: Math.max(height * 0.98, 3.2),
            color: structuralColor,
            opacity: height >= 72 ? 0.54 : height >= 38 ? 0.46 : 0.4
          },
          geometry: {
            type: 'Polygon',
            coordinates: footprintRect(bounds, x, Math.min(x + bayWidth, 0.9), 0.055, 0.34)
          }
        });
        if (height >= 34 && bay % 2 === 0) {
          structuralBayFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-structural-bay-side-${bay}`,
              baseHeight: Math.max(height * 0.1, 1.2),
              height: Math.max(height * 0.94, 3.2),
              color: structuralColor,
              opacity: height >= 72 ? 0.4 : 0.34
            },
            geometry: {
              type: 'Polygon',
              coordinates: footprintRect(bounds, 0.055, 0.32, x, Math.min(x + bayWidth, 0.9))
            }
          });
        }
      }
      const recessRows = height >= 78 ? 4 : height >= 46 ? 3 : 2;
      for (let row = 0; row < recessRows; row += 1) {
        const y = 0.2 + row * (0.52 / Math.max(recessRows - 1, 1));
        structuralRecessFeatures.push({
          type: 'Feature',
          properties: {
            id: `${properties.id}-recess-row-${row}`,
            baseHeight: Math.max(height * (0.16 + row * 0.16), 1.4),
            height: Math.max(height * (0.2 + row * 0.16), 2.2),
            color: recessColor,
            opacity: ['signatureBlueGlass', 'officeGlass', 'midriseGlass', 'hotelStoneGlass'].includes(properties.material) ? 0.46 : 0.32
          },
          geometry: {
            type: 'Polygon',
            coordinates: footprintRect(bounds, 0.14, 0.86, y, Math.min(y + 0.035, 0.86))
          }
        });
      }
      for (let panel = 0; panel < panelCount; panel += 1) {
        facadePanelFeatures.push({
          type: 'Feature',
          properties: {
            id: `${properties.id}-facade-panel-${panel}`,
            baseHeight: Math.max(1.3, height * 0.16),
            height: Math.max(height - 0.2, 3),
            color: panel % 2 === 0 ? panelColor : insetColor,
            opacity: height >= 72 ? 0.62 : height >= 46 ? 0.56 : 0.46
          },
          geometry: {
            type: 'Polygon',
            coordinates: footprintRect(
              bounds,
              0.14 + panel * (0.7 / panelCount),
              0.14 + panel * (0.7 / panelCount) + Math.min(0.13, 0.56 / panelCount),
              0.06,
              0.36
            )
          }
        });
      }
      const insetCount = height >= 72 ? 5 : height >= 46 ? 4 : 2;
      for (let inset = 0; inset < insetCount; inset += 1) {
        facadeInsetFeatures.push({
          type: 'Feature',
          properties: {
            id: `${properties.id}-inset-${inset}`,
            baseHeight: Math.max(height * 0.22, 2),
            height: Math.max(height * 0.9, 3.8),
            color: insetColor,
            opacity: isBrickMaterial || isWoodMaterial || isConcreteMaterial ? 0.36 : (height >= 46 ? 0.42 : 0.34)
          },
          geometry: {
            type: 'Polygon',
            coordinates: footprintRect(
              bounds,
              0.2 + inset * (0.5 / insetCount),
              0.2 + inset * (0.5 / insetCount) + Math.min(0.12, 0.42 / insetCount),
              0.45,
              0.78
            )
          }
        });
      }
      for (let strip = 0; strip < 2; strip += 1) {
        facadeShadowStripFeatures.push({
          type: 'Feature',
          properties: {
            id: `${properties.id}-shadow-strip-${strip}`,
            baseHeight: Math.max(height * (strip === 0 ? 0.28 : 0.54), 1.8),
            height: Math.max(height * (strip === 0 ? 0.31 : 0.57), 2.1),
            color: isBrickMaterial
              ? '#6e3026'
              : isWoodMaterial
              ? '#4d3021'
              : isConcreteMaterial
              ? '#7e817c'
              : '#273645',
            opacity: height >= 46 ? 0.2 : 0.16
          },
          geometry: {
            type: 'Polygon',
            coordinates: footprintRect(bounds, 0.1, 0.9, strip === 0 ? 0.2 : 0.58, strip === 0 ? 0.25 : 0.63)
          }
        });
      }
      if (height >= 92) {
        const towerShadeColor = isGlassLikeMaterial
          ? '#1f6e82'
          : isBrickMaterial
          ? '#4f211a'
          : isWoodMaterial
          ? '#3e2819'
          : isConcreteMaterial
          ? '#555c58'
          : '#6d5a3d';
        const towerHighlightColor = isGlassLikeMaterial
          ? '#9bf3ff'
          : isBrickMaterial
          ? '#efb06f'
          : isWoodMaterial
          ? '#d58b4d'
          : isConcreteMaterial
          ? '#b9dee1'
          : '#d4b076';
        const verticalPanelCount = height >= 150 ? 5 : 4;
        for (let panel = 0; panel < verticalPanelCount; panel += 1) {
          const start = 0.16 + panel * (0.68 / verticalPanelCount);
          const end = Math.min(start + Math.max(0.052, 0.28 / verticalPanelCount), 0.86);
          facadePanelFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-tower-window-wall-front-${panel}`,
              baseHeight: Math.max(height * 0.12, 2.4),
              height: Math.max(height * 0.94, 14),
              color: panel % 2 === 0 ? towerHighlightColor : towerShadeColor,
              opacity: isGlassLikeMaterial ? 0.78 : 0.66,
              priority: 118
            },
            geometry: {
              type: 'Polygon',
              coordinates: footprintFrontSkinRect(bounds, start, end, -0.028, 0.016)
            }
          });
          if (panel % 2 === 0) {
            facadeInsetFeatures.push({
              type: 'Feature',
              properties: {
                id: `${properties.id}-tower-window-wall-right-${panel}`,
                baseHeight: Math.max(height * 0.14, 2.8),
                height: Math.max(height * 0.9, 12),
                color: towerShadeColor,
                opacity: 0.58,
                priority: 96
              },
              geometry: {
                type: 'Polygon',
                coordinates: footprintRightSideSkinRect(bounds, start, end, 0.99, 1.03)
              }
            });
          }
        }
        for (let side = 0; side < 3; side += 1) {
          const start = 0.18 + side * 0.22;
          facadeShadowStripFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-tower-side-shade-${side}`,
              baseHeight: Math.max(height * (0.2 + side * 0.18), 3),
              height: Math.max(height * (0.24 + side * 0.18), 4),
              color: towerShadeColor,
              opacity: 0.46,
              priority: 104
            },
            geometry: {
              type: 'Polygon',
              coordinates: footprintRightSideSkinRect(bounds, start, Math.min(start + 0.16, 0.9), 0.985, 1.035)
            }
          });
        }
      }
      if (isHistoricMaterial) {
        for (let pilaster = 0; pilaster < 4; pilaster += 1) {
          const x = 0.12 + pilaster * 0.22;
          structuralBayFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-historic-pilaster-${pilaster}`,
              baseHeight: Math.max(height * 0.08, 1),
              height: Math.max(height * 0.98, 3.2),
              color: '#ead9c2',
              opacity: 0.5
            },
            geometry: {
              type: 'Polygon',
              coordinates: footprintRect(bounds, x, Math.min(x + 0.035, 0.9), 0.055, 0.36)
            }
          });
        }
        for (let belt = 0; belt < 3; belt += 1) {
          const y = 0.2 + belt * 0.2;
          facadeShadowStripFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-historic-belt-${belt}`,
              baseHeight: Math.max(height * (0.2 + belt * 0.18), 1.6),
              height: Math.max(height * (0.22 + belt * 0.18), 1.9),
              color: '#7f5d48',
              opacity: 0.28
            },
            geometry: {
              type: 'Polygon',
              coordinates: footprintRect(bounds, 0.09, 0.91, y, Math.min(y + 0.035, 0.86))
            }
          });
        }
      } else if (isBrickMaterial) {
        for (let course = 0; course < 5; course += 1) {
          const y = 0.15 + course * 0.15;
          facadeShadowStripFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-brick-course-${course}`,
              baseHeight: Math.max(height * (0.18 + course * 0.11), 1.6),
              height: Math.max(height * (0.2 + course * 0.11), 1.9),
              color: course % 2 === 0 ? '#793528' : '#a14a35',
              opacity: 0.26
            },
            geometry: {
              type: 'Polygon',
              coordinates: footprintRect(bounds, 0.1, 0.9, y, Math.min(y + 0.035, 0.88))
            }
          });
        }
      } else if (isWoodMaterial) {
        for (let board = 0; board < 4; board += 1) {
          const x = 0.16 + board * 0.18;
          facadeInsetFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-wood-board-${board}`,
              baseHeight: Math.max(height * 0.12, 1.4),
              height: Math.max(height * 0.92, 3.8),
              color: board % 2 === 0 ? '#7b4f30' : '#9a653d',
              opacity: 0.3
            },
            geometry: {
              type: 'Polygon',
              coordinates: footprintRect(bounds, x, Math.min(x + 0.055, 0.88), 0.1, 0.82)
            }
          });
        }
      } else if (isConcreteMaterial) {
        for (let bay = 0; bay < 3; bay += 1) {
          const x = 0.14 + bay * 0.23;
          facadePanelFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-concrete-bay-${bay}`,
              baseHeight: Math.max(height * 0.18, 1.6),
              height: Math.max(height * 0.86, 3.6),
              color: bay % 2 === 0 ? '#bbb7ad' : '#d8d3c7',
              opacity: 0.34
            },
            geometry: {
              type: 'Polygon',
              coordinates: footprintRect(bounds, x, Math.min(x + 0.15, 0.86), 0.12, 0.82)
            }
          });
        }
      } else if (['creamGlass', 'midriseGlass', 'storefrontWarm', 'signatureBlueGlass', 'officeGlass', 'hotelStoneGlass'].includes(properties.material)) {
        const glassBayCount = height >= 72 ? 5 : 3;
        for (let glassBay = 0; glassBay < glassBayCount; glassBay += 1) {
          const x = 0.14 + glassBay * (0.66 / glassBayCount);
          facadePanelFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-glass-bay-${glassBay}`,
              baseHeight: Math.max(height * 0.14, 1.5),
              height: Math.max(height * 0.9, 3.8),
              color: ['signatureBlueGlass', 'officeGlass'].includes(properties.material)
                ? (glassBay % 2 === 0 ? '#6fb8c8' : '#c7fbff')
                : properties.material === 'hotelStoneGlass'
                ? (glassBay % 2 === 0 ? '#8ccfd2' : '#e7ffff')
                : (glassBay % 2 === 0 ? '#8ddbe2' : '#bffcff'),
              opacity: ['signatureBlueGlass', 'officeGlass'].includes(properties.material) ? 0.62 : 0.52
            },
            geometry: {
              type: 'Polygon',
              coordinates: footprintRect(bounds, x, Math.min(x + Math.max(0.075, 0.42 / glassBayCount), 0.86), 0.1, 0.84)
            }
          });
        }
        if (height >= 56) {
          for (let mullion = 0; mullion < 4; mullion += 1) {
            const x = 0.19 + mullion * 0.16;
            facadeInsetFeatures.push({
              type: 'Feature',
              properties: {
                id: `${properties.id}-glass-mullion-${mullion}`,
                baseHeight: Math.max(height * 0.12, 1.6),
                height: Math.max(height * 0.95, 4),
                color: ['signatureBlueGlass', 'officeGlass'].includes(properties.material) ? '#edf6ef' : '#9ed4d2',
                opacity: ['signatureBlueGlass', 'officeGlass'].includes(properties.material) ? 0.34 : 0.26
              },
              geometry: {
                type: 'Polygon',
                coordinates: footprintRect(bounds, x, Math.min(x + 0.022, 0.88), 0.09, 0.86)
              }
            });
          }
        }
      }
      if (properties.category === 'storefront' || properties.material === 'storefrontWarm' || isEntertainmentMaterial) {
        for (let pane = 0; pane < 5; pane += 1) {
          const x = 0.1 + pane * 0.145;
          storefrontGlassFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-storefront-pane-${pane}`,
              baseHeight: 0.55,
              height: Math.min(Math.max(height * 0.32, 4), isEntertainmentMaterial ? 8.4 : 7.2),
              color: isEntertainmentMaterial
                ? (pane === 1 || pane === 2 ? '#7be2d5' : '#f2d39e')
                : (pane === 1 || pane === 2 || pane === 3 ? '#85e2df' : '#b9fff7'),
              opacity: 0.86
            },
            geometry: {
              type: 'Polygon',
              coordinates: footprintFrontSkinRect(bounds, x, Math.min(x + 0.125, 0.88), -0.024, 0.044)
            }
          });
        }
        for (let bay = 0; bay < 4; bay += 1) {
          const x = 0.12 + bay * 0.185;
          storefrontBayFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-storefront-structural-bay-${bay}`,
              baseHeight: 0.85,
              height: Math.min(Math.max(height * 0.34, 4.4), 8),
              color: isEntertainmentMaterial ? (bay === 1 ? '#51302a' : '#e3a766') : (bay === 1 ? '#234f52' : '#78d8d2')
            },
            geometry: {
              type: 'Polygon',
              coordinates: footprintFrontSkinRect(bounds, x, Math.min(x + 0.13, 0.88), -0.028, 0.05)
            }
          });
        }
        facadePanelFeatures.push({
          type: 'Feature',
          properties: {
            id: `${properties.id}-storefront-entry-block`,
            baseHeight: 0.45,
            height: Math.min(Math.max(height * 0.3, 3.8), 7.2),
            color: '#2f6669',
            opacity: 0.68
          },
          geometry: {
            type: 'Polygon',
            coordinates: footprintFrontSkinRect(bounds, 0.43, 0.57, -0.03, 0.055)
          }
        });
      } else if (properties.category === 'parking' || properties.material === 'parkingGarage') {
        const deckRows = height >= 42 ? 5 : 3;
        for (let deck = 0; deck < deckRows; deck += 1) {
          parkingDeckOpeningFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-parking-deck-open-${deck}`,
              baseHeight: Math.max(1.6 + deck * Math.max(height * 0.13, 2.4), 1.6),
              height: Math.max(2.05 + deck * Math.max(height * 0.13, 2.4), 2.05),
              color: deck % 2 === 0 ? '#4f5755' : '#68706b'
            },
            geometry: {
              type: 'Polygon',
              coordinates: footprintRect(bounds, 0.12, 0.88, 0.08, 0.26)
            }
          });
        }
      } else if (height <= 38) {
        facadePanelFeatures.push({
          type: 'Feature',
          properties: {
            id: `${properties.id}-lowrise-front-material`,
            baseHeight: 0.5,
            height: Math.min(Math.max(height * 0.34, 2.8), 6.5),
            color: isBrickMaterial
              ? '#a9503b'
              : isWoodMaterial
              ? '#805132'
              : isConcreteMaterial
              ? '#bdb8ad'
              : (properties.windowColor || '#dceff2'),
            opacity: 0.44
          },
          geometry: {
            type: 'Polygon',
            coordinates: footprintRect(bounds, 0.16, 0.84, 0.035, 0.16)
          }
        });
      }
      const lightRows = height >= 48 ? 3 : 2;
      const lightCols = height >= 48 ? 4 : 3;
      for (let row = 0; row < lightRows; row += 1) {
        for (let col = 0; col < lightCols; col += 1) {
          if ((row + col + numericId) % 3 === 1) continue;
          windowLightDotFeatures.push({
            type: 'Feature',
            properties: {
              id: `${properties.id}-light-${row}-${col}`,
              color: ['creamGlass', 'midriseGlass', 'signatureBlueGlass', 'officeGlass', 'hotelStoneGlass'].includes(properties.material) ? '#bffcff' : '#fff0bd',
              radius: height >= 48 ? 1.55 : 1.25
            },
            geometry: {
              type: 'Point',
              coordinates: [
                centroid[0] - lngOffset * 0.48 + (lightCols === 1 ? 0 : (lngOffset * 0.96 * col) / (lightCols - 1)),
                centroid[1] - latOffset * 0.46 + (lightRows === 1 ? 0 : (latOffset * 0.92 * row) / (lightRows - 1))
              ]
            }
          });
        }
      }
    }
    if (properties.category === 'storefront' || height <= 34) {
      signPanelFeatures.push({
        type: 'Feature',
        properties: {
          id: properties.id,
          height: Math.min(Math.max(height * 0.34, 2.8), 8),
          signHeight: Math.min(Math.max(height * 0.34, 2.8), 8) + 0.42,
          color: properties.category === 'storefront' ? '#d9b45f' : (properties.trimColor || '#d8c79e')
        },
        geometry: {
          type: 'Polygon',
          coordinates: centeredRectanglePolygon(centroid, 0.000062, 0.000018, lngOffset * 0.72, -latOffset * 0.24)
        }
      });
      if (numericId % 2 === 0) {
        billboardPanelFeatures.push({
          type: 'Feature',
          properties: {
            id: properties.id,
            baseHeight: Math.min(Math.max(height * 0.42, 3), 8.8),
            height: Math.min(Math.max(height * 0.42, 3), 8.8) + 1.15,
            color: properties.category === 'storefront' ? '#bfa15f' : '#9fb7ad',
            opacity: 0.86
          },
          geometry: {
            type: 'Polygon',
            coordinates: centeredRectanglePolygon(centroid, 0.000105, 0.000022, lngOffset * 0.18, -latOffset * 0.82)
          }
        });
      }
      storefrontGlassFeatures.push({
        type: 'Feature',
        properties: {
          id: properties.id,
          baseHeight: 0.6,
          height: Math.min(Math.max(height * 0.32, 3.8), 6.8),
          color: properties.category === 'storefront' ? '#9ef0e7' : (properties.windowColor || '#d9fff5'),
          opacity: 0.72
        },
        geometry: {
          type: 'Polygon',
          coordinates: footprintRect(bounds, 0.16, 0.84, 0.04, 0.15)
        }
      });
    }
    if (height >= 16) {
      roofParapetFeatures.push({
        type: 'Feature',
        properties: {
          id: properties.id,
          height: Math.max(height + 0.38, 2.7),
          parapetHeight: Math.max(height + 1.1, 3.2),
          color: properties.roofColor || '#5b5143',
          opacity: height >= 48 ? 0.42 : 0.5
        },
        geometry: {
          type: 'Polygon',
          coordinates: centeredRectanglePolygon(centroid, 0.000145, 0.000058, 0, latOffset * 0.18)
        }
      });
      if (height >= 24 && height <= 72) {
        terraceRailFeatures.push({
          type: 'Feature',
          properties: { id: properties.id, color: properties.trimColor || '#f6e6bf' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [centroid[0] - lngOffset * 0.72, centroid[1] + latOffset * 0.48],
              [centroid[0] + lngOffset * 0.72, centroid[1] + latOffset * 0.48],
              [centroid[0] + lngOffset * 0.72, centroid[1] - latOffset * 0.16]
            ]
          }
        });
      }
    }
    if (Number(properties.height || 0) >= 16) {
      roofFeatures.push({
        type: 'Feature',
        properties: {
          id: properties.id,
          category: properties.category,
          color: properties.windowColor || '#9fe2da',
          radius: ['creamGlass', 'midriseGlass', 'signatureBlueGlass', 'officeGlass', 'hotelStoneGlass'].includes(properties.material) ? 3.2 : 2.2
        },
        geometry: { type: 'Point', coordinates: centroid }
      });
    }
    if (Number(properties.height || 0) <= 38) {
      treeFeatures.push({
        type: 'Feature',
        properties: {
          id: properties.id,
          color: numericId % 3 === 0 ? '#4db85f' : '#3e9f55',
          radius: numericId % 2 === 0 ? 2.8 : 2.2
        },
        geometry: { type: 'Point', coordinates: [centroid[0] + lngOffset, centroid[1] - latOffset] }
      });
      if (numericId % 2 === 0) {
        treeFeatures.push({
          type: 'Feature',
          properties: { id: `${properties.id}-b`, color: '#63bd6d', radius: 2.1 },
          geometry: { type: 'Point', coordinates: [centroid[0] - lngOffset * 0.8, centroid[1] + latOffset * 0.7] }
        });
      }
      for (let plaza = 0; plaza < 2; plaza += 1) {
        plazaDotFeatures.push({
          type: 'Feature',
          properties: {
            id: `${properties.id}-plaza-${plaza}`,
            color: plaza === 0 ? '#79c46d' : '#dfc58e',
            radius: plaza === 0 ? 2.1 : 1.55
          },
          geometry: {
            type: 'Point',
            coordinates: [
              centroid[0] + (plaza === 0 ? lngOffset * 1.34 : -lngOffset * 1.26),
              centroid[1] + (plaza === 0 ? latOffset * 0.92 : -latOffset * 1.1)
            ]
          }
        });
      }
    }
    if (Number(properties.height || 0) <= 46 && numericId % 3 !== 1) {
      carFeatures.push({
        type: 'Feature',
        properties: {
          id: properties.id,
          color: ['#ef4e3c', '#f3c74f', '#54a8de', '#f1eee0', '#1e2730'][numericId % 5]
        },
        geometry: { type: 'Point', coordinates: [centroid[0] - lngOffset * 1.25, centroid[1] - latOffset * 1.05] }
      });
    }
    if (height <= 52) {
      if (numericId % 3 !== 2) {
        patioFeatures.push({
          type: 'Feature',
          properties: {
            id: properties.id,
            color: numericId % 2 === 0 ? '#527a56' : '#726d5b',
            opacity: numericId % 2 === 0 ? 0.42 : 0.34
          },
          geometry: {
            type: 'Polygon',
            coordinates: centeredRectanglePolygon(centroid, 0.000095, 0.00007, -lngOffset * 0.88, latOffset * 0.88)
          }
        });
      }
      lotFeatures.push({
        type: 'Feature',
        properties: {
          id: properties.id,
          category: properties.category,
          color: numericId % 4 === 0 ? '#416f4c' : (numericId % 4 === 1 ? '#59616a' : '#4f6b58'),
          opacity: numericId % 4 === 1 ? 0.46 : 0.38
        },
        geometry: {
          type: 'Polygon',
          coordinates: centeredRectanglePolygon(centroid, 0.00016, 0.000105, lngOffset * 0.6, -latOffset * 1.25)
        }
      });
      for (let i = 0; i < 3; i += 1) {
        const stripeLat = centroid[1] - latOffset * 1.25 - 0.000032 + i * 0.000032;
        parkingStripeFeatures.push({
          type: 'Feature',
          properties: { id: `${properties.id}-stripe-${i}`, color: '#d7dde0' },
          geometry: {
            type: 'LineString',
            coordinates: [
              [centroid[0] + lngOffset * 0.6 - 0.000058, stripeLat],
              [centroid[0] + lngOffset * 0.6 + 0.000058, stripeLat]
            ]
          }
        });
      }
    }
    if (height <= 70 && numericId % 2 === 0) {
      streetlightFeatures.push({
        type: 'Feature',
        properties: { id: properties.id, color: '#ffe9a2' },
        geometry: { type: 'Point', coordinates: [centroid[0] + lngOffset * 1.25, centroid[1] + latOffset * 1.15] }
      });
    }
  });
  const priorityForDetail = (feature) => {
    const rawId = String(feature?.properties?.id || '');
    const baseId = rawId.split('-')[0];
    const featurePriority = Number(feature?.properties?.priority || 0);
    return (priorityByFootprintId.get(rawId) || priorityByFootprintId.get(baseId) || 0) + featurePriority;
  };
  const ranked = (features, limit) => features
    .sort((a, b) => priorityForDetail(b) - priorityForDetail(a))
    .slice(0, limit);
  return {
    entrances: { type: 'FeatureCollection', features: [] },
    roofs: { type: 'FeatureCollection', features: [] },
    trees: { type: 'FeatureCollection', features: [] },
    cars: { type: 'FeatureCollection', features: [] },
    lots: { type: 'FeatureCollection', features: [] },
    patios: { type: 'FeatureCollection', features: [] },
    entryPaths: { type: 'FeatureCollection', features: [] },
    signPanels: { type: 'FeatureCollection', features: [] },
    parkingStripes: { type: 'FeatureCollection', features: [] },
    streetlights: { type: 'FeatureCollection', features: [] },
    roofEquipment: { type: 'FeatureCollection', features: [] },
    roofRidges: { type: 'FeatureCollection', features: [] },
    balconyRails: { type: 'FeatureCollection', features: ranked(balconyRailFeatures, 140) },
    porchPads: { type: 'FeatureCollection', features: [] },
    skylightPanels: { type: 'FeatureCollection', features: [] },
    facadeSpines: { type: 'FeatureCollection', features: ranked(facadeSpineFeatures, 760) },
    yardFences: { type: 'FeatureCollection', features: [] },
    facadePanels: { type: 'FeatureCollection', features: ranked(facadePanelFeatures, 1700) },
    storefrontGlass: { type: 'FeatureCollection', features: ranked(storefrontGlassFeatures, 360) },
    sidewalkHalos: { type: 'FeatureCollection', features: [] },
    roofGardens: { type: 'FeatureCollection', features: [] },
    entryCanopies: { type: 'FeatureCollection', features: [] },
    roofCornerDots: { type: 'FeatureCollection', features: [] },
    windowLightDots: { type: 'FeatureCollection', features: [] },
    curbEdges: { type: 'FeatureCollection', features: [] },
    roofParapets: { type: 'FeatureCollection', features: [] },
    awningDots: { type: 'FeatureCollection', features: [] },
    serviceBoxes: { type: 'FeatureCollection', features: [] },
    plazaDots: { type: 'FeatureCollection', features: [] },
    solarPanels: { type: 'FeatureCollection', features: [] },
    loadingBays: { type: 'FeatureCollection', features: [] },
    facadeShadowStrips: { type: 'FeatureCollection', features: ranked(facadeShadowStripFeatures, 860) },
    activityDots: { type: 'FeatureCollection', features: [] },
    terraceRails: { type: 'FeatureCollection', features: [] },
    roofPoolPanels: { type: 'FeatureCollection', features: [] },
    drivewayLines: { type: 'FeatureCollection', features: [] },
    planterStrips: { type: 'FeatureCollection', features: [] },
    billboardPanels: { type: 'FeatureCollection', features: [] },
    facadeInsets: { type: 'FeatureCollection', features: ranked(facadeInsetFeatures, 900) },
    structuralBays: { type: 'FeatureCollection', features: ranked(structuralBayFeatures, 1800) },
    structuralRecesses: { type: 'FeatureCollection', features: ranked(structuralRecessFeatures, 1300) },
    structuralPlinths: { type: 'FeatureCollection', features: ranked(structuralPlinthFeatures, 520) },
    parkingDeckOpenings: { type: 'FeatureCollection', features: ranked(parkingDeckOpeningFeatures, 420) },
    storefrontBays: { type: 'FeatureCollection', features: ranked(storefrontBayFeatures, 360) },
    visibleWindowBays: { type: 'FeatureCollection', features: ranked(visibleWindowBayFeatures, 2600) },
    visibleWindowGrid: { type: 'FeatureCollection', features: ranked(visibleWindowGridFeatures, 4200) },
    visibleArchitectureRibs: { type: 'FeatureCollection', features: ranked(visibleArchitectureRibFeatures, 2200) },
    visibleStorefrontEntries: { type: 'FeatureCollection', features: ranked(visibleStorefrontEntryFeatures, 620) },
    visibleFloorBands: { type: 'FeatureCollection', features: ranked(visibleFloorBandFeatures, 1900) },
    obviousFacadePlates: { type: 'FeatureCollection', features: ranked(obviousFacadePlateFeatures, 1800) },
    architecturalProjections: { type: 'FeatureCollection', features: ranked(architecturalProjectionFeatures, 2400) },
    architecturalSetbacks: { type: 'FeatureCollection', features: ranked(architecturalSetbackFeatures, 1200) },
    architecturalPodiums: { type: 'FeatureCollection', features: ranked(architecturalPodiumFeatures, 1800) },
    architecturalReveals: { type: 'FeatureCollection', features: ranked(architecturalRevealFeatures, 2200) },
    structuralFacadeFrames: { type: 'FeatureCollection', features: ranked(structuralFacadeFrameFeatures, 1500) }
  };
}

function normalizeAustinOpenDataFootprints(cityGeojson) {
  const features = (cityGeojson.features || []).filter((feature) => {
    return feature?.geometry && ['Polygon', 'MultiPolygon'].includes(feature.geometry.type);
  }).slice(0, 360).map((feature) => {
    const height = parseAustinOpenDataHeight(feature.properties || {});
    const id = feature.id || feature.properties?.OBJECTID || feature.properties?.objectid || '';
    const category = height >= 92 ? 'office' : 'building';
    const material = materialProfileForRealWorldContext({
      category,
      id,
      height,
      building: feature.properties?.BUILDING_TYPE || feature.properties?.building_type || '',
      materialHint: feature.properties?.MATERIAL || feature.properties?.material || '',
      name: feature.properties?.NAME || feature.properties?.name || ''
    });
    const normalized = {
      type: 'Feature',
      properties: {
        id,
        name: '',
        building: 'yes',
        category,
        height,
        minHeight: 0,
        roofHeight: Math.max(height + 0.55, 2.5),
        source: 'City of Austin open building footprints'
      },
      geometry: feature.geometry
    };
    applyMaterialProfile(normalized, material);
    return normalized;
  });
  return { type: 'FeatureCollection', features };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 14000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchAustinOpenDataFootprints(bounds) {
  const south = bounds.getSouth();
  const west = bounds.getWest();
  const north = bounds.getNorth();
  const east = bounds.getEast();
  const params = new URLSearchParams({
    where: '1=1',
    outFields: '*',
    geometry: `${west},${south},${east},${north}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outSR: '4326',
    f: 'geojson',
    resultRecordCount: '360'
  });
  const url = `https://maps.austintexas.gov/gis/rest/Shared/PlanimetricsSurvey_1/MapServer/0/query?${params}`;
  const geojson = normalizeAustinOpenDataFootprints(await fetchWithTimeout(url, {}, 5500));
  geojson.features = geojson.features.map((feature) => ({
    ...feature,
    properties: { ...feature.properties, source: 'Official City of Austin open data' }
  }));
  window.__srMockFootprintSource = 'Official City of Austin open data';
  return geojson;
}

async function fetchLocalOvertureBuildingSkin() {
  const geojson = await fetchWithTimeout('artifacts/map-architecture/austin_building_skin.geojson', {}, 5500);
  if (!geojson?.features?.length) throw new Error('Local Overture building skin is empty');
  window.__srMockFootprintSource = 'Overture Maps building skin / local processed GeoJSON';
  return enrichFootprintsWithMapboxContext(geojson);
}

function addOsmDetailLayers() {
  if (!map?.getSource?.('src-mock-osm-buildings')) return;
  window.__srMockMap = map;
  window.__srMockMapboxMap = map;
  if (!map.isStyleLoaded?.()) {
    window.clearTimeout(simArchitectureInstallTimer);
    simArchitectureInstallTimer = window.setTimeout(addOsmDetailLayers, 500);
    return;
  }
  disabledBulkyArchitectureLayerIds.forEach(removeMockLayerIfPresent);
  disabledBulkyArchitectureSourceIds.forEach(removeMockSourceIfPresent);
  disabledClutterArchitectureLayerIds.forEach(removeMockLayerIfPresent);
  disabledClutterArchitectureSourceIds.forEach(removeMockSourceIfPresent);
  removeDisabledRoofOverlays();
  const plainBlockFilter = [
    'all',
    ['!=', ['get', 'preserveMapboxDetail'], true],
    [
      'any',
      ['has', 'realWorldSignature'],
      ['<', ['get', 'height'], 220]
    ]
  ];
  const categoryColor = [
    'match', ['get', 'category'],
    'hotel', '#4c8e91',
    'storefront', '#756f68',
    'office', '#6f96a0',
    'civic', '#aaa094',
    'residential', '#b97961',
    '#b9aa92'
  ];
  const materialWallColor = [
    'match', ['get', 'material'],
    'brick', '#c95f43',
    'residentialBrick', '#c85f42',
    'softTerracotta', '#d76d45',
    'warmWood', '#ad7441',
    'paleConcrete', '#b9b6ac',
    'tanStone', '#b7925f',
    'limestone', '#d1b88e',
    'steelStone', '#9eb4b8',
    'creamGlass', '#d3c39d',
    'midriseGlass', '#76aebb',
    'officeGlass', '#8ab8bf',
    'hotelStoneGlass', '#c4aa82',
    'retailBrick', '#c96548',
    'civicLimestone', '#e7dbc8',
    'signatureBlueGlass', '#8ebfd0',
    'storefrontWarm', '#cf7451',
    'parkingGarage', '#cbc7bd',
    ['coalesce', ['get', 'wallColor'], '#b99561']
  ];
  const materialDepthColor = [
    'case',
    ['==', ['get', 'category'], 'storefront'], '#5d9ca3',
    ['>=', ['get', 'height'], 150],
    [
      'match', ['get', 'material'],
      'brick', '#b95138',
      'residentialBrick', '#b8523a',
      'softTerracotta', '#c75d39',
      'warmWood', '#966437',
      'paleConcrete', '#aaa79e',
      'tanStone', '#a57949',
      'limestone', '#b89a6f',
      'steelStone', '#829ca2',
      'creamGlass', '#bda777',
      'midriseGlass', '#639da8',
      'officeGlass', '#6fa3ac',
      'hotelStoneGlass', '#ae8d63',
      'retailBrick', '#b9543d',
      'civicLimestone', '#d4c6ad',
      'signatureBlueGlass', '#75aabd',
      'storefrontWarm', '#b85f40',
      'parkingGarage', '#b6b2a7',
      ['coalesce', ['get', 'wallColor'], '#a77e4d']
    ],
    ['>=', ['get', 'height'], 80],
    [
      'match', ['get', 'material'],
      'brick', '#bd573d',
      'residentialBrick', '#bd573f',
      'softTerracotta', '#ce633f',
      'warmWood', '#a16b3c',
      'paleConcrete', '#afaca3',
      'tanStone', '#ac8351',
      'limestone', '#c1a579',
      'steelStone', '#8aa4a9',
      'creamGlass', '#c6b384',
      'midriseGlass', '#6ba7b3',
      'officeGlass', '#78abb3',
      'hotelStoneGlass', '#b89870',
      'retailBrick', '#bd5b43',
      'civicLimestone', '#ded0b8',
      'signatureBlueGlass', '#7fb5c6',
      'storefrontWarm', '#c46846',
      'parkingGarage', '#c0bcb2',
      ['coalesce', ['get', 'wallColor'], '#ae8654']
    ],
    materialWallColor
  ];
  const materialTrimColor = [
    'match', ['get', 'material'],
    'brick', '#9a4e38',
    'residentialBrick', '#96503d',
    'softTerracotta', '#a85a43',
    'warmWood', '#795033',
    'paleConcrete', '#aaa69d',
    'tanStone', '#b8a17f',
    'limestone', '#beb3a2',
    'steelStone', '#8ea0a3',
    'creamGlass', '#87bfc2',
    'midriseGlass', '#7eb8c2',
    'officeGlass', '#f2f4ea',
    'hotelStoneGlass', '#f7edd8',
    'retailBrick', '#f0dfc6',
    'civicLimestone', '#a79f92',
    'signatureBlueGlass', '#f0f3e7',
    'storefrontWarm', '#756f68',
    'parkingGarage', '#858984',
    '#9b8e80'
  ];
  const materialWindowColor = [
    'match', ['get', 'material'],
    'brick', '#ead0bd',
    'residentialBrick', '#ead0bd',
    'softTerracotta', '#ead2bf',
    'warmWood', '#eadac6',
    'paleConcrete', '#dceff2',
    'tanStone', '#f2fbef',
    'limestone', '#f8fff9',
    'steelStone', '#d1f8ff',
    'creamGlass', '#d8ffff',
    'midriseGlass', '#bffcff',
    'officeGlass', '#dcffff',
    'hotelStoneGlass', '#e5ffff',
    'retailBrick', '#a7f2ed',
    'civicLimestone', '#eff8f4',
    'signatureBlueGlass', '#c7fbff',
    'storefrontWarm', '#9ef0e7',
    'parkingGarage', '#6f7671',
    ['coalesce', ['get', 'windowColor'], '#efe4cf']
  ];
  addMapLayerSafe({
    id: 'src-mock-osm-building-volume',
    type: 'fill-extrusion',
    source: 'src-mock-osm-buildings',
    minzoom: 14,
    slot: 'middle',
    filter: plainBlockFilter,
    paint: {
      'fill-extrusion-base': 0,
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-color': materialDepthColor,
      'fill-extrusion-opacity': 0.82,
      'fill-extrusion-vertical-gradient': true,
      'fill-extrusion-ambient-occlusion-intensity': 0.16,
      'fill-extrusion-ambient-occlusion-radius': 3.4
    }
  });
  if (map.getSource('src-mock-osm-structural-plinth-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-structural-plinths',
      type: 'fill-extrusion',
      source: 'src-mock-osm-structural-plinth-polygons',
      minzoom: 15.75,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#bdb6a8'],
        'fill-extrusion-opacity': 0.72,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.08,
        'fill-extrusion-ambient-occlusion-radius': 1.5
      }
    });
  }
  if (map.getSource('src-mock-osm-visible-window-bay-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-visible-window-bays',
      type: 'fill-extrusion',
      source: 'src-mock-osm-visible-window-bay-polygons',
      minzoom: 15.45,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#bdf7ff'],
        'fill-extrusion-opacity': 0.98,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.1,
        'fill-extrusion-ambient-occlusion-radius': 1.15
      }
    });
  }
  if (map.getSource('src-mock-osm-visible-window-grid-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-visible-window-grid',
      type: 'fill-extrusion',
      source: 'src-mock-osm-visible-window-grid-polygons',
      minzoom: 15.35,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#a9f4ff'],
        'fill-extrusion-opacity': 0.98,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.12,
        'fill-extrusion-ambient-occlusion-radius': 1
      }
    });
  }
  if (map.getSource('src-mock-osm-visible-architecture-rib-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-visible-architecture-ribs',
      type: 'fill-extrusion',
      source: 'src-mock-osm-visible-architecture-rib-polygons',
      minzoom: 15.45,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': [
          'coalesce',
          ['get', 'color'],
          [
            'match', ['get', 'material'],
            'brick', '#f1d2b2',
            'residentialBrick', '#eed0b0',
            'softTerracotta', '#f1d0b1',
            'warmWood', '#e3bf91',
            'paleConcrete', '#eef2e9',
            'tanStone', '#f2e5c8',
            'limestone', '#fff2d0',
            'officeGlass', '#eefcf7',
            'midriseGlass', '#e9fff8',
            'creamGlass', '#f4f5df',
            '#e9f7ef'
          ]
        ],
        'fill-extrusion-opacity': 0.94,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.1,
        'fill-extrusion-ambient-occlusion-radius': 1.2
      }
    });
  }
  if (map.getSource('src-mock-osm-visible-storefront-entry-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-visible-storefront-entries',
      type: 'fill-extrusion',
      source: 'src-mock-osm-visible-storefront-entry-polygons',
      minzoom: 15.55,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#8ee9e1'],
        'fill-extrusion-opacity': 0.92,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.08,
        'fill-extrusion-ambient-occlusion-radius': 1
      }
    });
  }
  if (map.getSource('src-mock-osm-visible-floor-band-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-visible-floor-bands',
      type: 'fill-extrusion',
      source: 'src-mock-osm-visible-floor-band-polygons',
      minzoom: 15.35,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': [
          'coalesce',
          ['get', 'color'],
          [
            'match', ['get', 'material'],
            'brick', '#8f3f30',
            'residentialBrick', '#8c4435',
            'softTerracotta', '#98513b',
            'warmWood', '#68422a',
            'paleConcrete', '#8e928b',
            'tanStone', '#94724e',
            'limestone', '#a1855c',
            'officeGlass', '#f6fffa',
            'midriseGlass', '#effffb',
            'creamGlass', '#efead0',
            '#8f8374'
          ]
        ],
        'fill-extrusion-opacity': 0.96,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.12,
        'fill-extrusion-ambient-occlusion-radius': 1.25
      }
    });
  }
  if (map.getSource('src-mock-osm-obvious-facade-plate-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-obvious-facade-plates',
      type: 'fill-extrusion',
      source: 'src-mock-osm-obvious-facade-plate-polygons',
      minzoom: 15.2,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#8dbdc5'],
        'fill-extrusion-opacity': 0.72,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.04,
        'fill-extrusion-ambient-occlusion-radius': 1
      }
    });
  }
  if (map.getSource('src-mock-osm-architectural-projection-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-architectural-projections',
      type: 'fill-extrusion',
      source: 'src-mock-osm-architectural-projection-polygons',
      minzoom: 15.05,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#76acb8'],
        'fill-extrusion-opacity': 0.8,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.08,
        'fill-extrusion-ambient-occlusion-radius': 1.5
      }
    });
  }
  if (map.getSource('src-mock-osm-architectural-setback-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-architectural-setbacks',
      type: 'fill-extrusion',
      source: 'src-mock-osm-architectural-setback-polygons',
      minzoom: 15.15,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#d4cec0'],
        'fill-extrusion-opacity': 0.76,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.07,
        'fill-extrusion-ambient-occlusion-radius': 1.4
      }
    });
  }
  if (map.getSource('src-mock-osm-architectural-podium-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-architectural-podiums',
      type: 'fill-extrusion',
      source: 'src-mock-osm-architectural-podium-polygons',
      minzoom: 15,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#8ad8d4'],
        'fill-extrusion-opacity': 0.84,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.09,
        'fill-extrusion-ambient-occlusion-radius': 1.6
      }
    });
  }
  if (map.getSource('src-mock-osm-architectural-reveal-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-architectural-reveals',
      type: 'fill-extrusion',
      source: 'src-mock-osm-architectural-reveal-polygons',
      minzoom: 15,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#28596a'],
        'fill-extrusion-opacity': 0.86,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.1,
        'fill-extrusion-ambient-occlusion-radius': 1.8
      }
    });
  }
  if (map.getSource('src-mock-osm-structural-facade-frame-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-structural-facade-frames',
      type: 'fill-extrusion',
      source: 'src-mock-osm-structural-facade-frame-polygons',
      minzoom: 15,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#8e7754'],
        'fill-extrusion-opacity': 0.88,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.12,
        'fill-extrusion-ambient-occlusion-radius': 1.9
      }
    });
  }
  // Rooftop object layers are intentionally disabled. The mock focuses on wall/base/facade architecture only.
  if (map.getSource('src-mock-osm-balcony-lines')) {
    addMapLayerSafe({
      id: 'src-mock-osm-balcony-rails',
      type: 'line',
      source: 'src-mock-osm-balcony-lines',
      minzoom: 16.2,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#d8ffff'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 16, 0.75, 18, 1.55],
        'line-opacity': 0.64,
        'line-dasharray': [1.4, 1]
      }
    });
  }
  // Full-footprint facade bands caused a stacked/double-layer look over the replacement volume.
  // Visible detail now comes from footprint-aligned panels/insets instead of duplicate building slices.
  ['src-mock-osm-facade-band-low', 'src-mock-osm-facade-band-mid', 'src-mock-osm-facade-band-high'].forEach(removeMockLayerIfPresent);
  addMapLayerSafe({
    id: 'src-mock-osm-storefront-base',
    type: 'fill-extrusion',
    source: 'src-mock-osm-buildings',
    minzoom: 16,
    filter: [
      'all',
      plainBlockFilter,
      [
        'any',
        ['==', ['get', 'category'], 'storefront'],
        ['==', ['get', 'material'], 'retailBrick'],
        ['==', ['get', 'material'], 'storefrontWarm'],
        ['==', ['get', 'material'], 'hotelStoneGlass']
      ]
    ],
    paint: {
      'fill-extrusion-base': 0,
      'fill-extrusion-height': [
        'case',
        ['==', ['get', 'category'], 'storefront'], 4.2,
        ['==', ['get', 'category'], 'hotel'], 3.6,
        ['==', ['get', 'category'], 'civic'], 3.4,
        2.8
      ],
      'fill-extrusion-color': materialDepthColor,
      'fill-extrusion-opacity': 0.96,
      'fill-extrusion-vertical-gradient': false
    }
  });
  addMapLayerSafe({
    id: 'src-mock-osm-storefront-awning',
    type: 'line',
    source: 'src-mock-osm-buildings',
    minzoom: 16.1,
    filter: [
      'all',
      plainBlockFilter,
      ['<=', ['get', 'height'], 34]
    ],
    paint: {
      'line-color': [
        'case',
        ['==', ['get', 'category'], 'storefront'], '#756f68',
        ['==', ['get', 'material'], 'warmWood'], '#6f4a31',
        ['==', ['get', 'material'], 'paleConcrete'], '#9b9a93',
        ['==', ['get', 'material'], 'creamGlass'], '#6faeb4',
        ['==', ['get', 'material'], 'officeGlass'], '#6faeb4',
        ['==', ['get', 'material'], 'hotelStoneGlass'], '#7bb9b7',
        ['==', ['get', 'material'], 'retailBrick'], '#65adb1',
        ['==', ['get', 'material'], 'civicLimestone'], '#cac0af',
        ['==', ['get', 'material'], 'signatureBlueGlass'], '#5ea6af',
        '#8b8174'
      ],
      'line-width': ['interpolate', ['linear'], ['zoom'], 16, 1.4, 18, 3.1],
      'line-opacity': 0.28,
      'line-dasharray': [2.4, 1.1]
    }
  });
  addMapLayerSafe({
    id: 'src-mock-osm-glass-accent',
    type: 'line',
    source: 'src-mock-osm-buildings',
    minzoom: 16,
    filter: [
      'all',
      plainBlockFilter,
      ['>=', ['get', 'height'], 28]
    ],
    paint: {
      'line-color': materialWindowColor,
      'line-width': ['interpolate', ['linear'], ['zoom'], 16, 0.9, 18, 1.75],
      'line-opacity': [
        'case',
        ['in', ['get', 'material'], ['literal', ['creamGlass', 'midriseGlass', 'storefrontWarm', 'signatureBlueGlass', 'officeGlass', 'hotelStoneGlass']]],
        0.92,
        0.72
      ],
      'line-dasharray': [1.1, 1.4]
    }
  });
  addMapLayerSafe({
    id: 'src-mock-osm-window-rhythm',
    type: 'line',
    source: 'src-mock-osm-buildings',
    minzoom: 16.2,
    filter: plainBlockFilter,
    paint: {
      'line-color': materialWindowColor,
      'line-width': ['interpolate', ['linear'], ['zoom'], 16, 0.72, 18, 1.45],
      'line-opacity': ['interpolate', ['linear'], ['get', 'height'], 0, 0.52, 28, 0.78, 90, 0.86],
      'line-dasharray': [
        'case',
        ['>=', ['get', 'height'], 48],
        ['literal', [0.65, 1.15]],
        ['literal', [1, 1.9]]
      ]
    }
  });
  addMapLayerSafe({
    id: 'src-mock-osm-brick-coursing',
    type: 'line',
    source: 'src-mock-osm-buildings',
    minzoom: 16.25,
    filter: [
      'all',
      plainBlockFilter,
      ['in', ['get', 'material'], ['literal', ['brick', 'residentialBrick', 'softTerracotta']]]
    ],
    paint: {
      'line-color': '#7d3528',
      'line-width': ['interpolate', ['linear'], ['zoom'], 16, 0.5, 18, 1.1],
      'line-opacity': 0.52,
      'line-dasharray': [0.45, 0.75]
    }
  });
  addMapLayerSafe({
    id: 'src-mock-osm-wood-siding',
    type: 'line',
    source: 'src-mock-osm-buildings',
    minzoom: 16.25,
    filter: [
      'all',
      plainBlockFilter,
      ['==', ['get', 'material'], 'warmWood']
    ],
    paint: {
      'line-color': '#5d3925',
      'line-width': ['interpolate', ['linear'], ['zoom'], 16, 0.58, 18, 1.2],
      'line-opacity': 0.56,
      'line-dasharray': [1.65, 0.7]
    }
  });
  addMapLayerSafe({
    id: 'src-mock-osm-concrete-panel-seams',
    type: 'line',
    source: 'src-mock-osm-buildings',
    minzoom: 16.15,
    filter: [
      'all',
      plainBlockFilter,
      ['in', ['get', 'material'], ['literal', ['paleConcrete', 'tanStone', 'limestone']]]
    ],
    paint: {
      'line-color': '#8f9189',
      'line-width': ['interpolate', ['linear'], ['zoom'], 16, 0.5, 18, 1.05],
      'line-opacity': 0.42,
      'line-dasharray': [2.2, 1.25]
    }
  });
  if (map.getSource('src-mock-osm-entry-points')) {
    addMapLayerSafe({
      id: 'src-mock-osm-entry-hints',
      type: 'circle',
      source: 'src-mock-osm-entry-points',
      minzoom: 16.2,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 16, 2.2, 18, 4.6],
        'circle-color': ['coalesce', ['get', 'color'], '#ffc35f'],
        'circle-stroke-color': ['coalesce', ['get', 'halo'], '#fff3bf'],
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 16, 0.8, 18, 1.6],
        'circle-opacity': 0.82,
        'circle-stroke-opacity': 0.72
      }
    });
  }
  if (map.getSource('src-mock-osm-roof-points')) {
    addMapLayerSafe({
      id: 'src-mock-osm-roof-accents',
      type: 'circle',
      source: 'src-mock-osm-roof-points',
      minzoom: 16.1,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 16, ['get', 'radius'], 18, ['+', ['get', 'radius'], 1.8]],
        'circle-color': ['coalesce', ['get', 'color'], '#9fe2da'],
        'circle-stroke-color': '#1a302f',
        'circle-stroke-width': 1,
        'circle-opacity': 0.58,
        'circle-stroke-opacity': 0.42
      }
    });
  }
  if (map.getSource('src-mock-osm-lot-pad-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-lot-pads',
      type: 'fill',
      source: 'src-mock-osm-lot-pad-polygons',
      minzoom: 15.2,
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#4f6b58'],
        'fill-opacity': ['coalesce', ['get', 'opacity'], 0.38],
        'fill-outline-color': '#26372e'
      }
    });
  }
  if (map.getSource('src-mock-osm-sidewalk-halo-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-sidewalk-halos',
      type: 'fill',
      source: 'src-mock-osm-sidewalk-halo-polygons',
      minzoom: 15.2,
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#56606b'],
        'fill-opacity': ['coalesce', ['get', 'opacity'], 0.24],
        'fill-outline-color': '#7f8b8e'
      }
    });
  }
  if (map.getSource('src-mock-osm-loading-bay-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-loading-bays',
      type: 'fill',
      source: 'src-mock-osm-loading-bay-polygons',
      minzoom: 15.9,
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#3f4448'],
        'fill-opacity': ['coalesce', ['get', 'opacity'], 0.54],
        'fill-outline-color': '#a9b0aa'
      }
    });
  }
  if (map.getSource('src-mock-osm-planter-strip-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-planter-strips',
      type: 'fill',
      source: 'src-mock-osm-planter-strip-polygons',
      minzoom: 15.4,
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#4fa45a'],
        'fill-opacity': 0.62,
        'fill-outline-color': '#203d25'
      }
    });
  }
  if (map.getSource('src-mock-osm-patio-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-patio-pads',
      type: 'fill',
      source: 'src-mock-osm-patio-polygons',
      minzoom: 15.8,
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#527a56'],
        'fill-opacity': ['coalesce', ['get', 'opacity'], 0.38],
        'fill-outline-color': '#c9d2bb'
      }
    });
  }
  if (map.getSource('src-mock-osm-porch-pad-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-porch-pads',
      type: 'fill',
      source: 'src-mock-osm-porch-pad-polygons',
      minzoom: 16.1,
      paint: {
        'fill-color': ['coalesce', ['get', 'color'], '#e8c68f'],
        'fill-opacity': ['coalesce', ['get', 'opacity'], 0.56],
        'fill-outline-color': ['coalesce', ['get', 'outline'], '#ffe4b4']
      }
    });
  }
  if (map.getSource('src-mock-osm-entry-lines')) {
    addMapLayerSafe({
      id: 'src-mock-osm-entry-paths',
      type: 'line',
      source: 'src-mock-osm-entry-lines',
      minzoom: 16.1,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#f0dcc0'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 16, 0.75, 18, 1.7],
        'line-opacity': 0.72,
        'line-dasharray': [1.4, 0.8]
      }
    });
  }
  if (map.getSource('src-mock-osm-driveway-lines-source')) {
    addMapLayerSafe({
      id: 'src-mock-osm-driveway-lines',
      type: 'line',
      source: 'src-mock-osm-driveway-lines-source',
      minzoom: 15.8,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#b6c0bd'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1.35, 18, 3.6],
        'line-opacity': 0.86,
        'line-dasharray': [1.6, 0.8]
      }
    });
  }
  if (map.getSource('src-mock-osm-entry-canopy-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-entry-canopies',
      type: 'fill-extrusion',
      source: 'src-mock-osm-entry-canopy-polygons',
      minzoom: 16,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#ffd65f'],
        'fill-extrusion-opacity': 0.94,
        'fill-extrusion-vertical-gradient': false
      }
    });
  }
  if (map.getSource('src-mock-osm-awning-dot-points')) {
    addMapLayerSafe({
      id: 'src-mock-osm-awning-dots',
      type: 'circle',
      source: 'src-mock-osm-awning-dot-points',
      minzoom: 16.3,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 16, ['get', 'radius'], 18, ['+', ['get', 'radius'], 1.25]],
        'circle-color': ['coalesce', ['get', 'color'], '#ffd95a'],
        'circle-stroke-color': '#4c3719',
        'circle-stroke-width': 0.55,
        'circle-opacity': 0.78,
        'circle-stroke-opacity': 0.4
      }
    });
  }
  if (map.getSource('src-mock-osm-yard-fence-lines')) {
    addMapLayerSafe({
      id: 'src-mock-osm-yard-fences',
      type: 'line',
      source: 'src-mock-osm-yard-fence-lines',
      minzoom: 16.4,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#f0d6a0'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 16, 1.2, 18, 2.8],
        'line-opacity': 0.82,
        'line-dasharray': [1.1, 0.8]
      }
    });
  }
  if (map.getSource('src-mock-osm-curb-edge-lines-source')) {
    addMapLayerSafe({
      id: 'src-mock-osm-curb-edge-lines',
      type: 'line',
      source: 'src-mock-osm-curb-edge-lines-source',
      minzoom: 15.7,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#c8d2c1'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 15, 1.25, 18, 3],
        'line-opacity': 0.88,
        'line-dasharray': [2, 1]
      }
    });
  }
  if (map.getSource('src-mock-osm-sign-panel-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-sign-panels',
      type: 'fill-extrusion',
      source: 'src-mock-osm-sign-panel-polygons',
      minzoom: 16.3,
      paint: {
        'fill-extrusion-base': ['get', 'height'],
        'fill-extrusion-height': ['get', 'signHeight'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#d9b45f'],
        'fill-extrusion-opacity': 0.96,
        'fill-extrusion-vertical-gradient': false
      }
    });
  }
  if (map.getSource('src-mock-osm-billboard-panel-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-billboard-panels',
      type: 'fill-extrusion',
      source: 'src-mock-osm-billboard-panel-polygons',
      minzoom: 16.1,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#bfa15f'],
        'fill-extrusion-opacity': 0.9,
        'fill-extrusion-vertical-gradient': false
      }
    });
  }
  if (map.getSource('src-mock-osm-storefront-glass-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-storefront-glass',
      type: 'fill-extrusion',
      source: 'src-mock-osm-storefront-glass-polygons',
      minzoom: 16,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#9ef0e7'],
        'fill-extrusion-opacity': 0.78,
        'fill-extrusion-vertical-gradient': false
      }
    });
  }
  if (map.getSource('src-mock-osm-facade-spine-lines')) {
    addMapLayerSafe({
      id: 'src-mock-osm-facade-spines',
      type: 'line',
      source: 'src-mock-osm-facade-spine-lines',
      minzoom: 16.2,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#f7fff2'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 16, 1.05, 18, 2.5],
        'line-opacity': 0.86,
        'line-dasharray': [0.75, 1.35]
      }
    });
  }
  if (map.getSource('src-mock-osm-facade-panel-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-facade-panels',
      type: 'fill-extrusion',
      source: 'src-mock-osm-facade-panel-polygons',
      minzoom: 15.9,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#ecfff8'],
        'fill-extrusion-opacity': 0.62,
        'fill-extrusion-vertical-gradient': false
      }
    });
  }
  if (map.getSource('src-mock-osm-structural-bay-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-structural-bays',
      type: 'fill-extrusion',
      source: 'src-mock-osm-structural-bay-polygons',
      minzoom: 15.85,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#b8b3a6'],
        'fill-extrusion-opacity': 0.44,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.08,
        'fill-extrusion-ambient-occlusion-radius': 1.5
      }
    });
  }
  if (map.getSource('src-mock-osm-structural-recess-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-structural-recesses',
      type: 'fill-extrusion',
      source: 'src-mock-osm-structural-recess-polygons',
      minzoom: 15.95,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#6f766f'],
        'fill-extrusion-opacity': 0.34,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.1,
        'fill-extrusion-ambient-occlusion-radius': 1.2
      }
    });
  }
  if (map.getSource('src-mock-osm-parking-deck-opening-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-parking-deck-openings',
      type: 'fill-extrusion',
      source: 'src-mock-osm-parking-deck-opening-polygons',
      minzoom: 15.9,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#4f5755'],
        'fill-extrusion-opacity': 0.62,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.12,
        'fill-extrusion-ambient-occlusion-radius': 1.4
      }
    });
  }
  if (map.getSource('src-mock-osm-storefront-bay-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-storefront-structural-bays',
      type: 'fill-extrusion',
      source: 'src-mock-osm-storefront-bay-polygons',
      minzoom: 16,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#78d8d2'],
        'fill-extrusion-opacity': 0.72,
        'fill-extrusion-vertical-gradient': false,
        'fill-extrusion-ambient-occlusion-intensity': 0.08,
        'fill-extrusion-ambient-occlusion-radius': 1
      }
    });
  }
  if (map.getSource('src-mock-osm-facade-inset-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-facade-insets',
      type: 'fill-extrusion',
      source: 'src-mock-osm-facade-inset-polygons',
      minzoom: 15.9,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#d8ffff'],
        'fill-extrusion-opacity': 0.68,
        'fill-extrusion-vertical-gradient': false
      }
    });
  }
  if (map.getSource('src-mock-osm-facade-shadow-strip-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-facade-shadow-strips',
      type: 'fill-extrusion',
      source: 'src-mock-osm-facade-shadow-strip-polygons',
      minzoom: 15.8,
      paint: {
        'fill-extrusion-base': ['get', 'baseHeight'],
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#273645'],
        'fill-extrusion-opacity': 0.56,
        'fill-extrusion-vertical-gradient': false
      }
    });
  }
  if (map.getSource('src-mock-osm-parking-lines')) {
    addMapLayerSafe({
      id: 'src-mock-osm-parking-stripes',
      type: 'line',
      source: 'src-mock-osm-parking-lines',
      minzoom: 16.2,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#d7dde0'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 16, 0.45, 18, 1],
        'line-opacity': 0.58
      }
    });
  }
  if (map.getSource('src-mock-osm-roof-garden-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-roof-gardens',
      type: 'fill-extrusion',
      source: 'src-mock-osm-roof-garden-polygons',
      minzoom: 16.2,
      paint: {
        'fill-extrusion-base': ['get', 'height'],
        'fill-extrusion-height': ['get', 'gardenHeight'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#55b96b'],
        'fill-extrusion-opacity': 0.62,
        'fill-extrusion-vertical-gradient': false
      }
    });
  }
  if (map.getSource('src-mock-osm-roof-pool-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-roof-pool-panels',
      type: 'fill-extrusion',
      source: 'src-mock-osm-roof-pool-polygons',
      minzoom: 16.2,
      paint: {
        'fill-extrusion-base': ['get', 'height'],
        'fill-extrusion-height': ['get', 'poolHeight'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#54d2cf'],
        'fill-extrusion-opacity': 0.68,
        'fill-extrusion-vertical-gradient': false
      }
    });
  }
  if (map.getSource('src-mock-osm-roof-parapet-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-roof-parapets',
      type: 'fill-extrusion',
      source: 'src-mock-osm-roof-parapet-polygons',
      minzoom: 15.8,
      paint: {
        'fill-extrusion-base': ['get', 'height'],
        'fill-extrusion-height': ['get', 'parapetHeight'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#5b5143'],
        'fill-extrusion-opacity': 0.72,
        'fill-extrusion-vertical-gradient': false
      }
    });
  }
  if (map.getSource('src-mock-osm-service-box-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-service-boxes',
      type: 'fill-extrusion',
      source: 'src-mock-osm-service-box-polygons',
      minzoom: 16.2,
      paint: {
        'fill-extrusion-base': ['get', 'height'],
        'fill-extrusion-height': ['get', 'boxHeight'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#c7c2b1'],
        'fill-extrusion-opacity': 0.88,
        'fill-extrusion-vertical-gradient': false
      }
    });
  }
  if (map.getSource('src-mock-osm-solar-panel-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-solar-panels',
      type: 'fill-extrusion',
      source: 'src-mock-osm-solar-panel-polygons',
      minzoom: 16.2,
      paint: {
        'fill-extrusion-base': ['get', 'height'],
        'fill-extrusion-height': ['get', 'panelHeight'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#1f5365'],
        'fill-extrusion-opacity': 0.82,
        'fill-extrusion-vertical-gradient': false
      }
    });
  }
  if (map.getSource('src-mock-osm-roof-corner-points')) {
    addMapLayerSafe({
      id: 'src-mock-osm-roof-corner-dots',
      type: 'circle',
      source: 'src-mock-osm-roof-corner-points',
      minzoom: 16.2,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 16, ['get', 'radius'], 18, ['+', ['get', 'radius'], 1.2]],
        'circle-color': ['coalesce', ['get', 'color'], '#ffe7b8'],
        'circle-stroke-color': '#272019',
        'circle-stroke-width': 0.65,
        'circle-opacity': 0.74,
        'circle-stroke-opacity': 0.48
      }
    });
  }
  if (map.getSource('src-mock-osm-terrace-rail-lines')) {
    addMapLayerSafe({
      id: 'src-mock-osm-terrace-rails',
      type: 'line',
      source: 'src-mock-osm-terrace-rail-lines',
      minzoom: 16.1,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#f6e6bf'],
        'line-width': ['interpolate', ['linear'], ['zoom'], 16, 1.45, 18, 3.2],
        'line-opacity': 0.92,
        'line-dasharray': [1.2, 0.9]
      }
    });
  }
  if (map.getSource('src-mock-osm-skylight-panel-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-skylight-panels',
      type: 'fill-extrusion',
      source: 'src-mock-osm-skylight-panel-polygons',
      minzoom: 16.2,
      paint: {
        'fill-extrusion-base': ['get', 'height'],
        'fill-extrusion-height': ['get', 'skylightHeight'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#b7f3ee'],
        'fill-extrusion-opacity': 0.56,
        'fill-extrusion-vertical-gradient': false
      }
    });
  }
  if (map.getSource('src-mock-osm-window-light-points')) {
    addMapLayerSafe({
      id: 'src-mock-osm-window-light-dots',
      type: 'circle',
      source: 'src-mock-osm-window-light-points',
      minzoom: 16.4,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 16, ['get', 'radius'], 18, ['+', ['get', 'radius'], 1.05]],
        'circle-color': ['coalesce', ['get', 'color'], '#fff0bd'],
        'circle-stroke-color': '#493d24',
        'circle-stroke-width': 0.45,
        'circle-opacity': 0.66,
        'circle-stroke-opacity': 0.36
      }
    });
  }
  if (map.getSource('src-mock-osm-tree-points')) {
    addMapLayerSafe({
      id: 'src-mock-osm-tree-dots',
      type: 'circle',
      source: 'src-mock-osm-tree-points',
      minzoom: 15.4,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, ['get', 'radius'], 18, ['+', ['get', 'radius'], 2.2]],
        'circle-color': ['coalesce', ['get', 'color'], '#4db85f'],
        'circle-stroke-color': '#17351f',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 15, 0.4, 18, 1],
        'circle-opacity': 0.82,
        'circle-stroke-opacity': 0.55
      }
    });
  }
  if (map.getSource('src-mock-osm-plaza-dot-points')) {
    addMapLayerSafe({
      id: 'src-mock-osm-plaza-dots',
      type: 'circle',
      source: 'src-mock-osm-plaza-dot-points',
      minzoom: 15.6,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, ['get', 'radius'], 18, ['+', ['get', 'radius'], 1.75]],
        'circle-color': ['coalesce', ['get', 'color'], '#79c46d'],
        'circle-stroke-color': '#203323',
        'circle-stroke-width': 0.65,
        'circle-opacity': 0.7,
        'circle-stroke-opacity': 0.38
      }
    });
  }
  if (map.getSource('src-mock-osm-activity-dot-points')) {
    addMapLayerSafe({
      id: 'src-mock-osm-activity-dots',
      type: 'circle',
      source: 'src-mock-osm-activity-dot-points',
      minzoom: 16.1,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 16, ['get', 'radius'], 18, ['+', ['get', 'radius'], 1.3]],
        'circle-color': ['coalesce', ['get', 'color'], '#f7d46d'],
        'circle-stroke-color': '#241d16',
        'circle-stroke-width': 0.45,
        'circle-opacity': 0.7,
        'circle-stroke-opacity': 0.38
      }
    });
  }
  if (map.getSource('src-mock-osm-streetlight-points')) {
    addMapLayerSafe({
      id: 'src-mock-osm-streetlight-dots',
      type: 'circle',
      source: 'src-mock-osm-streetlight-points',
      minzoom: 16.2,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 16, 1.5, 18, 3.2],
        'circle-color': ['coalesce', ['get', 'color'], '#ffe9a2'],
        'circle-stroke-color': '#4f3b13',
        'circle-stroke-width': 0.7,
        'circle-opacity': 0.7,
        'circle-stroke-opacity': 0.5
      }
    });
  }
  if (map.getSource('src-mock-osm-car-points')) {
    addMapLayerSafe({
      id: 'src-mock-osm-car-dots',
      type: 'circle',
      source: 'src-mock-osm-car-points',
      minzoom: 16,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 16, 1.6, 18, 3.3],
        'circle-color': ['coalesce', ['get', 'color'], '#f1eee0'],
        'circle-stroke-color': '#182027',
        'circle-stroke-width': 0.8,
        'circle-opacity': 0.78,
        'circle-stroke-opacity': 0.56
      }
    });
  }
  if (map.getSource('src-mock-osm-roof-equipment-polygons')) {
    addMapLayerSafe({
      id: 'src-mock-osm-roof-equipment',
      type: 'fill-extrusion',
      source: 'src-mock-osm-roof-equipment-polygons',
      minzoom: 16.1,
      paint: {
        'fill-extrusion-base': ['get', 'height'],
        'fill-extrusion-height': ['get', 'equipmentHeight'],
        'fill-extrusion-color': ['coalesce', ['get', 'color'], '#d9d0bd'],
        'fill-extrusion-opacity': 0.86,
        'fill-extrusion-vertical-gradient': false
      }
    });
  }
  publishSimArchitectureMountState();
}

async function fetchOverpassBuildings(query) {
  const requests = osmFootprintEndpoints.map((endpoint) => fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: new URLSearchParams({ data: query })
      }, 7500).then((json) => {
        window.__srMockOsmFootprintEndpoint = endpoint;
        return json;
      }));
  try {
    return await Promise.any(requests);
  } catch (error) {
    throw new Error('OSM footprint endpoints unavailable');
  }
}

async function fetchAllowedBuildingFootprints(bounds, overpassQuery) {
  const startedAt = Date.now();
  window.__srMockFootprintFetchStartedAt = startedAt;
  const overtureRequest = fetchLocalOvertureBuildingSkin()
    .then((geojson) => {
      window.__srMockFootprintFetchMs = Date.now() - startedAt;
      return geojson;
    })
    .catch((overtureError) => {
      window.__srMockOvertureFootprintError = String(overtureError?.message || overtureError);
      throw overtureError;
    });
  const cityRequest = fetchAustinOpenDataFootprints(bounds)
    .then((geojson) => {
      window.__srMockFootprintFetchMs = Date.now() - startedAt;
      return enrichFootprintsWithMapboxContext(geojson);
    })
    .catch((cityError) => {
      window.__srMockCityFootprintError = String(cityError?.message || cityError);
      throw cityError;
    });
  const osmRequest = fetchOverpassBuildings(overpassQuery)
    .then((osmJson) => {
      const osmGeojson = osmToGeoJson(osmJson);
      window.__srMockFootprintSource = 'OpenStreetMap/Overpass';
      window.__srMockFootprintFetchMs = Date.now() - startedAt;
      return enrichFootprintsWithMapboxContext(osmGeojson);
    })
    .catch((osmError) => {
      window.__srMockOsmFootprintFetchError = String(osmError?.message || osmError);
      throw osmError;
    });
  try {
    return await Promise.any([overtureRequest, cityRequest, osmRequest]);
  } catch (error) {
    throw new Error(`Allowed footprint sources unavailable: ${window.__srMockOvertureFootprintError || 'Overture source failed'}; ${window.__srMockCityFootprintError || 'city source failed'}; ${window.__srMockOsmFootprintFetchError || 'OSM source failed'}`);
  }
}

function hasFiniteGeoJsonCoordinates(value) {
  if (!Array.isArray(value) || !value.length) return false;
  if (typeof value[0] === 'number') {
    return value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
  }
  return value.every(hasFiniteGeoJsonCoordinates);
}

function isValidGeoJsonFeature(feature) {
  const geometry = feature?.geometry;
  if (!geometry || !['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon'].includes(geometry.type)) return false;
  return hasFiniteGeoJsonCoordinates(geometry.coordinates);
}

function sanitizeGeoJsonFeatureCollection(data, sourceId = 'geojson') {
  const inputFeatures = Array.isArray(data?.features) ? data.features : [];
  const features = inputFeatures.filter(isValidGeoJsonFeature);
  const dropped = inputFeatures.length - features.length;
  if (dropped > 0) {
    window.__srMockDroppedInvalidGeoJson = Number(window.__srMockDroppedInvalidGeoJson || 0) + dropped;
    window.__srMockInvalidGeoJsonSources = [...new Set([
      ...(window.__srMockInvalidGeoJsonSources || []),
      sourceId
    ])].slice(0, 40);
    document.body.dataset.mockInvalidGeoJsonSkipped = String(window.__srMockDroppedInvalidGeoJson);
  }
  return { type: 'FeatureCollection', features };
}

function setGeoJsonSourceIfFeatures(sourceId, data) {
  const safeData = sanitizeGeoJsonFeatureCollection(data, sourceId);
  if (!map || !safeData.features.length) {
    removeMockLayersForSource(sourceId);
    removeMockSourceIfPresent(sourceId);
    return false;
  }
  if (map.getSource(sourceId)) {
    map.getSource(sourceId).setData(safeData);
  } else {
    map.addSource(sourceId, { type: 'geojson', data: safeData });
  }
  return true;
}

function footprintCacheKeyForBoundsKey(boundsKey) {
  return `sr-mock-footprints:${boundsKey}`;
}

function readFootprintCache(boundsKey) {
  if (!footprintBrowserCacheEnabled) {
    window.__srMockFootprintCacheStatus = 'disabled';
    return null;
  }
  try {
    const raw = window.sessionStorage?.getItem?.(footprintCacheKeyForBoundsKey(boundsKey));
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (cached.version !== footprintCacheVersion) return null;
    if (!cached?.geojson?.features?.length) return null;
    if (Number(cached.plainCount || 0) < 1 || Number(cached.structuralCount || 0) < 1) return null;
    if (Date.now() - Number(cached.savedAt || 0) > 1000 * 60 * 45) return null;
    window.__srMockFootprintSource = `${cached.source || 'allowed cached footprints'} / session cache`;
    window.__srMockFootprintCacheStatus = 'hit';
    return cached.geojson;
  } catch {
    return null;
  }
}

function writeFootprintCache(boundsKey, geojson) {
  if (!footprintBrowserCacheEnabled) {
    window.__srMockFootprintCacheStatus = 'disabled';
    return;
  }
  try {
    if (!geojson?.features?.length || !window.sessionStorage) return;
    const cacheIndexKey = 'sr-mock-footprints:index';
    const key = footprintCacheKeyForBoundsKey(boundsKey);
    const index = JSON.parse(window.sessionStorage.getItem(cacheIndexKey) || '[]')
      .filter((item) => item && item !== key);
    index.push(key);
    while (index.length > 5) {
      const oldKey = index.shift();
      if (oldKey) window.sessionStorage.removeItem(oldKey);
    }
    window.sessionStorage.setItem(cacheIndexKey, JSON.stringify(index));
    const pointPreview = buildPlainBlockPointSources(geojson);
    const structuralCount = (pointPreview.structuralBays?.features?.length || 0)
      + (pointPreview.structuralRecesses?.features?.length || 0)
      + (pointPreview.structuralPlinths?.features?.length || 0)
      + (pointPreview.facadePanels?.features?.length || 0)
      + (pointPreview.facadeInsets?.features?.length || 0)
      + (pointPreview.facadeShadowStrips?.features?.length || 0)
      + (pointPreview.parkingDeckOpenings?.features?.length || 0)
      + (pointPreview.storefrontBays?.features?.length || 0);
    window.sessionStorage.setItem(key, JSON.stringify({
      version: footprintCacheVersion,
      savedAt: Date.now(),
      source: window.__srMockFootprintSource || 'allowed footprints',
      plainCount: geojson.features.filter((feature) => shouldSkinPlainBlock(feature)).length,
      structuralCount,
      geojson
    }));
    window.__srMockFootprintCacheStatus = 'stored';
  } catch (error) {
    window.__srMockFootprintCacheStatus = `store skipped: ${error?.message || error}`;
  }
}

function mountFootprintSkin(geojson, boundsKey) {
  if (!geojson?.features?.length) throw new Error('No allowed building footprints returned');
  const safeFootprints = sanitizeGeoJsonFeatureCollection(geojson, 'src-mock-osm-buildings');
  if (!safeFootprints.features.length) throw new Error('Allowed building footprints were invalid');
  geojson = safeFootprints;
  window.__srMockMap = map;
  window.__srMockMapboxMap = map;
  if (map.getSource('src-mock-osm-buildings')) {
    map.getSource('src-mock-osm-buildings').setData(geojson);
  } else {
    map.addSource('src-mock-osm-buildings', { type: 'geojson', data: geojson });
  }
  const pointSources = applyStableDetailBudget(buildPlainBlockPointSources(geojson));
  setGeoJsonSourceIfFeatures('src-mock-osm-storefront-glass-polygons', pointSources.storefrontGlass);
  setGeoJsonSourceIfFeatures('src-mock-osm-facade-panel-polygons', pointSources.facadePanels);
  setGeoJsonSourceIfFeatures('src-mock-osm-facade-inset-polygons', pointSources.facadeInsets);
  setGeoJsonSourceIfFeatures('src-mock-osm-structural-bay-polygons', pointSources.structuralBays);
  setGeoJsonSourceIfFeatures('src-mock-osm-structural-recess-polygons', pointSources.structuralRecesses);
  setGeoJsonSourceIfFeatures('src-mock-osm-structural-plinth-polygons', pointSources.structuralPlinths);
  setGeoJsonSourceIfFeatures('src-mock-osm-parking-deck-opening-polygons', pointSources.parkingDeckOpenings);
  setGeoJsonSourceIfFeatures('src-mock-osm-storefront-bay-polygons', pointSources.storefrontBays);
  setGeoJsonSourceIfFeatures('src-mock-osm-visible-window-bay-polygons', pointSources.visibleWindowBays);
  setGeoJsonSourceIfFeatures('src-mock-osm-visible-window-grid-polygons', pointSources.visibleWindowGrid);
  setGeoJsonSourceIfFeatures('src-mock-osm-visible-architecture-rib-polygons', pointSources.visibleArchitectureRibs);
  setGeoJsonSourceIfFeatures('src-mock-osm-visible-storefront-entry-polygons', pointSources.visibleStorefrontEntries);
  setGeoJsonSourceIfFeatures('src-mock-osm-visible-floor-band-polygons', pointSources.visibleFloorBands);
  setGeoJsonSourceIfFeatures('src-mock-osm-obvious-facade-plate-polygons', pointSources.obviousFacadePlates);
  setGeoJsonSourceIfFeatures('src-mock-osm-architectural-projection-polygons', pointSources.architecturalProjections);
  setGeoJsonSourceIfFeatures('src-mock-osm-architectural-setback-polygons', pointSources.architecturalSetbacks);
  setGeoJsonSourceIfFeatures('src-mock-osm-architectural-podium-polygons', pointSources.architecturalPodiums);
  setGeoJsonSourceIfFeatures('src-mock-osm-architectural-reveal-polygons', pointSources.architecturalReveals);
  setGeoJsonSourceIfFeatures('src-mock-osm-structural-facade-frame-polygons', pointSources.structuralFacadeFrames);
  setGeoJsonSourceIfFeatures('src-mock-osm-facade-shadow-strip-polygons', pointSources.facadeShadowStrips);
  setGeoJsonSourceIfFeatures('src-mock-osm-sign-panel-polygons', pointSources.signPanels);
  enforceMockReplacementRule();
  addOsmDetailLayers();
  window.setTimeout(addOsmDetailLayers, 650);
  setSimArchitectureVisibility(!document.body.classList.contains('render-off'));
  window.__srMockMountedSimArchitectureLayers = simArchitectureLayerIds.filter((id) => map.getLayer(id));
  window.__srMockReplacementRule = `active: ${window.__srMockMountedSimArchitectureLayers.length} current footprint-aligned layers mounted after old layers/sources removed`;
  auditMockReplacementRule();
  window.__srMockOsmBuildingCount = geojson.features.length;
  window.__srMockStructuralBayCount = (pointSources.structuralBays?.features?.length || 0)
    + (pointSources.structuralRecesses?.features?.length || 0)
    + (pointSources.structuralPlinths?.features?.length || 0)
    + (pointSources.facadePanels?.features?.length || 0)
    + (pointSources.facadeInsets?.features?.length || 0)
    + (pointSources.facadeShadowStrips?.features?.length || 0)
    + (pointSources.parkingDeckOpenings?.features?.length || 0)
    + (pointSources.storefrontBays?.features?.length || 0)
    + (pointSources.visibleWindowBays?.features?.length || 0)
    + (pointSources.visibleWindowGrid?.features?.length || 0)
    + (pointSources.visibleArchitectureRibs?.features?.length || 0)
    + (pointSources.visibleStorefrontEntries?.features?.length || 0)
    + (pointSources.visibleFloorBands?.features?.length || 0)
    + (pointSources.obviousFacadePlates?.features?.length || 0)
    + (pointSources.architecturalProjections?.features?.length || 0)
    + (pointSources.architecturalSetbacks?.features?.length || 0)
    + (pointSources.architecturalPodiums?.features?.length || 0)
    + (pointSources.architecturalReveals?.features?.length || 0)
    + (pointSources.structuralFacadeFrames?.features?.length || 0);
  window.__srMockVisibleArchitectureCount = (pointSources.visibleWindowBays?.features?.length || 0)
    + (pointSources.visibleWindowGrid?.features?.length || 0)
    + (pointSources.visibleArchitectureRibs?.features?.length || 0)
    + (pointSources.visibleStorefrontEntries?.features?.length || 0)
    + (pointSources.visibleFloorBands?.features?.length || 0)
    + (pointSources.obviousFacadePlates?.features?.length || 0)
    + (pointSources.architecturalProjections?.features?.length || 0)
    + (pointSources.architecturalSetbacks?.features?.length || 0)
    + (pointSources.architecturalPodiums?.features?.length || 0)
    + (pointSources.architecturalReveals?.features?.length || 0)
    + (pointSources.structuralFacadeFrames?.features?.length || 0);
  window.__srMockPlainBlockSkinCount = geojson.features.filter((feature) => shouldSkinPlainBlock(feature)).length;
  window.__srMockPreservedDetailCount = geojson.features.filter((feature) => feature.properties?.preserveMapboxDetail).length;
  window.__srMockProtectedLandmarkCount = geojson.features.filter((feature) => feature.properties?.contextSource === 'Protected Austin landmark zone').length;
  window.__srMockAccuracyProfileCount = geojson.features.filter((feature) => {
    const material = feature.properties?.material || '';
    return ['historicMasonry', 'entertainmentStorefront', 'hotelStoneGlass', 'officeGlass', 'signatureBlueGlass', 'retailBrick', 'parkingGarage'].includes(material);
  }).length;
  window.__srMockRenderedFeatureContextStats = {
    ...renderedFeatureContextStats,
    cachedCells: renderedFeatureContextCache.size,
    footprintCache: window.__srMockFootprintCacheStatus || 'miss',
    footprintFetchMs: window.__srMockFootprintFetchMs || 0,
    osmEndpoint: window.__srMockOsmFootprintEndpoint || '',
    detailBudget: window.__srMockStableDetailBudget || null
  };
  publishRealWorldSignatureAudit(geojson);
  auditMockReplacementRule();
  window.__srMockRunDetailedOverlapAudit = () => {
    const source = map.getSource('src-mock-osm-buildings');
    if (!source || !geojson) return { protected: 0, names: [] };
    protectDetailedMapboxOverlaps(geojson);
    publishRealWorldSignatureAudit(geojson);
    source.setData(geojson);
    auditMockReplacementRule();
    updateSkinReadout();
    return {
      protected: window.__srMockDetailedOverlapProtectedCount || 0,
      names: window.__srMockDetailedOverlapProtectedNames || [],
      signatures: window.__srMockRealWorldSignatureNames || [],
      signatureSources: window.__srMockRealWorldSignatureSourceBreakdown || {}
    };
  };
  window.__srMockOsmBuildingError = '';
  window.__srMockSkinMode = 'osm-footprint-detail-trim-no-double';
  osmFootprintLoadedBoundsKey = boundsKey;
  osmFootprintStableCenter = [map.getCenter().lng, map.getCenter().lat];
  osmFootprintStableZoom = map.getZoom();
  updateSkinReadout();
}

function scheduleGreatMapSkinHealthCheck(delayMs = 3200) {
  if (!map || document.body.classList.contains('render-off')) return;
  window.clearTimeout(greatMapSkinHealthTimer);
  greatMapSkinHealthTimer = window.setTimeout(() => {
    if (!map || document.body.classList.contains('render-off')) return;
    const hasFootprints = false;
    const hasRealTilesetSkin = Boolean(
      realBuildingTilesetConfig.enabled
      && (
        map.getLayer?.(realBuildingTilesetConfig.baseLayerId)
        || map.getLayer?.(realBuildingTilesetConfig.roofLayerId)
      )
    );
    const hasFacadeSkin = Boolean(map.getLayer?.(window.SimpleRidesFacadeKitV2?.layerId || 'src-mock-facade-kit-v2'));
    const hasForbiddenTopLayer = Boolean(
      map.getLayer?.('src-mock-osm-structural-crowns')
      || map.getSource?.('src-mock-osm-structural-crown-polygons')
    );
    if (hasForbiddenTopLayer) {
      removeMockLayerIfPresent('src-mock-osm-structural-crowns');
      removeMockSourceIfPresent('src-mock-osm-structural-crown-polygons');
    }
    if (hasRealTilesetSkin) {
      updateDynamicDetailedMapboxProtections();
      applyVectorSkinProtectionFilters();
      refreshRealBuildingTilesetStats();
    }
    let replacementAudit = auditMockReplacementRule();
    replacementAudit.forbiddenLayers.forEach(removeMockLayerIfPresent);
    replacementAudit.lineLayers.forEach(removeMockLayerIfPresent);
    replacementAudit.forbiddenSources.forEach((sourceId) => {
      removeMockLayersForSource(sourceId);
      removeMockSourceIfPresent(sourceId);
    });
    if (replacementAudit.forbiddenLayers.length || replacementAudit.lineLayers.length || replacementAudit.forbiddenSources.length) {
      replacementAudit = auditMockReplacementRule();
    }
    window.__srMockGreatMapHealth = {
      hasFootprints,
      hasRealTilesetSkin,
      hasFacadeSkin,
      hasForbiddenTopLayer,
      forbiddenLayers: replacementAudit.forbiddenLayers,
      forbiddenSources: replacementAudit.forbiddenSources,
      lineLayers: replacementAudit.lineLayers,
      floatingMeshLayer: replacementAudit.floatingMeshLayer,
      publishReady: replacementAudit.publishReady,
      blockers: replacementAudit.blockers || [],
      checkedAt: Date.now()
    };
    updateProgressReadout();
  }, delayMs);
}

function updateFeatureIdentity(point) {
  if (!map || !featureReadout) return;
  let features = [];
  try {
    if (!map.isStyleLoaded?.()) return;
    features = map.queryRenderedFeatures(point).slice(0, 80);
  } catch {
    return;
  }
  const named = features.find((feature) => {
    const props = feature.properties || {};
    return props.name || props.name_en || props.name_script;
  });
  if (named) {
    const text = describeFeature(named, named.sourceLayer || 'Mapbox feature');
    featureReadout.textContent = `Mapbox identity: ${text}.`;
    return;
  }
  const building = features.find((feature) => feature.sourceLayer === 'building' || feature.layer?.['source-layer'] === 'building');
  if (building) {
    const height = Math.round(Number(building.properties?.height || 0));
    const context = classifyFeatureContext(building, 'building');
    featureReadout.textContent = height > 0 ? `Mapbox identity: real building footprint / approx. ${height}m / ${context}.` : `Mapbox identity: real building footprint / ${context}.`;
  }
}

function classifyFeatureContext(feature, fallback) {
  const props = feature?.properties || {};
  const haystack = [
    props.name,
    props.name_en,
    props.category,
    props.category_en,
    props.maki,
    props.class,
    props.type,
    props.group
  ].filter(Boolean).join(' ').toLowerCase();
  if (/hotel|motel|inn|suites|lodging/.test(haystack)) return 'hotel/lodging treatment';
  if (/restaurant|bar|cafe|food|shop|retail|market|store|theatre|theater|music/.test(haystack)) return 'storefront/entertainment treatment';
  if (/office|bank|business|commercial|tower/.test(haystack)) return 'office/commercial treatment';
  if (/museum|school|university|library|courthouse|government|civic|church|cathedral/.test(haystack)) return 'civic/landmark treatment';
  if (/park|plaza|garden|green|recreation/.test(haystack)) return 'park/plaza treatment';
  if (/residential|apartments|condo|home|house/.test(haystack)) return 'residential treatment';
  return fallback === 'building' ? 'height/context treatment' : `${fallback} treatment`;
}

function describeFeature(feature, fallback) {
  const props = feature?.properties || {};
  const label = props.name || props.name_en || props.name_script || props.brand || props.category_en || props.class;
  const category = props.maki || props.category || props.category_en || props.class || fallback;
  const context = classifyFeatureContext(feature, fallback);
  if (!label && !category) return context;
  return `${label || fallback} / ${category || fallback} / ${context}`;
}

function addFeatureIdentityInteractions() {
  if (!map?.addInteraction || !featureReadout) return false;
  const interactions = [
    { id: 'src-mock-poi-identity', target: { featuresetId: 'poi', importId: 'basemap' }, fallback: 'place' },
    { id: 'src-mock-building-identity', target: { featuresetId: 'buildings', importId: 'basemap' }, fallback: 'building' },
    { id: 'src-mock-landmark-identity', target: { featuresetId: 'landmark-icons', importId: 'basemap' }, fallback: 'landmark' }
  ];
  let added = false;
  interactions.forEach((interaction) => {
    try {
      map.addInteraction(interaction.id, {
        type: 'mousemove',
        target: interaction.target,
        handler: (event) => {
          const text = describeFeature(event.feature, interaction.fallback);
          if (text) featureReadout.textContent = `Mapbox identity: ${text}.`;
        }
      });
      added = true;
    } catch {
      // Interaction targets vary by style/import; fallback queryRenderedFeatures remains guarded.
    }
  });
  window.__srMockFeatureInteractions = interactions.map((item) => item.id);
  return added;
}

function initMapboxBase() {
  if (!window.mapboxgl || !token || map) return Boolean(map);
  mapboxgl.accessToken = token;
  window.__srMockMapStartedAt = performance.now();
      map = new mapboxgl.Map({
    container: 'map',
    style: mapConfig.style || 'mapbox://styles/mapbox/standard',
    center,
    zoom: 16.32,
    pitch: 58,
    maxPitch: 72,
    pitchWithRotate: true,
    bearing: Number(mapConfig.streetBearing || -18),
    antialias: true,
        pixelRatio: Math.min(window.devicePixelRatio || 1, Number(window.__srMockPerformanceBudget?.dprCap || 1.75)),
        attributionControl: true,
        customAttribution: "Building context &copy; Overture Maps Foundation",
        config: { basemap: simBasemapConfig }
      });
      terrainController = createTerrainController(map, {
        exaggeration: Number(mapConfig.terrainExaggeration || 1.04)
      });
      document.body.dataset.mockMapboxVersion = mapboxgl.version || "unknown";
      document.body.dataset.mockThreeVersion = "not-loaded";
  window.__srMockMap = map;
  window.__srMockMapboxMap = map;
  window.__srMockSimArchitectureLayers = simArchitectureLayerIds;
  document.body.dataset.mockRendererPipeline = 'mapbox-native-model-layers';
  window.__srMockMapRuntimeErrors = [];
  map.on('error', (event) => {
    const error = event?.error || event;
    const message = String(error?.message || error || 'Unknown Mapbox error');
    const cause = error?.cause;
    const entry = {
      message,
      cause: String(cause?.message || cause || ''),
      sourceId: event?.sourceId || '',
      tileId: event?.tile?.tileID?.canonical?.toString?.() || '',
      status: Number(error?.status || error?.statusCode || 0),
      at: Date.now()
    };
    window.__srMockMapRuntimeErrors = [...(window.__srMockMapRuntimeErrors || []), entry].slice(-30);
    document.body.dataset.mockMapErrorCount = String(window.__srMockMapRuntimeErrors.length);
    document.body.dataset.mockMapLastError = `${entry.sourceId ? `${entry.sourceId}: ` : ''}${message}${entry.cause ? ` (${entry.cause})` : ''}`.slice(0, 700);
    updateProgressReadout();
  });
  map.on('style.load', () => {
    recordMapReadyPerformance();
    simArchitectureInstallAttempts = 0;
    resetFacadeKitV2Manager();
    terrainController?.install?.();
    installRealBuildingTilesetSource();
    updateDynamicDetailedMapboxProtections(true);
    installFacadeKitV2();
    if (!basemapConfigApplied) {
      basemapConfigApplied = true;
      applySimBasemapConfig(!document.body.classList.contains('render-off'));
    }
    addFeatureIdentityInteractions();
    installAustinSimArchitectureLayersSoon();
    scheduleDetailedMapboxProtectionScan(480, true);
    window.setTimeout(() => scheduleDetailedMapboxProtectionScan(0, true), 1800);
    window.setTimeout(() => scheduleDetailedMapboxProtectionScan(0, true), 4200);
    window.setTimeout(() => scheduleDetailedMapboxProtectionScan(0, true), 8000);
    scheduleGreatMapSkinHealthCheck(5200);
  });
  map.on('load', () => {
    recordMapReadyPerformance();
    simArchitectureInstallAttempts = 0;
    terrainController?.install?.();
    installRealBuildingTilesetSource();
    updateDynamicDetailedMapboxProtections(true);
    installFacadeKitV2();
    addFeatureIdentityInteractions();
    installAustinSimArchitectureLayersSoon();
    scheduleGreatMapSkinHealthCheck(5200);
  });
  map.on('styledata', () => {
    if (simArchitectureInstallAttempts < 4) installAustinSimArchitectureLayersSoon();
  });
  map.on('sourcedata', (event) => {
    if (event.sourceId !== realBuildingTilesetConfig.sourceId) return;
    refreshRealBuildingTilesetStats();
    window.clearTimeout(facadeKitV2SourceRefreshTimer);
    facadeKitV2SourceRefreshTimer = window.setTimeout(() => {
      facadeKitV2SourceRefreshTimer = 0;
      scheduleDetailedMapboxProtectionScan(0, true);
      facadeKitV2Manager?.refresh?.(0);
    }, 900);
  });
  map.on('idle', () => {
    const now = Date.now();
    if (now - lastIdleMaintenanceAt < 4000) return;
    lastIdleMaintenanceAt = now;
    installRealBuildingTilesetSource();
    if (!map.getLayer?.(window.SimpleRidesFacadeKitV2?.layerId || 'src-mock-facade-kit-v2')) installFacadeKitV2();
    if (!window.__srMockDynamicDetailedProtectionCount) scheduleDetailedMapboxProtectionScan(240);
    refreshRealBuildingTilesetStats();
    // Terrain tiles may settle after the initial Facade Kit build. Refreshing is
    // signature-gated, so this only rebuilds when elevation or the view changed.
    facadeKitV2Manager?.refresh?.(0);
    installAustinSimArchitectureLayersSoon();
    scheduleGreatMapSkinHealthCheck(4200);
  });
  map.on('remove', () => {
    terrainController?.destroy?.();
  });
  map.on('moveend', () => {
    scheduleDetailedMapboxProtectionScan(140, true);
    scheduleGreatMapSkinHealthCheck(4800);
  });
  map.on('mousemove', (event) => updateFeatureIdentity(event.point));
  window.setTimeout(() => {
    installRealBuildingTilesetSource();
    refreshRealBuildingTilesetStats();
    installFacadeKitV2();
  }, 2000);
  scheduleGreatMapSkinHealthCheck(5200);
  return true;
}

function reloadMockArchitectureStyle() {
  if (!map) return false;
  resetFacadeKitV2Manager();
  mapReadyRecorded = false;
  window.__srMockMapStartedAt = performance.now();
  basemapConfigApplied = true;
  map.setStyle(mapConfig.style || 'mapbox://styles/mapbox/standard');
  return true;
}
window.__srMockReloadStyle = reloadMockArchitectureStyle;

function destroyMockArchitectureSystem() {
  window.clearTimeout(simArchitectureInstallTimer);
  window.clearTimeout(osmFootprintRefreshTimer);
  window.clearTimeout(greatMapSkinHealthTimer);
  window.clearTimeout(optimizeRadarTimer);
  window.clearTimeout(detailedMapboxProtectionScanTimer);
  detailedMapboxProtectionScanTimer = 0;
  detailedMapboxProtectionEmptyRetries = 0;
  detailedMapboxProtectionRegistry.clear();
  liveLocationController?.destroy?.();
  liveLocationController = null;
  terrainController?.destroy?.();
  terrainController = null;
  resetFacadeKitV2Manager();
  const activeMap = map;
  map = null;
  window.__srMockMap = null;
  window.__srMockMapboxMap = null;
  try {
    activeMap?.remove?.();
  } catch (error) {
    window.__srMockMapDestroyError = String(error?.message || error);
  }
  document.body.dataset.mockRendererPipeline = 'destroyed';
}

async function startLockedMapboxMock() {
  window.__srMockRuntimeStartAttempts = Number(window.__srMockRuntimeStartAttempts || 0) + 1;
  if (!window.mapboxgl) throw new Error('Bundled Mapbox GL runtime is unavailable.');
  if (!token) {
    window.__srMockSkinMode = 'mapbox-standard-3d-fallback';
    updateSkinReadout();
    setStatus('Mapbox token unavailable. Mock shell is stable, but the Austin map cannot start.');
    return null;
  }
  if (!initMapboxBase()) {
    window.__srMockSkinMode = 'mapbox-standard-3d-fallback';
    updateSkinReadout();
    setStatus('Mapbox runtime unavailable. Mock shell is stable, but the Austin map cannot start.');
    return null;
  }
  window.__srMockGreatMapLocked = true;
  auditMockReplacementRule();
  setStatus('Mapbox Austin layout with Sim-style visual treatment active. Mock only.');
  return map;
}

async function startLiveLocationController() {
  if (!map || liveLocationController) return liveLocationController;
  liveLocationController = new LiveLocationController({
    map,
    mapboxgl,
    readout: locationReadout,
    onLocation(position) {
      liveCenter = position.coordinate;
      activatePublishedBuildingTilesetForCoordinate(liveCenter);
    },
    cameraUpdater: updateTerrainAwareGpsCamera
  });
  liveLocationController.install();
  window.__srMockLiveLocationController = liveLocationController;
  window.__srMockSetCameraMode = (mode) => {
    if (mode === 'follow') return liveLocationController?.resumeFollow?.();
    return liveLocationController?.setMode?.(mode);
  };
  const query = new URLSearchParams(window.location.search);
  if (query.has('gpsReplay')) {
    try {
      const response = await fetch('/map-architecture/austin-gps-replay.json');
      if (!response.ok) throw new Error(`GPS replay HTTP ${response.status}`);
      const replay = await response.json();
      await liveLocationController.replay(replay.points || [], { intervalMs: 120 });
    } catch (error) {
      document.body.dataset.mockGpsReplay = 'failed';
      window.__srMockGpsReplayError = String(error?.message || error);
    }
  }
  return liveLocationController;
}

function scheduleMapboxRuntimeWatchdog() {
  [4200, 8200, 13200].forEach((delayMs, index) => {
    window.setTimeout(() => {
      if (map || document.body.classList.contains('render-off')) return;
      window.__srMockRuntimeWatchdogAttempt = index + 1;
      startLockedMapboxMock().then(startLiveLocationController).catch((error) => {
        window.__srMockRuntimeWatchdogError = String(error?.message || error);
        window.__srMockSkinMode = 'mapbox-standard-3d-fallback';
        updateSkinReadout();
      });
    }, delayMs);
  });
}

resetBtn.addEventListener('click', () => {
  liveLocationController?.resumeFollow?.();
  map?.easeTo?.({
    center: liveCenter,
    zoom: 16.32,
    pitch: 58,
    bearing: Number(mapConfig.streetBearing || -18),
    duration: 500
  });
});

bindMapboxControls();
let progressCollapseUserOverride = false;
function setProgressCollapsed(collapsed) {
  if (!progressCard || !toggleProgressBtn) return;
  progressCard.classList.toggle('is-collapsed', collapsed);
  toggleProgressBtn.setAttribute('aria-expanded', String(!collapsed));
  toggleProgressBtn.textContent = collapsed ? 'Details' : 'Hide';
}
toggleProgressBtn?.addEventListener('click', () => {
  progressCollapseUserOverride = true;
  setProgressCollapsed(!progressCard?.classList.contains('is-collapsed'));
});
const compactProgressMedia = window.matchMedia?.('(max-width: 720px)');
setProgressCollapsed(compactProgressMedia?.matches === true);
compactProgressMedia?.addEventListener?.('change', (event) => {
  if (!progressCollapseUserOverride) setProgressCollapsed(event.matches);
});
optimizeBtn?.addEventListener('click', optimizeMapExperience);
window.addEventListener('pagehide', destroyMockArchitectureSystem, { once: true });

try {
  startLockedMapboxMock().then(startLiveLocationController).catch((error) => {
    console.error(error);
    window.__srMockSkinMode = 'mapbox-standard-3d-fallback';
    updateSkinReadout();
    setStatus('Mapbox runtime failed to start. Mock shell remains stable; check console for details.');
  });
  scheduleMapboxRuntimeWatchdog();
} catch (error) {
  console.error(error);
  setStatus('The Sim-style mock renderer failed to start. Check console for details.');
}
