(function installSimpleRidesFacadeKitV2(global) {
  'use strict';

  const mapboxgl = global.mapboxgl;
  if (!mapboxgl) return;

  const LAYER_ID = 'src-mock-facade-kit-v2';
  const MODEL_SOURCE_ID = 'src-mock-facade-kit-v2-model-anchors';
  const ASSET_URL = './assets/map-architecture/facade-kit-v2.glb';
  const MODEL_ASSET_DIRECTORY = './assets/map-architecture/facade-kit-v2-models';
  const MODEL_ASSET_VERSION = '20260730-readable-facades-v3';
  const MIN_ZOOM = 12.8;
  const PERFORMANCE_BUDGET = global.__srMockPerformanceBudget || {};
  const MAX_BUILDINGS = Number(PERFORMANCE_BUDGET.maxBuildings || 58);
  const MAX_INSTANCES = Number(PERFORMANCE_BUDGET.maxInstances || 1500);
  // Keep modules flush enough to read as cladding while clearing the native
  // building depth surface at the approved downtown camera distance.
  const MIN_VISIBLE_FACADE_OFFSET_METERS = 0.2;
  const MODULE_NAMES = [
    'FacadeKit_WindowBay',
    'FacadeKit_EntryDoor',
    'FacadeKit_Canopy',
    'FacadeKit_BrickPanel',
    'FacadeKit_LimestonePanel',
    'FacadeKit_WoodPanel',
    'FacadeKit_ConcretePanel',
    'FacadeKit_Mullion',
    'FacadeKit_GarageDoor',
    'FacadeKit_Porch',
    'FacadeKit_Driveway',
    'FacadeKit_GableRoofCharcoal',
    'FacadeKit_GableRoofTerracotta',
    'FacadeKit_HipRoofCharcoal',
    'FacadeKit_HipRoofTerracotta',
    'FacadeKit_TowerWindowBay',
    'FacadeKit_TowerWindowGrid',
    'FacadeKit_TowerMullionGrid',
    'FacadeKit_TowerLobbyGlass',
    'FacadeKit_TowerSpandrel',
    'FacadeKit_TowerColumn',
    'FacadeKit_MidriseWindowBand',
    'FacadeKit_MidriseWindowGrid',
    'FacadeKit_MidriseMullionGrid',
    'FacadeKit_LowriseWindowGrid',
    'FacadeKit_LowriseMullionGrid',
    'FacadeKit_ParkingOpeningGrid',
    'FacadeKit_MasonryPier',
    'FacadeKit_BalconySlab',
    'FacadeKit_BalconyRail',
    'FacadeKit_StorefrontFrame',
    'FacadeKit_TowerCrownBand'
  ];
  const ASSET_MODULE_NAMES = MODULE_NAMES.flatMap((name) => [0, 1, 2].map((lod) => `${name}_LOD${lod}`));

  function selectLod(zoom) {
    if (zoom >= Number(PERFORMANCE_BUDGET.lod0Zoom || 16.5)) return 0;
    if (zoom >= Number(PERFORMANCE_BUDGET.lod1Zoom || 14.8)) return 1;
    return 2;
  }

  function materialFamilyForModule(name) {
    if (/MullionGrid/.test(name)) return 'trim';
    if (/ParkingOpening/.test(name)) return 'metal';
    if (/Window|Glass|EntryDoor/.test(name)) return 'glass';
    if (/Brick/.test(name)) return 'brick';
    if (/Limestone|Masonry/.test(name)) return 'stone';
    if (/Wood|Porch/.test(name)) return 'wood';
    if (/Mullion|Rail|Frame|Canopy|Crown|Spandrel/.test(name)) return 'metal';
    return 'concrete';
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function terrainElevationMeters(map, coordinate) {
    if (!map?.queryTerrainElevation || !coordinate) return 0;
    try {
      const elevation = Number(map.queryTerrainElevation(coordinate, { exaggerated: true }));
      return Number.isFinite(elevation) ? elevation : 0;
    } catch {
      return 0;
    }
  }

  function outerRing(feature) {
    const geometry = feature?.geometry;
    if (geometry?.type === 'Polygon') return geometry.coordinates?.[0] || null;
    if (geometry?.type === 'MultiPolygon') return geometry.coordinates?.[0]?.[0] || null;
    return null;
  }

  function ringCentroid(ring) {
    if (!Array.isArray(ring) || ring.length < 4) return null;
    const usable = ring.slice(0, -1);
    if (!usable.length) return null;
    const total = usable.reduce((sum, coord) => [sum[0] + Number(coord[0]), sum[1] + Number(coord[1])], [0, 0]);
    return [total[0] / usable.length, total[1] / usable.length];
  }

  function featureKey(feature, centroid) {
    const props = feature?.properties || {};
    return String(
      feature?.id
      || props.id
      || props.overtureId
      || props.globalId
      || props.osm_id
      || `${centroid?.[0]?.toFixed?.(6)}:${centroid?.[1]?.toFixed?.(6)}:${Number(props.height || 0).toFixed(1)}`
    );
  }

  function viewSignature(features, map) {
    const center = map.getCenter();
    const canvas = map.getCanvas();
    const terrainElevation = terrainElevationMeters(map, [center.lng, center.lat]);
    let featureHash = 2166136261;
    const stride = Math.max(1, Math.floor((features?.length || 0) / 160));
    for (let index = 0; index < (features?.length || 0); index += stride) {
      const feature = features[index];
      const centroid = ringCentroid(outerRing(feature));
      const key = featureKey(feature, centroid);
      for (let charIndex = 0; charIndex < key.length; charIndex += 1) {
        featureHash ^= key.charCodeAt(charIndex);
        featureHash = Math.imul(featureHash, 16777619);
      }
    }
    return [
      Number(map.getZoom()).toFixed(2),
      Number(map.getBearing()).toFixed(1),
      Number(map.getPitch()).toFixed(1),
      Number(center.lng).toFixed(4),
      Number(center.lat).toFixed(4),
      canvas.clientWidth || 0,
      canvas.clientHeight || 0,
      terrainElevation.toFixed(1),
      features?.length || 0,
      featureHash >>> 0
    ].join(':');
  }

  function materialPanelName(feature) {
    const material = String(feature?.properties?.material || '').toLowerCase();
    if (material.includes('brick') || material.includes('terracotta')) return 'FacadeKit_BrickPanel';
    if (material.includes('wood')) return 'FacadeKit_WoodPanel';
    if (material.includes('limestone') || material.includes('stone') || material.includes('hotel')) return 'FacadeKit_LimestonePanel';
    return 'FacadeKit_ConcretePanel';
  }

  function isStorefront(feature) {
    const props = feature?.properties || {};
    const text = `${props.category || ''} ${props.material || ''} ${props.contextCategory || ''}`.toLowerCase();
    return /store|retail|restaurant|hotel|entertainment/.test(text);
  }

  function isResidential(feature, height) {
    const props = feature?.properties || {};
    const text = `${props.category || ''} ${props.material || ''} ${props.contextCategory || ''} ${props.subtype || ''}`.toLowerCase();
    return height <= 15 && /residential|house|home|dwelling|warmwood|residentialbrick/.test(text);
  }

  function hasResidentialContext(feature) {
    const props = feature?.properties || {};
    const text = `${props.category || ''} ${props.material || ''} ${props.contextCategory || ''} ${props.subtype || ''}`.toLowerCase();
    return /residential|apartment|condo|housing|warmwood|residentialbrick/.test(text);
  }

  function buildingDescriptor(feature) {
    const props = feature?.properties || {};
    return [
      props.category,
      props.material,
      props.contextCategory,
      props.subtype,
      props.partRole,
      props.building,
      props.building_type,
      props.name,
      props.contextName
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function isPlainArchitectureCandidate(feature) {
    const props = feature?.properties || {};
    if (props.preserveMapboxDetail === true || props.preserveMapboxDetail === 'true') return false;
    const category = String(props.category || props.contextCategory || '').toLowerCase();
    const material = String(props.material || '').toLowerCase();
    if (category === 'civic') return false;
    if (/signatureblueglass|civiclimestone|historicmasonry/.test(material)) return false;
    const descriptor = buildingDescriptor(feature);
    return !descriptor || /building|residential|house|home|apartment|condo|store|retail|restaurant|hotel|office|commercial|parking|garage|brick|wood|concrete|limestone|tanstone|pal[e]?concrete|warmwood|glass/.test(descriptor);
  }

  function classifyBuilding(feature, height) {
    const descriptor = buildingDescriptor(feature);
    if (/parking|garage/.test(descriptor)) return 'parking';
    if (height <= 15 && /residential|house|home|dwelling|warmwood|residentialbrick/.test(descriptor)) return 'home';
    if (/store|retail|restaurant|cafe|bar|entertainment/.test(descriptor)) return height >= 14 ? 'storefront-midrise' : 'storefront';
    if (/hotel|lodging|motel|suites/.test(descriptor)) return height >= 28 ? 'hotel-tower' : 'hotel';
    if (/office|commercial|officeglass|midriseglass|steelstone|creamglass/.test(descriptor)) return height >= 28 ? 'office-tower' : 'office';
    if (height >= 28) return 'tower';
    if (height >= 14) return 'midrise';
    return 'lowrise';
  }

  function selectViewportBalancedCandidates(candidates, maxBuildings, viewportWidth, viewportHeight) {
    const columns = 5;
    const rows = 4;
    const buckets = Array.from({ length: columns * rows }, () => []);
    candidates.forEach((candidate) => {
      const column = clamp(Math.floor((candidate.screenPoint.x / Math.max(viewportWidth, 1)) * columns), 0, columns - 1);
      const row = clamp(Math.floor((candidate.screenPoint.y / Math.max(viewportHeight, 1)) * rows), 0, rows - 1);
      buckets[(row * columns) + column].push(candidate);
    });
    buckets.forEach((bucket) => bucket.sort((left, right) => left.distance - right.distance));
    const selected = [];
    let round = 0;
    while (selected.length < maxBuildings && buckets.some((bucket) => round < bucket.length)) {
      for (const bucket of buckets) {
        if (selected.length >= maxBuildings) break;
        if (bucket[round]) selected.push(bucket[round]);
      }
      round += 1;
    }
    return selected;
  }

  function stableNumber(value) {
    const text = String(value || 'facade');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function longestExteriorEdge(ring) {
    if (!Array.isArray(ring) || ring.length < 2) return null;
    let winner = null;
    for (let index = 1; index < ring.length; index += 1) {
      const a = mapboxgl.MercatorCoordinate.fromLngLat(ring[index - 1], 0);
      const b = mapboxgl.MercatorCoordinate.fromLngLat(ring[index], 0);
      const meterScale = a.meterInMercatorCoordinateUnits();
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const meters = Math.hypot(dx, dy) / meterScale;
      if (!winner || meters > winner.meters) winner = { a, b, dx, dy, meters, meterScale };
    }
    return winner;
  }

  function pointToSegmentDistance(point, segment) {
    const vx = segment.b.x - segment.a.x;
    const vy = segment.b.y - segment.a.y;
    const lengthSquared = (vx * vx) + (vy * vy) || 1;
    const projection = clamp(((point.x - segment.a.x) * vx + (point.y - segment.a.y) * vy) / lengthSquared, 0, 1);
    return Math.hypot(point.x - (segment.a.x + projection * vx), point.y - (segment.a.y + projection * vy));
  }

  function renderedRoadSegments(map) {
    let features = [];
    try {
      features = map.queryRenderedFeatures() || [];
    } catch {
      return [];
    }
    const segments = [];
    for (const feature of features) {
      const descriptor = `${feature?.layer?.id || ''} ${feature?.properties?.class || ''} ${feature?.properties?.type || ''} ${feature?.properties?.structure || ''}`.toLowerCase();
      if (!/road|street|motorway|trunk|primary|secondary|tertiary|residential|service/.test(descriptor)) continue;
      const geometry = feature?.geometry;
      const lines = geometry?.type === 'LineString'
        ? [geometry.coordinates]
        : geometry?.type === 'MultiLineString'
        ? geometry.coordinates
        : [];
      for (const line of lines) {
        for (let index = 1; index < line.length; index += 1) {
          segments.push({
            a: mapboxgl.MercatorCoordinate.fromLngLat(line[index - 1], 0),
            b: mapboxgl.MercatorCoordinate.fromLngLat(line[index], 0)
          });
          if (segments.length >= 800) return segments;
        }
      }
    }
    return segments;
  }

  function streetFacingExteriorEdge(ring, roadSegments) {
    if (!roadSegments.length) return longestExteriorEdge(ring);
    let winner = null;
    for (let index = 1; index < ring.length; index += 1) {
      const a = mapboxgl.MercatorCoordinate.fromLngLat(ring[index - 1], 0);
      const b = mapboxgl.MercatorCoordinate.fromLngLat(ring[index], 0);
      const meterScale = a.meterInMercatorCoordinateUnits();
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const meters = Math.hypot(dx, dy) / meterScale;
      if (meters < 4 || meters > 110) continue;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let roadDistance = Infinity;
      for (const segment of roadSegments) roadDistance = Math.min(roadDistance, pointToSegmentDistance(midpoint, segment));
      const roadDistanceMeters = roadDistance / meterScale;
      if (!winner || roadDistanceMeters < winner.roadDistanceMeters) {
        winner = { a, b, dx, dy, meters, meterScale, roadDistanceMeters };
      }
    }
    return winner?.roadDistanceMeters <= 80 ? winner : longestExteriorEdge(ring);
  }

  function frameFromEdge(edge, centroid) {
    if (!edge || edge.meters < 4 || edge.meters > 110) return null;
    const centerMerc = mapboxgl.MercatorCoordinate.fromLngLat(centroid, 0);
    const midpoint = { x: (edge.a.x + edge.b.x) / 2, y: (edge.a.y + edge.b.y) / 2 };
    const lengthMerc = Math.hypot(edge.dx, edge.dy) || 1;
    const unit = { x: edge.dx / lengthMerc, y: edge.dy / lengthMerc };
    let normal = { x: -unit.y, y: unit.x };
    const away = { x: midpoint.x - centerMerc.x, y: midpoint.y - centerMerc.y };
    if ((away.x * normal.x) + (away.y * normal.y) < 0) normal = { x: -normal.x, y: -normal.y };
    return {
      ...edge,
      midpoint,
      unit,
      normal,
      angle: Math.atan2(edge.dy, edge.dx)
    };
  }

  function outwardEdgeFrame(ring, centroid, roadSegments) {
    return frameFromEdge(streetFacingExteriorEdge(ring, roadSegments), centroid);
  }

  function adjacentTowerFrame(ring, centroid, primaryFrame) {
    if (!primaryFrame) return null;
    let winner = null;
    for (let index = 1; index < ring.length; index += 1) {
      const a = mapboxgl.MercatorCoordinate.fromLngLat(ring[index - 1], 0);
      const b = mapboxgl.MercatorCoordinate.fromLngLat(ring[index], 0);
      const meterScale = a.meterInMercatorCoordinateUnits();
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const mercatorLength = Math.hypot(dx, dy) || 1;
      const meters = mercatorLength / meterScale;
      if (meters < 7 || meters > 110) continue;
      const unit = { x: dx / mercatorLength, y: dy / mercatorLength };
      const alignment = Math.abs((unit.x * primaryFrame.unit.x) + (unit.y * primaryFrame.unit.y));
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const primaryDistance = Math.hypot(midpoint.x - primaryFrame.midpoint.x, midpoint.y - primaryFrame.midpoint.y) / meterScale;
      if (alignment > 0.55 || primaryDistance < 2) continue;
      const score = meters - primaryDistance * 0.08;
      if (!winner || score > winner.score) winner = { a, b, dx, dy, meters, meterScale, score };
    }
    return frameFromEdge(winner, centroid);
  }

  function exteriorEdgeFrames(ring, centroid, primaryFrame, maxFaces = 3) {
    if (!primaryFrame) return [];
    const frames = [primaryFrame];
    const candidates = [];
    for (let index = 1; index < ring.length; index += 1) {
      const a = mapboxgl.MercatorCoordinate.fromLngLat(ring[index - 1], 0);
      const b = mapboxgl.MercatorCoordinate.fromLngLat(ring[index], 0);
      const meterScale = a.meterInMercatorCoordinateUnits();
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const mercatorLength = Math.hypot(dx, dy) || 1;
      const meters = mercatorLength / meterScale;
      if (meters < 5 || meters > 110) continue;
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const primaryDistance = Math.hypot(midpoint.x - primaryFrame.midpoint.x, midpoint.y - primaryFrame.midpoint.y) / meterScale;
      if (primaryDistance < 1.5) continue;
      const frame = frameFromEdge({ a, b, dx, dy, meters, meterScale }, centroid);
      if (frame) candidates.push(frame);
    }
    candidates.sort((left, right) => right.meters - left.meters);
    for (const candidate of candidates) {
      if (frames.length >= maxFaces) break;
      const duplicate = frames.some((frame) => {
        const alignment = Math.abs((frame.unit.x * candidate.unit.x) + (frame.unit.y * candidate.unit.y));
        const midpointDistance = Math.hypot(frame.midpoint.x - candidate.midpoint.x, frame.midpoint.y - candidate.midpoint.y) / candidate.meterScale;
        return alignment > 0.985 && midpointDistance < 3;
      });
      if (!duplicate) frames.push(candidate);
    }
    return frames;
  }

  function screenFacingExteriorFrames(frames, map, maxFaces = 2) {
    const ranked = (frames || []).map((frame) => {
      try {
        const meter = frame.meterScale;
        const surface = new mapboxgl.MercatorCoordinate(frame.midpoint.x, frame.midpoint.y, 0).toLngLat();
        const outward = new mapboxgl.MercatorCoordinate(
          frame.midpoint.x + (frame.normal.x * meter * 1.5),
          frame.midpoint.y + (frame.normal.y * meter * 1.5),
          0
        ).toLngLat();
        const surfacePoint = map.project(surface);
        const outwardPoint = map.project(outward);
        return { frame, score: outwardPoint.y - surfacePoint.y };
      } catch {
        return { frame, score: 0 };
      }
    }).sort((left, right) => right.score - left.score);
    const visible = ranked.filter((item) => item.score > 0.01);
    return (visible.length ? visible : ranked.slice(0, 1))
      .slice(0, Math.max(1, maxFaces))
      .map((item) => item.frame);
  }

  function matrixFor(frame, alongMeters, outwardMeters, altitudeMeters, dimensionsMeters) {
    const meter = frame.meterScale;
    const visibleOutwardMeters = outwardMeters > 0 && outwardMeters < MIN_VISIBLE_FACADE_OFFSET_METERS
      ? MIN_VISIBLE_FACADE_OFFSET_METERS
      : outwardMeters;
    const positionX = frame.midpoint.x + (frame.unit.x * alongMeters * meter) + (frame.normal.x * visibleOutwardMeters * meter);
    const positionY = frame.midpoint.y + (frame.unit.y * alongMeters * meter) + (frame.normal.y * visibleOutwardMeters * meter);
    const coordinate = new mapboxgl.MercatorCoordinate(positionX, positionY, 0).toLngLat();
    return {
      coordinates: [coordinate.lng, coordinate.lat],
      // Facade Kit GLBs are authored Y-up. Scale the local height before the
      // geographic model pass stands it on Z, then follow the real wall bearing.
      modelScale: [dimensionsMeters[0], dimensionsMeters[2], dimensionsMeters[1]],
      modelRotation: [90, 0, -(frame.angle * 180 / Math.PI)],
      // Native model layers use ground elevation automatically; this is only
      // the architectural height above the local terrain surface.
      modelTranslation: [0, 0, altitudeMeters]
    };
  }

  function footprintDepthMeters(frame, centroid) {
    const center = mapboxgl.MercatorCoordinate.fromLngLat(centroid, 0);
    const halfDepth = Math.hypot(center.x - frame.midpoint.x, center.y - frame.midpoint.y) / frame.meterScale;
    return clamp(halfDepth * 2, 5.5, 24);
  }

  function pushRecord(records, name, matrix, budget) {
    if (budget.count >= MAX_INSTANCES) return false;
    records[name].push(matrix);
    budget.count += 1;
    return true;
  }

  function addFacadeMaterialBacking(records, frame, height, feature, budget, maxHeight = 64) {
    if (!frame || budget.count >= MAX_INSTANCES) return 0;
    const facadeWidth = clamp(frame.meters * 0.94, 4, 46);
    const panelHeight = clamp(height - 0.45, 3.2, maxHeight);
    const panelCenter = 0.22 + panelHeight / 2;
    return pushRecord(records, materialPanelName(feature), matrixFor(
      frame,
      0,
      0.075,
      panelCenter,
      [facadeWidth, 0.045, panelHeight]
    ), budget) ? 1 : 0;
  }

  function conservativeFacadeTop(height, minimum = 8, maximum = 56) {
    const numericHeight = Math.max(4, Number(height || 0));
    return clamp(Math.min(numericHeight - 0.9, numericHeight * 0.9), minimum, maximum);
  }

  function addTowerFacade(records, frame, height, feature, budget) {
    if (!frame || budget.count >= MAX_INSTANCES) return 0;
    const startCount = budget.count;
    const facadeWidth = clamp(frame.meters * 0.9, 8, 44);
    const facadeTop = conservativeFacadeTop(height, 18, 56);
    const verticalBase = 5.0;
    const verticalHeight = Math.max(8, facadeTop - verticalBase - 1.1);
    const verticalCenter = verticalBase + verticalHeight / 2;

    pushRecord(records, 'FacadeKit_TowerLobbyGlass', matrixFor(
      frame,
      0,
      0.06,
      1.85,
      [facadeWidth * 0.82, 0.09, 3.6]
    ), budget);

    pushRecord(records, 'FacadeKit_Canopy', matrixFor(frame, 0, 0.52, 3.72, [facadeWidth * 0.46, 0.95, 0.18]), budget);

    pushRecord(records, 'FacadeKit_TowerWindowGrid', matrixFor(
      frame,
      0,
      0.16,
      verticalCenter,
      [facadeWidth * 0.88, 0.09, verticalHeight]
    ), budget);
    pushRecord(records, 'FacadeKit_TowerMullionGrid', matrixFor(
      frame,
      0,
      0.225,
      verticalCenter,
      [facadeWidth * 0.88, 0.045, verticalHeight]
    ), budget);

    for (const fraction of [0.52]) {
      pushRecord(records, 'FacadeKit_TowerSpandrel', matrixFor(
        frame,
        0,
        0.14,
        verticalBase + verticalHeight * fraction,
        [facadeWidth * 0.9, 0.075, 0.26]
      ), budget);
    }

    for (const along of [-facadeWidth * 0.45, facadeWidth * 0.45]) {
      pushRecord(records, 'FacadeKit_TowerColumn', matrixFor(
        frame,
        along,
        0.18,
        verticalCenter,
        [0.36, 0.11, verticalHeight + 0.3]
      ), budget);
    }

    pushRecord(records, 'FacadeKit_TowerCrownBand', matrixFor(
      frame,
      0,
      0.14,
      facadeTop - 0.38,
      [facadeWidth * 0.92, 0.08, 0.44]
    ), budget);
    pushRecord(records, 'FacadeKit_EntryDoor', matrixFor(
      frame,
      -Math.min(4.5, facadeWidth * 0.2),
      0.075,
      1.3,
      [2.0, 0.11, 2.75]
    ), budget);
    return budget.count - startCount;
  }

  function addMidriseFacade(records, frame, height, feature, budget) {
    if (!frame || budget.count >= MAX_INSTANCES) return { pieces: 0, balconies: 0, storefront: false };
    const startCount = budget.count;
    const facadeWidth = clamp(frame.meters * 0.9, 6, 40);
    const residential = hasResidentialContext(feature);
    const storefront = isStorefront(feature);
    const windowBandWidth = facadeWidth * (residential ? 0.68 : 0.76);
    const facadeTop = conservativeFacadeTop(height, 10, 34);
    const windowBase = 4.6;
    const panelHeight = Math.max(3.8, facadeTop - windowBase - 0.9);
    pushRecord(records, 'FacadeKit_MidriseWindowGrid', matrixFor(
      frame,
      0,
      0.16,
      windowBase + panelHeight / 2,
      [windowBandWidth, 0.09, panelHeight]
    ), budget);
    pushRecord(records, 'FacadeKit_MidriseMullionGrid', matrixFor(
      frame,
      0,
      0.225,
      windowBase + panelHeight / 2,
      [windowBandWidth, 0.045, panelHeight]
    ), budget);

    for (const fraction of [0.56]) {
      pushRecord(records, 'FacadeKit_TowerSpandrel', matrixFor(
        frame,
        0,
        0.14,
        windowBase + panelHeight * fraction,
        [windowBandWidth * 1.04, 0.07, 0.22]
      ), budget);
    }

    const pierHeight = Math.max(6, facadeTop - 3.4);
    const pierCenter = 3.1 + pierHeight / 2;
    const pierModule = materialPanelName(feature);
    for (const along of [-windowBandWidth * 0.52, windowBandWidth * 0.52]) {
      pushRecord(records, pierModule, matrixFor(
        frame,
        along,
        0.17,
        pierCenter,
        [0.34, 0.09, pierHeight]
      ), budget);
    }

    pushRecord(records, 'FacadeKit_TowerLobbyGlass', matrixFor(
      frame,
      0,
      0.06,
      1.75,
      [facadeWidth * 0.76, 0.065, 3.1]
    ), budget);
    pushRecord(records, 'FacadeKit_TowerCrownBand', matrixFor(frame, 0, 0.15, facadeTop - 0.42, [facadeWidth * 0.86, 0.08, 0.34]), budget);

    const levels = clamp(Math.floor((facadeTop - 4) / 3.1), 2, 7);
    let balconies = 0;
    if (residential) {
      const balconyWidth = facadeWidth * 0.54;
      for (let level = 0; level < levels && balconies < 2; level += 3) {
        const altitude = 4.0 + (level * 3.05);
        if (altitude > facadeTop - 1.2) break;
        pushRecord(records, 'FacadeKit_BalconySlab', matrixFor(frame, 0, 0.48, altitude, [balconyWidth, 0.9, 0.14]), budget);
        if (pushRecord(records, 'FacadeKit_BalconyRail', matrixFor(frame, 0, 0.92, altitude + 0.48, [balconyWidth * 0.96, 0.06, 0.82]), budget)) balconies += 1;
      }
    } else if (storefront) {
      pushRecord(records, 'FacadeKit_Canopy', matrixFor(frame, 0, 0.42, 3.4, [facadeWidth * 0.62, 0.78, 0.16]), budget);
    }

    pushRecord(records, 'FacadeKit_EntryDoor', matrixFor(frame, -Math.min(3.6, facadeWidth * 0.2), 0.22, 1.3, [1.65, 0.09, 2.6]), budget);
    return { pieces: budget.count - startCount, balconies, storefront };
  }

  function addParkingFacade(records, frame, height, budget) {
    if (!frame || budget.count >= MAX_INSTANCES) return { pieces: 0, openings: 0 };
    const startCount = budget.count;
    let openings = 0;
    const facadeWidth = clamp(frame.meters * 0.88, 8, 42);
    const facadeTop = conservativeFacadeTop(height, 7, 30);
    const levels = clamp(Math.floor(facadeTop / 3.15), 2, 7);
    const bays = clamp(Math.floor(facadeWidth / 5.2), 2, 7);
    const baySpacing = facadeWidth / bays;
    const gridHeight = Math.max(4, Math.min(facadeTop - 1.1, levels * 3.05));
    pushRecord(records, 'FacadeKit_ParkingOpeningGrid', matrixFor(
      frame,
      0,
      0.17,
      0.7 + gridHeight / 2,
      [facadeWidth * 0.92, 0.07, gridHeight]
    ), budget);
    openings = levels * bays;
    const pierHeight = clamp(facadeTop - 0.8, 6, 28);
    const pierCenter = pierHeight / 2;
    for (const along of [-facadeWidth * 0.46, 0, facadeWidth * 0.46]) {
      pushRecord(records, 'FacadeKit_ConcretePanel', matrixFor(frame, along, 0.2, pierCenter, [0.3, 0.08, pierHeight]), budget);
    }
    pushRecord(records, 'FacadeKit_Canopy', matrixFor(frame, -facadeWidth * 0.3, 0.4, 2.9, [3.6, 0.72, 0.14]), budget);
    return { pieces: budget.count - startCount, openings };
  }

  function addOrderedWindowGrid(records, frame, height, residential, budget, secondary = false) {
    if (!frame || budget.count >= MAX_INSTANCES) return 0;
    const startCount = budget.count;
    const facadeWidth = clamp(frame.meters * 0.9, 4, 34);
    const floors = residential
      ? clamp(Math.round(height / 3.2), 1, 2)
      : clamp(Math.floor(height / 3.2) - 1, 1, 5);
    const bays = residential
      ? clamp(Math.floor(facadeWidth / 3.6), 2, 4)
      : clamp(Math.floor(facadeWidth / 3.1), 2, 6);
    const firstAltitude = residential ? 1.9 : 4.25;
    const lastAltitude = firstAltitude + Math.max(0, floors - 1) * (residential ? 3 : 3.05);
    const visibleFloors = lastAltitude <= height - 1 ? floors : Math.max(1, floors - 1);
    const gridHeight = Math.max(residential ? 1.55 : 1.75, visibleFloors * (residential ? 2.35 : 2.5));
    const gridCenter = firstAltitude + Math.max(0, visibleFloors - 1) * (residential ? 1.5 : 1.525);
    pushRecord(records, 'FacadeKit_LowriseWindowGrid', matrixFor(
      frame,
      secondary && residential ? facadeWidth * 0.08 : 0,
      0.18,
      gridCenter,
      [facadeWidth * (secondary ? 0.78 : 0.9), 0.09, gridHeight]
    ), budget);
    pushRecord(records, 'FacadeKit_LowriseMullionGrid', matrixFor(
      frame,
      secondary && residential ? facadeWidth * 0.08 : 0,
      0.225,
      gridCenter,
      [facadeWidth * (secondary ? 0.78 : 0.9), 0.045, gridHeight]
    ), budget);
    return budget.count - startCount;
  }

  function buildFacadeRecords(features, options, map) {
    const started = global.performance?.now?.() || Date.now();
    const records = Object.fromEntries(MODULE_NAMES.map((name) => [name, []]));
    const lod = selectLod(map.getZoom());
    const budget = { count: 0, lod };
    const architectureStats = {
      homes: 0,
      roofs: 0,
      driveways: 0,
      towers: 0,
      towerFacades: 0,
      crowns: 0,
      midrises: 0,
      midriseFacades: 0,
      storefronts: 0,
      balconies: 0,
      garages: 0,
      parkingOpenings: 0,
      lowriseFaces: 0
    };
    const seen = new Set();
    const mapCenter = map.getCenter();
    const centerMerc = mapboxgl.MercatorCoordinate.fromLngLat([mapCenter.lng, mapCenter.lat], 0);
    const canvas = map.getCanvas();
    const viewportWidth = canvas.clientWidth || global.innerWidth || 1280;
    const viewportHeight = canvas.clientHeight || global.innerHeight || 720;
    // Querying every rendered basemap feature took hundreds of milliseconds on
    // dense downtown views. The longest real footprint edge is deterministic,
    // geographically aligned, and keeps the facade build inside the map frame.
    const roadSegments = [];
    const roadQueryMs = 0;
    const candidatePool = [];
    const candidates = [];

    for (const feature of features || []) {
      const properties = feature?.properties || {};
      const authoritativeId = feature?.id
        || properties.id
        || properties.overtureId
        || properties.globalId
        || properties.osm_id;
      if (authoritativeId) {
        const authoritativeKey = `id:${authoritativeId}`;
        if (seen.has(authoritativeKey)) continue;
        seen.add(authoritativeKey);
      }
      if (!isPlainArchitectureCandidate(feature)) continue;
      const ring = outerRing(feature);
      const centroid = ringCentroid(ring);
      if (!centroid || !ring) continue;
      if (!authoritativeId) {
        const key = featureKey(feature, centroid);
        if (seen.has(key)) continue;
        seen.add(key);
      }
      const height = clamp(Number(feature?.properties?.height || 0), 4, 72);
      if (!Number.isFinite(height)) continue;
      const centroidMerc = mapboxgl.MercatorCoordinate.fromLngLat(centroid, 0);
      const distance = Math.hypot(centroidMerc.x - centerMerc.x, centroidMerc.y - centerMerc.y);
      const distanceMeters = distance / centroidMerc.meterInMercatorCoordinateUnits();
      if (distanceMeters > 2100) continue;
      if (options.isProtected?.(feature, centroid)) continue;
      candidatePool.push({ feature, ring, centroid, height, distance, profile: classifyBuilding(feature, height) });
    }

    candidatePool.sort((left, right) => left.distance - right.distance);
    for (const candidate of candidatePool.slice(0, MAX_BUILDINGS * 5)) {
      let screenPoint;
      try {
        screenPoint = map.project(candidate.centroid);
      } catch {
        continue;
      }
      if (screenPoint.x < -80 || screenPoint.x > viewportWidth + 80 || screenPoint.y < -80 || screenPoint.y > viewportHeight + 80) continue;
      candidates.push({ ...candidate, screenPoint });
    }

    const selected = selectViewportBalancedCandidates(candidates, MAX_BUILDINGS, viewportWidth, viewportHeight);

    for (const item of selected) {
      if (budget.count >= MAX_INSTANCES) break;
      let frame = outwardEdgeFrame(item.ring, item.centroid, roadSegments);
      if (!frame) continue;
      const cameraFacingFrames = screenFacingExteriorFrames(
        exteriorEdgeFrames(item.ring, item.centroid, frame, 6),
        map,
        2
      );
      frame = cameraFacingFrames[0] || frame;
      const facadeWidth = clamp(frame.meters * 0.92, 4, 42);
      const residential = item.profile === 'home';
      const tower = /tower$/.test(item.profile) || (item.height >= 28 && item.profile !== 'parking' && !residential);
      if (tower) {
        architectureStats.towers += 1;
        const towerFrames = cameraFacingFrames.slice(0, item.height >= 42 ? 2 : 1);
        for (const towerFrame of towerFrames) {
          if (addTowerFacade(records, towerFrame, item.height, item.feature, budget) > 0) {
            architectureStats.towerFacades += 1;
            architectureStats.crowns += 1;
          }
        }
        continue;
      }
      if (item.profile === 'parking') {
        architectureStats.garages += 1;
        const parkingFrames = cameraFacingFrames.slice(0, item.height >= 12 ? 2 : 1);
        for (const parkingFrame of parkingFrames) {
          const parkingResult = addParkingFacade(records, parkingFrame, item.height, budget);
          architectureStats.parkingOpenings += parkingResult.openings;
        }
        continue;
      }
      const midrise = item.height >= 14 && !residential;
      if (midrise) {
        architectureStats.midrises += 1;
        const midriseFrames = cameraFacingFrames.slice(0, item.height >= 22 ? 2 : 1);
        for (const midriseFrame of midriseFrames) {
          const midriseResult = addMidriseFacade(records, midriseFrame, item.height, item.feature, budget);
          if (midriseResult.pieces > 0) architectureStats.midriseFacades += 1;
          architectureStats.balconies += midriseResult.balconies;
          if (midriseResult.storefront) architectureStats.storefronts += 1;
        }
        continue;
      }
      if (addOrderedWindowGrid(records, frame, item.height, residential, budget) > 0) architectureStats.lowriseFaces += 1;

      const lowriseTop = Math.max(3.8, Math.min(item.height - 0.45, residential ? 7.2 : 11.5));
      const lowrisePierHeight = Math.max(2.8, lowriseTop - 0.7);
      const lowrisePierCenter = 0.35 + lowrisePierHeight / 2;
      const lowrisePierModule = materialPanelName(item.feature);
      for (const along of [-facadeWidth * 0.43, facadeWidth * 0.43]) {
        pushRecord(records, lowrisePierModule, matrixFor(
          frame,
          along,
          0.17,
          lowrisePierCenter,
          [residential ? 0.3 : 0.42, 0.09, lowrisePierHeight]
        ), budget);
      }
      if (item.height >= 7) {
        pushRecord(records, 'FacadeKit_TowerSpandrel', matrixFor(
          frame,
          0,
          0.16,
          Math.min(lowriseTop - 0.42, residential ? 3.45 : 4.0),
          [facadeWidth * 0.88, 0.07, residential ? 0.22 : 0.3]
        ), budget);
      }

      const doorAlong = clamp(-facadeWidth * 0.22, -5, -1.2);
      pushRecord(records, 'FacadeKit_EntryDoor', matrixFor(frame, doorAlong, 0.22, 1.25, [1.45, 0.07, 2.5]), budget);
      if (residential) {
        architectureStats.homes += 1;
        const key = featureKey(item.feature, item.centroid);
        const profileSeed = stableNumber(key);
        const depth = footprintDepthMeters(frame, item.centroid);
        const roofHeight = clamp(Math.min(facadeWidth, depth) * 0.2, 1.1, 2.8);
        const roofMaterial = profileSeed % 4 === 0 ? 'Terracotta' : 'Charcoal';
        const roofForm = profileSeed % 3 === 0 ? 'HipRoof' : 'GableRoof';
        const roofName = `FacadeKit_${roofForm}${roofMaterial}`;
        const roofFitsFootprint = item.ring.length <= 12 && facadeWidth <= 24 && depth <= 24;
        if (roofFitsFootprint && pushRecord(records, roofName, matrixFor(
            frame,
            0,
            -depth / 2,
            item.height + roofHeight / 2,
            [clamp(facadeWidth * 0.96, 5, 22), depth * 0.96, roofHeight]
          ), budget)) architectureStats.roofs += 1;

        pushRecord(records, 'FacadeKit_Porch', matrixFor(frame, doorAlong, 0.5, 0.09, [2.7, 0.95, 0.18]), budget);
        pushRecord(records, 'FacadeKit_Canopy', matrixFor(frame, doorAlong, 0.38, 2.85, [2.8, 0.72, 0.14]), budget);

        if (facadeWidth >= 8.5) {
          const garageAlong = clamp(facadeWidth * 0.22, 1.5, 5);
          pushRecord(records, 'FacadeKit_GarageDoor', matrixFor(frame, garageAlong, 0.065, 1.15, [2.75, 0.07, 2.3]), budget);
          if (pushRecord(records, 'FacadeKit_Driveway', matrixFor(frame, garageAlong, 2.35, 0.04, [3.1, 4.5, 0.08]), budget)) {
            architectureStats.driveways += 1;
          }
        }
      } else if (isStorefront(item.feature)) {
        pushRecord(records, 'FacadeKit_TowerLobbyGlass', matrixFor(frame, 0, 0.2, 1.72, [facadeWidth * 0.68, 0.09, 3.1]), budget);
        const storefrontHalf = facadeWidth * 0.35;
        pushRecord(records, 'FacadeKit_StorefrontFrame', matrixFor(frame, -storefrontHalf, 0.24, 1.72, [0.24, 0.1, 3.2]), budget);
        pushRecord(records, 'FacadeKit_StorefrontFrame', matrixFor(frame, storefrontHalf, 0.24, 1.72, [0.24, 0.1, 3.2]), budget);
        pushRecord(records, 'FacadeKit_StorefrontFrame', matrixFor(frame, 0, 0.24, 3.25, [facadeWidth * 0.7, 0.1, 0.24]), budget);
        pushRecord(records, 'FacadeKit_Canopy', matrixFor(frame, doorAlong, 0.42, 3.05, [4.2, 0.8, 0.16]), budget);
      }
      if (facadeWidth >= 8 && budget.count < MAX_INSTANCES) {
        const adjacentFrame = adjacentTowerFrame(item.ring, item.centroid, frame);
        const sideFrame = adjacentFrame || null;
        if (addOrderedWindowGrid(records, sideFrame, item.height, residential, budget, true) > 0) architectureStats.lowriseFaces += 1;
      }
    }

    const detailStats = {
      windowBays: records.FacadeKit_WindowBay.length
        + records.FacadeKit_TowerWindowBay.length
        + records.FacadeKit_MidriseWindowBand.length
        + records.FacadeKit_TowerWindowGrid.length
        + records.FacadeKit_MidriseWindowGrid.length
        + records.FacadeKit_LowriseWindowGrid.length,
      mullionGrids: records.FacadeKit_TowerMullionGrid.length
        + records.FacadeKit_MidriseMullionGrid.length
        + records.FacadeKit_LowriseMullionGrid.length,
      entries: records.FacadeKit_EntryDoor.length,
      lobbyFrames: records.FacadeKit_StorefrontFrame.length
        + records.FacadeKit_TowerLobbyGlass.length,
      structuralPiers: records.FacadeKit_TowerColumn.length
        + records.FacadeKit_MasonryPier.length
        + records.FacadeKit_BrickPanel.length
        + records.FacadeKit_LimestonePanel.length
        + records.FacadeKit_WoodPanel.length
        + records.FacadeKit_ConcretePanel.length,
      floorBands: records.FacadeKit_TowerSpandrel.length
        + records.FacadeKit_TowerCrownBand.length,
      canopies: records.FacadeKit_Canopy.length
    };

    return {
      records,
      buildings: selected.length,
      instances: budget.count,
      lod,
      skipped: Math.max(0, candidates.length - selected.length),
      ...architectureStats,
      ...detailStats,
      recordsBuildMs: Math.round((global.performance?.now?.() || Date.now()) - started),
      roadQueryMs: Math.round(roadQueryMs)
    };
  }

  function clearInstancedRoot(root) {
    while (root.children.length) {
      const child = root.children[root.children.length - 1];
      root.remove(child);
      child.dispose?.();
    }
  }

  function textureKindForModule(name) {
    if (/Window|Glass|EntryDoor/.test(name)) return 'glass';
    if (/Brick/.test(name)) return 'brick';
    if (/Limestone|Masonry/.test(name)) return 'stone';
    if (/Wood|Porch/.test(name)) return 'wood';
    if (/Mullion|Rail|Frame|Canopy|Crown|Spandrel/.test(name)) return 'metal';
    return 'concrete';
  }

  function tuneFacadeMaterial(name, material, textureSet) {
    const textures = textureSet.get(textureKindForModule(name));
    material.map = textures.map;
    material.normalMap = textures.normalMap;
    material.roughnessMap = textures.roughnessMap;
    if (material.color) material.color.setHex(0xffffff);
    material.side = THREE.DoubleSide;
    if (material.emissive && material.color) {
      material.emissive.copy(material.color).multiplyScalar(/Window|Glass|EntryDoor/.test(name) ? 0.02 : 0.01);
      material.emissiveIntensity = 0.3;
    }
    if (/Window|Glass/.test(name)) {
      material.opacity = 1;
      material.transparent = false;
      material.depthWrite = true;
      if ('roughness' in material) material.roughness = 0.3;
      if ('metalness' in material) material.metalness = 0.2;
    } else if (/Brick|Limestone|Wood|Concrete|Masonry|Porch|Driveway/.test(name)) {
      if ('roughness' in material) material.roughness = /Wood/.test(name) ? 0.78 : 0.9;
      if ('metalness' in material) material.metalness = 0.02;
    } else if (/Mullion|Rail|Frame|Canopy|Crown/.test(name)) {
      if ('roughness' in material) material.roughness = 0.46;
      if ('metalness' in material) material.metalness = 0.42;
    }
    material.depthTest = true;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -0.35;
    material.polygonOffsetUnits = -0.5;
    material.needsUpdate = true;
    return material;
  }

  function create(options) {
    const map = options.map;
    const state = {
      enabled: options.enabled !== false,
      ready: false,
      loading: false,
      lod: 2,
      performanceTier: PERFORMANCE_BUDGET.tier || 'balanced',
      buildings: 0,
      instances: 0,
      homes: 0,
      roofs: 0,
      driveways: 0,
      towers: 0,
      towerFacades: 0,
      garages: 0,
      parkingOpenings: 0,
      lowriseFaces: 0,
      windowBays: 0,
      entries: 0,
      lobbyFrames: 0,
      structuralPiers: 0,
      floorBands: 0,
      canopies: 0,
      skipped: 0,
      error: '',
      lastBuildMs: 0,
      lastRefreshMs: 0,
      recordsBuildMs: 0,
      roadQueryMs: 0,
      meshBuildMs: 0,
      sourceFeatures: 0,
      rebuilds: 0,
      skippedRebuilds: 0
    };
    let refreshTimer = 0;
    let emptySourceRetries = 0;
    let lastBuildSignature = '';
    let prototypes = null;
    let textureSet = null;
    const meshMaterials = new Map();
    let eventsBound = false;
    let destroyed = false;
    const handleMoveEnd = () => scheduleRefresh(240);

    function disposePrototypes() {
      if (!prototypes) return;
      const geometries = new Set();
      const materials = new Set();
      Object.values(prototypes).forEach((node) => {
        if (node?.geometry) geometries.add(node.geometry);
        const nodeMaterials = Array.isArray(node?.material) ? node.material : [node?.material];
        nodeMaterials.filter(Boolean).forEach((material) => materials.add(material));
      });
      geometries.forEach((geometry) => geometry.dispose?.());
      materials.forEach((material) => material.dispose?.());
      prototypes = null;
    }

    function disposeMeshMaterials() {
      meshMaterials.forEach((material) => material.dispose?.());
      meshMaterials.clear();
      textureSet?.dispose?.();
      textureSet = null;
    }

    const notify = () => options.onStatus?.({ ...state, layerId: LAYER_ID, minZoom: MIN_ZOOM });

    const layer = {
      id: LAYER_ID,
      type: 'custom',
      // Standard's top slot keeps modules above building geometry while
      // retaining Mapbox's higher-level place and transit label hierarchy.
      slot: 'top',
      renderingMode: '3d',
      onAdd(mapInstance, gl) {
        destroyed = false;
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();
        this.root = new THREE.Group();
        this.scene.add(this.root);
        this.scene.add(new THREE.HemisphereLight(0xe2f0f4, 0x303c3f, 1.08));
        const key = new THREE.DirectionalLight(0xeaf4ff, 1.22);
        key.position.set(-0.4, -0.65, 1).normalize();
        this.scene.add(key);
        this.renderer = new THREE.WebGLRenderer({
          canvas: mapInstance.getCanvas(),
          context: gl,
          antialias: true
        });
        this.renderer.autoClear = false;
        if ('outputColorSpace' in this.renderer && THREE.SRGBColorSpace) this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.loadAsset();
      },
      loadAsset() {
        if (state.loading || prototypes) return;
        if (!THREE.GLTFLoader) {
          state.error = 'GLTFLoader unavailable';
          notify();
          global.addEventListener('sr-facade-loader-ready', () => {
            state.error = '';
            this.loadAsset();
          }, { once: true });
          return;
        }
        state.loading = true;
        notify();
        const loader = new THREE.GLTFLoader();
        loader.load(
          options.assetUrl || ASSET_URL,
          (gltf) => {
            if (destroyed) {
              gltf.scene.traverse((node) => {
                node.geometry?.dispose?.();
                const materials = Array.isArray(node.material) ? node.material : [node.material];
                materials.filter(Boolean).forEach((material) => material.dispose?.());
              });
              return;
            }
            prototypes = {};
            gltf.scene.traverse((node) => {
              if (node.isMesh && ASSET_MODULE_NAMES.includes(node.name)) prototypes[node.name] = node;
            });
            const missing = ASSET_MODULE_NAMES.filter((name) => !prototypes[name]);
            state.loading = false;
            state.ready = missing.length === 0;
            state.error = missing.length ? `Missing modules: ${missing.join(', ')}` : '';
            notify();
            scheduleRefresh(0);
          },
          undefined,
          (error) => {
            if (destroyed) return;
            state.loading = false;
            state.error = String(error?.message || error || 'GLB load failed');
            notify();
          }
        );
      },
      rebuild(features) {
        if (!this.root || !prototypes || !state.ready) return;
        const started = global.performance?.now?.() || Date.now();
        clearInstancedRoot(this.root);
        const result = buildFacadeRecords(features, options, map);
        const lod = selectLod(map.getZoom());
        state.lod = lod;
        if (!textureSet) textureSet = createFacadeTextureSet(THREE);
        const meshStarted = global.performance?.now?.() || Date.now();
        for (const name of MODULE_NAMES) {
          const matrices = result.records[name];
          const prototypeName = `${name}_LOD${lod}`;
          const prototype = prototypes[prototypeName];
          if (!matrices.length || !prototype) continue;
          const geometry = prototype.geometry;
          const materialKey = `${name}:lod${lod}`;
          let material = meshMaterials.get(materialKey);
          if (!material) {
            material = tuneFacadeMaterial(name, prototype.material.clone(), textureSet);
            meshMaterials.set(materialKey, material);
          }
          const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
          mesh.name = `${name}_instances`;
          mesh.frustumCulled = false;
          mesh.renderOrder = 92;
          matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
          mesh.instanceMatrix.needsUpdate = true;
          this.root.add(mesh);
        }
        state.buildings = result.buildings;
        state.instances = result.instances;
        state.homes = result.homes;
        state.roofs = result.roofs;
        state.driveways = result.driveways;
        state.towers = result.towers;
        state.towerFacades = result.towerFacades;
        state.crowns = result.crowns;
        state.midrises = result.midrises;
        state.midriseFacades = result.midriseFacades;
        state.storefronts = result.storefronts;
        state.balconies = result.balconies;
        state.garages = result.garages;
        state.parkingOpenings = result.parkingOpenings;
        state.lowriseFaces = result.lowriseFaces;
        state.windowBays = result.windowBays;
        state.entries = result.entries;
        state.lobbyFrames = result.lobbyFrames;
        state.structuralPiers = result.structuralPiers;
        state.floorBands = result.floorBands;
        state.canopies = result.canopies;
        state.skipped = result.skipped;
        state.recordsBuildMs = result.recordsBuildMs;
        state.roadQueryMs = result.roadQueryMs;
        state.meshBuildMs = Math.round((global.performance?.now?.() || Date.now()) - meshStarted);
        state.lastBuildMs = Math.round((global.performance?.now?.() || Date.now()) - started);
        global.__srMockPerformanceController?.recordBuild?.(state.lastBuildMs);
        notify();
        map.triggerRepaint();
      },
      render(gl, matrix) {
        if (!state.enabled || !state.ready || map.getZoom() < MIN_ZOOM || !this.root?.children?.length) return;
        const viewport = gl.getParameter(gl.VIEWPORT);
        this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
        gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
      },
      onRemove() {
        clearInstancedRoot(this.root);
        // Mapbox owns the shared WebGL context; only release Facade Kit resources here.
        this.renderer?.renderLists?.dispose?.();
        this.scene?.clear?.();
        this.renderer = null;
        this.root = null;
        this.scene = null;
        this.camera = null;
      }
    };

    function refresh() {
      global.clearTimeout(refreshTimer);
      if (destroyed) return;
      if (!state.enabled || !state.ready || map.getZoom() < MIN_ZOOM || !map.getSource(options.sourceId)) {
        state.buildings = 0;
        state.instances = 0;
        state.homes = 0;
        state.roofs = 0;
        state.driveways = 0;
        state.towers = 0;
        state.towerFacades = 0;
        state.crowns = 0;
        state.midrises = 0;
        state.midriseFacades = 0;
        state.storefronts = 0;
        state.balconies = 0;
        state.garages = 0;
        state.parkingOpenings = 0;
        state.lowriseFaces = 0;
        state.windowBays = 0;
        state.entries = 0;
        state.lobbyFrames = 0;
        state.structuralPiers = 0;
        state.floorBands = 0;
        state.canopies = 0;
        notify();
        return;
      }
      try {
        const refreshStarted = global.performance?.now?.() || Date.now();
        const features = map.querySourceFeatures(options.sourceId, { sourceLayer: options.sourceLayer }) || [];
        state.sourceFeatures = features.length;
        if (!features.length && emptySourceRetries < 24) {
          emptySourceRetries += 1;
          scheduleRefresh(650);
          return;
        }
        emptySourceRetries = 0;
        const signature = viewSignature(features, map);
        if (signature === lastBuildSignature && layer.root?.children?.length) {
          state.skippedRebuilds += 1;
          state.lastRefreshMs = Math.round((global.performance?.now?.() || Date.now()) - refreshStarted);
          state.error = '';
          notify();
          return;
        }
        layer.rebuild(features);
        lastBuildSignature = signature;
        state.rebuilds += 1;
        state.lastRefreshMs = Math.round((global.performance?.now?.() || Date.now()) - refreshStarted);
        state.error = '';
      } catch (error) {
        state.error = String(error?.message || error);
        notify();
      }
    }

    function scheduleRefresh(delay = 420) {
      global.clearTimeout(refreshTimer);
      if (destroyed) return;
      refreshTimer = global.setTimeout(refresh, delay);
    }

    function install() {
      destroyed = false;
      let needsRefresh = false;
      if (!map.getLayer(LAYER_ID)) {
        map.addLayer(layer);
        needsRefresh = true;
      }
      if (!eventsBound) {
        map.on('moveend', handleMoveEnd);
        eventsBound = true;
        needsRefresh = true;
      }
      if (needsRefresh) scheduleRefresh(800);
      return true;
    }

    function setEnabled(enabled) {
      const nextEnabled = Boolean(enabled);
      const changed = state.enabled !== nextEnabled;
      state.enabled = nextEnabled;
      if (map.getLayer(LAYER_ID)) map.setLayoutProperty(LAYER_ID, 'visibility', state.enabled ? 'visible' : 'none');
      if (state.enabled && changed) scheduleRefresh(80);
      notify();
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      global.clearTimeout(refreshTimer);
      emptySourceRetries = 0;
      if (eventsBound) {
        map.off('moveend', handleMoveEnd);
        eventsBound = false;
      }
      lastBuildSignature = '';
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      } catch {
        layer.onRemove();
      }
      disposePrototypes();
      disposeMeshMaterials();
      state.ready = false;
      state.loading = false;
      state.buildings = 0;
      state.instances = 0;
      state.homes = 0;
      state.roofs = 0;
      state.driveways = 0;
      state.towers = 0;
      state.towerFacades = 0;
      state.crowns = 0;
      state.midrises = 0;
      state.midriseFacades = 0;
      state.storefronts = 0;
      state.balconies = 0;
      state.garages = 0;
      state.parkingOpenings = 0;
      state.lowriseFaces = 0;
      state.windowBays = 0;
      state.entries = 0;
      state.lobbyFrames = 0;
      state.structuralPiers = 0;
      state.floorBands = 0;
      state.canopies = 0;
      state.sourceFeatures = 0;
      state.lastBuildMs = 0;
      state.lastRefreshMs = 0;
      state.recordsBuildMs = 0;
      state.roadQueryMs = 0;
      state.meshBuildMs = 0;
    }

    return {
      id: LAYER_ID,
      install,
      refresh: scheduleRefresh,
      setEnabled,
      destroy,
      getStatus: () => ({ ...state })
    };
  }

  function createNativeModelRuntime(options) {
    const map = options.map;
    const architectureFields = [
      'buildings', 'instances', 'homes', 'roofs', 'driveways', 'towers',
      'towerFacades', 'crowns', 'midrises', 'midriseFacades', 'storefronts',
      'balconies', 'garages', 'parkingOpenings', 'lowriseFaces', 'windowBays',
      'mullionGrids', 'entries', 'lobbyFrames', 'structuralPiers', 'floorBands', 'canopies', 'skipped'
    ];
    const state = {
      enabled: options.enabled !== false,
      ready: false,
      loading: true,
      renderer: 'mapbox-native-model-layer',
      lod: 2,
      performanceTier: PERFORMANCE_BUDGET.tier || 'balanced',
      buildings: 0,
      instances: 0,
      homes: 0,
      roofs: 0,
      driveways: 0,
      towers: 0,
      towerFacades: 0,
      crowns: 0,
      midrises: 0,
      midriseFacades: 0,
      storefronts: 0,
      balconies: 0,
      garages: 0,
      parkingOpenings: 0,
      lowriseFaces: 0,
      windowBays: 0,
      mullionGrids: 0,
      entries: 0,
      lobbyFrames: 0,
      structuralPiers: 0,
      floorBands: 0,
      canopies: 0,
      skipped: 0,
      modelLayers: 0,
      modelAssets: 0,
      renderedModels: 0,
      sourceFeatures: 0,
      rebuilds: 0,
      skippedRebuilds: 0,
      lastBuildMs: 0,
      lastRefreshMs: 0,
      recordsBuildMs: 0,
      roadQueryMs: 0,
      meshBuildMs: 0,
      error: ''
    };
    let refreshTimer = 0;
    let refreshDueAt = 0;
    let emptySourceRetries = 0;
    let lastBuildSignature = '';
    let eventsBound = false;
    let destroyed = false;
    const handleMoveEnd = () => scheduleRefresh(220);
    const notify = () => options.onStatus?.({ ...state, layerId: LAYER_ID, sourceId: MODEL_SOURCE_ID, minZoom: MIN_ZOOM });

    function emptyCollection() {
      return { type: 'FeatureCollection', features: [] };
    }

    function moduleModelUrl(name, lod) {
      const modelUrl = new URL(`${MODEL_ASSET_DIRECTORY}/${name}_LOD${lod}.glb`, global.document.baseURI);
      modelUrl.searchParams.set('v', MODEL_ASSET_VERSION);
      return modelUrl.href;
    }

    function featureCollectionFor(result) {
      const features = [];
      const modelAssets = new Set();
      let id = 1;
      for (const name of MODULE_NAMES) {
        const modelUri = moduleModelUrl(name, result.lod);
        for (const placement of result.records[name] || []) {
          if (!Array.isArray(placement?.coordinates) || placement.coordinates.length !== 2) continue;
          modelAssets.add(modelUri);
          features.push({
            type: 'Feature',
            id,
            properties: {
              module: name,
              family: materialFamilyForModule(name),
              modelUri
            },
            geometry: {
              type: 'Point',
              coordinates: placement.coordinates
            }
          });
          id += 1;
        }
      }
      return { data: { type: 'FeatureCollection', features }, modelAssets: modelAssets.size };
    }

    function modelVectorMatch(features, placementProperty, fallback) {
      const expression = ['match', ['id']];
      for (const feature of features || []) {
        const vector = feature?.placement?.[placementProperty];
        if (!Number.isFinite(Number(feature?.id)) || !Array.isArray(vector) || vector.length !== 3) continue;
        const normalized = vector.map((value, index) => {
          const numeric = Number(value);
          return Number.isFinite(numeric) ? numeric : fallback[index];
        });
        expression.push(Number(feature.id), ['literal', normalized]);
      }
      expression.push(['literal', fallback]);
      return expression.length > 3 ? expression : fallback;
    }

    function applyNativeTransforms(features) {
      if (!map.getLayer(LAYER_ID)) return;
      map.setPaintProperty(LAYER_ID, 'model-scale', modelVectorMatch(features, 'modelScale', [1, 1, 1]));
      map.setPaintProperty(LAYER_ID, 'model-rotation', modelVectorMatch(features, 'modelRotation', [0, 0, 0]));
      map.setPaintProperty(LAYER_ID, 'model-translation', modelVectorMatch(features, 'modelTranslation', [0, 0, 0]));
    }

    function ensureNativeLayer() {
      // Adding the published building source makes isStyleLoaded() false while
      // its first tiles arrive. The style graph is already safe to extend at
      // that point, so waiting for every source to become idle can starve the
      // native model layer during continuous GPS/camera updates.
      if (destroyed || !map?.getStyle?.()) return false;
      try {
        if (!map.getSource(MODEL_SOURCE_ID)) {
          map.addSource(MODEL_SOURCE_ID, {
            type: 'geojson',
            data: emptyCollection()
          });
        }
        if (!map.getLayer(LAYER_ID)) {
          map.addLayer({
            id: LAYER_ID,
            type: 'model',
            // Keep shallow facade pieces above Standard's imported 3D pass.
            // Labels are restored above this layer by the map presentation
            // installer after every style load.
            source: MODEL_SOURCE_ID,
            minzoom: MIN_ZOOM,
            layout: {
              'model-id': ['get', 'modelUri'],
              'model-allow-density-reduction': state.performanceTier !== 'high',
              visibility: state.enabled ? 'visible' : 'none'
            },
            paint: {
              'model-opacity': 1,
              'model-scale': [1, 1, 1],
              'model-rotation': [0, 0, 0],
              'model-translation': [0, 0, 0],
              'model-color': [
                'match', ['get', 'family'],
                'glass', '#3f7890',
                'trim', '#f3f6f2',
                'brick', '#a85f4a',
                'stone', '#d8cdb7',
                'wood', '#8a6349',
                'metal', '#53656b',
                '#c5c3bb'
              ],
              'model-color-mix-intensity': [
                'match', ['get', 'family'],
                'glass', 0.52,
                'trim', 0.9,
                'brick', 0.28,
                'stone', 0.24,
                'wood', 0.26,
                'metal', 0.22,
                0.2
              ],
              // The Mapbox base supplies the building shadows. Keeping the
              // shallow skin stable prevents window grids from fading or
              // flickering as the afternoon light and camera move.
              'model-cast-shadows': false,
              'model-receive-shadows': false,
              'model-ambient-occlusion-intensity': 0.46,
              'model-emissive-strength': [
                'match', ['get', 'family'],
                'glass', 0.22,
                'trim', 0.3,
                0.1
              ],
              'model-elevation-reference': 'ground',
              'model-type': 'common-3d'
            }
          });
        }
        state.ready = Boolean(map.getLayer(LAYER_ID) && map.getSource(MODEL_SOURCE_ID));
        state.loading = !state.ready;
        state.modelLayers = state.ready ? 1 : 0;
        state.error = '';
        global.__srMockNativeModelLayerAudit = {
          ready: state.ready,
          layerId: LAYER_ID,
          sourceId: MODEL_SOURCE_ID,
          layerType: map.getLayer(LAYER_ID)?.type || '',
          renderer: state.renderer,
          checkedAt: Date.now()
        };
        return state.ready;
      } catch (error) {
        state.ready = false;
        state.loading = false;
        state.error = String(error?.message || error);
        global.__srMockNativeModelLayerAudit = {
          ready: false,
          layerId: LAYER_ID,
          sourceId: MODEL_SOURCE_ID,
          error: state.error,
          checkedAt: Date.now()
        };
        notify();
        return false;
      }
    }

    function resetArchitectureStats() {
      architectureFields.forEach((field) => { state[field] = 0; });
      state.modelAssets = 0;
    }

    function rebuild(features) {
      const started = global.performance?.now?.() || Date.now();
      const result = buildFacadeRecords(features, options, map);
      const collection = featureCollectionFor(result);
      const source = map.getSource(MODEL_SOURCE_ID);
      if (!source?.setData) throw new Error('Native Facade Kit model source is unavailable');
      let placementIndex = 0;
      for (const name of MODULE_NAMES) {
        for (const placement of result.records[name] || []) {
          const feature = collection.data.features[placementIndex];
          if (feature) feature.placement = placement;
          placementIndex += 1;
        }
      }
      applyNativeTransforms(collection.data.features);
      collection.data.features.forEach((feature) => { delete feature.placement; });
      source.setData(collection.data);
      global.document.body.dataset.mockNativeTransformFeatures = String(collection.data.features.length);
      state.renderedModels = collection.data.features.length;
      architectureFields.forEach((field) => { state[field] = Number(result[field] || 0); });
      state.lod = result.lod;
      state.instances = collection.data.features.length;
      state.modelAssets = collection.modelAssets;
      state.recordsBuildMs = result.recordsBuildMs;
      state.roadQueryMs = result.roadQueryMs;
      state.meshBuildMs = 0;
      state.lastBuildMs = Math.round((global.performance?.now?.() || Date.now()) - started);
      state.rebuilds += 1;
      state.error = '';
      global.__srMockPerformanceController?.recordBuild?.(state.lastBuildMs);
      global.__srMockNativeModelFeatureCollection = collection.data;
      global.__srMockNativeModelLayerAudit = {
        ...(global.__srMockNativeModelLayerAudit || {}),
        ready: true,
        features: state.instances,
        modelAssets: state.modelAssets,
        lod: state.lod,
        rebuiltAt: Date.now()
      };
      notify();
      map.triggerRepaint();
      global.setTimeout(() => {
        if (destroyed || !map.getLayer(LAYER_ID)) return;
        try {
          const rendered = map.queryRenderedFeatures(undefined, { layers: [LAYER_ID] }) || [];
          const renderedIds = new Set(rendered.map((feature) => feature.id).filter((id) => id !== undefined && id !== null));
          if (renderedIds.size) state.renderedModels = Math.min(state.instances, renderedIds.size);
          global.document.body.dataset.mockNativeRenderedModels = String(state.renderedModels);
          notify();
        } catch {
          state.renderedModels = 0;
          global.document.body.dataset.mockNativeRenderedModels = 'query-unavailable';
        }
      }, 900);
    }

    function refresh() {
      global.clearTimeout(refreshTimer);
      refreshTimer = 0;
      refreshDueAt = 0;
      if (destroyed) return;
      const refreshStarted = global.performance?.now?.() || Date.now();
      if (!ensureNativeLayer()) return;
      if (!state.enabled || map.getZoom() < MIN_ZOOM || !map.getSource(options.sourceId)) {
        resetArchitectureStats();
        map.getSource(MODEL_SOURCE_ID)?.setData?.(emptyCollection());
        state.lastRefreshMs = Math.round((global.performance?.now?.() || Date.now()) - refreshStarted);
        notify();
        return;
      }
      try {
        const features = map.querySourceFeatures(options.sourceId, { sourceLayer: options.sourceLayer }) || [];
        state.sourceFeatures = features.length;
        if (!features.length && emptySourceRetries < 24) {
          emptySourceRetries += 1;
          scheduleRefresh(650);
          return;
        }
        emptySourceRetries = 0;
        const signature = viewSignature(features, map);
        if (signature === lastBuildSignature && state.instances > 0) {
          state.skippedRebuilds += 1;
          state.lastRefreshMs = Math.round((global.performance?.now?.() || Date.now()) - refreshStarted);
          state.error = '';
          notify();
          return;
        }
        rebuild(features);
        lastBuildSignature = signature;
        state.lastRefreshMs = Math.round((global.performance?.now?.() || Date.now()) - refreshStarted);
      } catch (error) {
        state.error = String(error?.message || error);
        notify();
      }
    }

    function scheduleRefresh(delay = 360) {
      if (destroyed) return;
      const safeDelay = Math.max(0, Number(delay) || 0);
      const dueAt = Date.now() + safeDelay;
      // Keep the earliest pending refresh. Repeated sourcedata events should
      // accelerate a build when useful, never postpone it indefinitely.
      if (refreshTimer && refreshDueAt && refreshDueAt <= dueAt) return;
      global.clearTimeout(refreshTimer);
      refreshDueAt = dueAt;
      refreshTimer = global.setTimeout(refresh, safeDelay);
    }

    function install() {
      destroyed = false;
      const installed = ensureNativeLayer();
      if (!eventsBound) {
        map.on('moveend', handleMoveEnd);
        eventsBound = true;
      }
      if (installed) scheduleRefresh(240);
      notify();
      return installed;
    }

    function setEnabled(enabled) {
      state.enabled = Boolean(enabled);
      if (map.getLayer(LAYER_ID)) {
        map.setLayoutProperty(LAYER_ID, 'visibility', state.enabled ? 'visible' : 'none');
      }
      if (state.enabled) scheduleRefresh(60);
      notify();
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      global.clearTimeout(refreshTimer);
      refreshTimer = 0;
      refreshDueAt = 0;
      if (eventsBound) {
        map.off('moveend', handleMoveEnd);
        eventsBound = false;
      }
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(MODEL_SOURCE_ID)) map.removeSource(MODEL_SOURCE_ID);
      } catch (error) {
        global.__srMockNativeModelDestroyError = String(error?.message || error);
      }
      lastBuildSignature = '';
      emptySourceRetries = 0;
      resetArchitectureStats();
      state.ready = false;
      state.loading = false;
      state.modelLayers = 0;
      state.renderedModels = 0;
      state.sourceFeatures = 0;
      state.lastBuildMs = 0;
      state.lastRefreshMs = 0;
      state.recordsBuildMs = 0;
      global.__srMockNativeModelFeatureCollection = emptyCollection();
      notify();
    }

    return {
      id: LAYER_ID,
      sourceId: MODEL_SOURCE_ID,
      install,
      refresh: scheduleRefresh,
      setEnabled,
      destroy,
      getStatus: () => ({ ...state })
    };
  }

  global.SimpleRidesFacadeKitV2 = {
    create: createNativeModelRuntime,
    layerId: LAYER_ID,
    sourceId: MODEL_SOURCE_ID,
    assetUrl: ASSET_URL,
    modelAssetDirectory: MODEL_ASSET_DIRECTORY,
    renderer: 'mapbox-native-model-layer',
    limits: {
      minZoom: MIN_ZOOM,
      maxBuildings: MAX_BUILDINGS,
      maxInstances: MAX_INSTANCES,
      lod0Zoom: Number(PERFORMANCE_BUDGET.lod0Zoom || 16.5),
      lod1Zoom: Number(PERFORMANCE_BUDGET.lod1Zoom || 14.8)
    }
  };
})(window);
