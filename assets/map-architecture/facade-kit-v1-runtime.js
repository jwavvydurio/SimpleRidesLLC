(function installSimpleRidesFacadeKitV1(global) {
  'use strict';

  const THREE = global.THREE;
  const mapboxgl = global.mapboxgl;
  if (!THREE || !mapboxgl) return;

  const LAYER_ID = 'src-mock-facade-kit-v1';
  const ASSET_URL = './assets/map-architecture/facade-kit-v1.glb';
  const MIN_ZOOM = 12.8;
  const MAX_BUILDINGS = 104;
  const MAX_INSTANCES = 4200;
  const MIN_VISIBLE_FACADE_OFFSET_METERS = 0.06;
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
    'FacadeKit_TowerLobbyGlass',
    'FacadeKit_TowerSpandrel',
    'FacadeKit_TowerColumn',
    'FacadeKit_MidriseWindowBand',
    'FacadeKit_MasonryPier',
    'FacadeKit_BalconySlab',
    'FacadeKit_BalconyRail',
    'FacadeKit_StorefrontFrame',
    'FacadeKit_TowerCrownBand'
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
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

  function matrixFor(frame, alongMeters, outwardMeters, altitudeMeters, dimensionsMeters) {
    const meter = frame.meterScale;
    const visibleOutwardMeters = outwardMeters > 0 && outwardMeters < MIN_VISIBLE_FACADE_OFFSET_METERS
      ? MIN_VISIBLE_FACADE_OFFSET_METERS
      : outwardMeters;
    const positionX = frame.midpoint.x + (frame.unit.x * alongMeters * meter) + (frame.normal.x * visibleOutwardMeters * meter);
    const positionY = frame.midpoint.y + (frame.unit.y * alongMeters * meter) + (frame.normal.y * visibleOutwardMeters * meter);
    const width = dimensionsMeters[0] * meter;
    const depth = dimensionsMeters[1] * meter;
    const height = dimensionsMeters[2] * meter;
    return new THREE.Matrix4().set(
      frame.unit.x * width, 0, frame.normal.x * depth, positionX,
      frame.unit.y * width, 0, frame.normal.y * depth, positionY,
      0, height, 0, altitudeMeters * meter,
      0, 0, 0, 1
    );
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

  function addTowerFacade(records, frame, height, feature, budget) {
    if (!frame || budget.count >= MAX_INSTANCES) return 0;
    const startCount = budget.count;
    const facadeWidth = clamp(frame.meters * 0.9, 8, 44);
    const verticalBase = 5.4;
    const verticalHeight = clamp(height - 8.4, 12, 60);
    const verticalCenter = verticalBase + verticalHeight / 2;
    const bays = clamp(Math.floor(facadeWidth / 6.5), 3, 5);
    const baySpacing = facadeWidth / bays;
    const bayWidth = Math.min(5.2, baySpacing * 0.7);

    pushRecord(records, 'FacadeKit_TowerLobbyGlass', matrixFor(
      frame,
      0,
      0.06,
      1.85,
      [facadeWidth * 0.8, 0.07, 3.4]
    ), budget);

    for (let bay = 0; bay < bays; bay += 1) {
      const along = (-facadeWidth / 2) + (baySpacing * (bay + 0.5));
      if (!pushRecord(records, 'FacadeKit_TowerWindowBay', matrixFor(
        frame,
        along,
        0.055,
        verticalCenter,
        [bayWidth, 0.035, verticalHeight]
      ), budget)) break;
    }

    const columnPositions = [];
    for (let bay = 0; bay <= bays; bay += 1) {
      columnPositions.push((-facadeWidth * 0.41) + (baySpacing * 0.82 * bay));
    }
    for (const along of columnPositions) {
      pushRecord(records, 'FacadeKit_TowerColumn', matrixFor(
        frame,
        along,
        0.07,
        verticalCenter,
        [0.12, 0.075, verticalHeight + 0.35]
      ), budget);
    }

    const bands = clamp(Math.floor(verticalHeight / 9), 3, 6);
    for (let band = 1; band <= bands; band += 1) {
      const altitude = verticalBase + (verticalHeight * band / (bands + 1));
      pushRecord(records, 'FacadeKit_TowerSpandrel', matrixFor(
        frame,
        0,
        0.075,
        altitude,
        [facadeWidth * 0.86, 0.04, 0.18]
      ), budget);
    }

    pushRecord(records, 'FacadeKit_TowerCrownBand', matrixFor(
      frame,
      0,
      0.075,
      height - 0.7,
      [facadeWidth * 0.92, 0.09, 0.7]
    ), budget);

    pushRecord(records, 'FacadeKit_EntryDoor', matrixFor(
      frame,
      -Math.min(4.5, facadeWidth * 0.2),
      0.075,
      1.3,
      [1.8, 0.09, 2.6]
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
    const panelHeight = clamp(height - 5.8, 4.5, 22);
    const panelCenter = 4.7 + panelHeight / 2;
    const bays = clamp(Math.floor(windowBandWidth / 5.2), 2, 5);
    const baySpacing = windowBandWidth / bays;
    const bayWidth = Math.min(4.2, baySpacing * 0.68);

    for (let bay = 0; bay < bays; bay += 1) {
      const along = (-windowBandWidth / 2) + (baySpacing * (bay + 0.5));
      pushRecord(records, 'FacadeKit_MidriseWindowBand', matrixFor(
        frame,
        along,
        0.055,
        panelCenter,
        [bayWidth, 0.035, panelHeight]
      ), budget);
    }

    const pierHeight = clamp(height - 4.2, 7, 23);
    const pierCenter = 3.8 + pierHeight / 2;
    const pierPositions = [];
    for (let bay = 0; bay <= bays; bay += 1) {
      pierPositions.push((-windowBandWidth / 2) + (baySpacing * bay));
    }
    for (const along of pierPositions) {
      pushRecord(records, 'FacadeKit_MasonryPier', matrixFor(
        frame,
        along,
        0.07,
        pierCenter,
        [0.18, 0.04, pierHeight]
      ), budget);
    }

    pushRecord(records, 'FacadeKit_TowerLobbyGlass', matrixFor(
      frame,
      0,
      0.06,
      1.75,
      [facadeWidth * 0.76, 0.065, 3.1]
    ), budget);
    const frameHalf = facadeWidth * 0.39;
    pushRecord(records, 'FacadeKit_StorefrontFrame', matrixFor(frame, -frameHalf, 0.2, 1.75, [0.18, 0.08, 3.25]), budget);
    pushRecord(records, 'FacadeKit_StorefrontFrame', matrixFor(frame, frameHalf, 0.2, 1.75, [0.18, 0.08, 3.25]), budget);
    pushRecord(records, 'FacadeKit_StorefrontFrame', matrixFor(frame, 0, 0.2, 3.3, [facadeWidth * 0.78, 0.08, 0.18]), budget);

    const levels = clamp(Math.floor((height - 4) / 3.1), 2, 7);
    let balconies = 0;
    if (residential) {
      const balconyWidth = facadeWidth * 0.54;
      for (let level = 0; level < levels; level += 2) {
        const altitude = 4.0 + (level * 3.05);
        if (altitude > height - 1.2) break;
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
    const levels = clamp(Math.floor(height / 3.15), 2, 7);
    const bays = clamp(Math.floor(facadeWidth / 5.2), 2, 7);
    const baySpacing = facadeWidth / bays;
    const openingWidth = Math.min(3.6, baySpacing * 0.68);
    for (let level = 0; level < levels; level += 1) {
      const altitude = 1.65 + (level * 3.05);
      if (altitude > height - 0.8) break;
      for (let bay = 0; bay < bays; bay += 1) {
        const along = (-facadeWidth / 2) + (baySpacing * (bay + 0.5));
        if (pushRecord(records, 'FacadeKit_EntryDoor', matrixFor(frame, along, 0.17, altitude, [openingWidth, 0.07, 1.55]), budget)) openings += 1;
      }
      pushRecord(records, 'FacadeKit_TowerSpandrel', matrixFor(frame, 0, 0.2, altitude + 1.45, [facadeWidth * 0.96, 0.08, 0.24]), budget);
    }
    const pierHeight = clamp(height - 0.8, 6, 28);
    const pierCenter = pierHeight / 2;
    for (let bay = 0; bay <= bays; bay += 1) {
      const along = (-facadeWidth / 2) + (baySpacing * bay);
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
    const baySpacing = facadeWidth / bays;
    const windowWidth = Math.min(residential ? 1.35 : 1.7, baySpacing * 0.58);
    for (let floor = 0; floor < floors; floor += 1) {
      const altitude = residential ? 1.9 + (floor * 3.0) : 4.25 + (floor * 3.05);
      if (altitude > height - 1) break;
      for (let bay = 0; bay < bays; bay += 1) {
        if (secondary && residential && bay === Math.floor(bays / 2) && floor === 0) continue;
        const along = (-facadeWidth / 2) + (baySpacing * (bay + 0.5));
        if (!pushRecord(records, 'FacadeKit_WindowBay', matrixFor(frame, along, 0.17, altitude, [windowWidth, 0.07, 1.35]), budget)) break;
        pushRecord(records, 'FacadeKit_Mullion', matrixFor(frame, along + (windowWidth / 2) + 0.08, 0.2, altitude, [0.08, 0.05, 1.55]), budget);
      }
    }
    return budget.count - startCount;
  }

  function buildFacadeRecords(features, options, map) {
    const started = global.performance?.now?.() || Date.now();
    const records = Object.fromEntries(MODULE_NAMES.map((name) => [name, []]));
    const budget = { count: 0 };
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
      const ring = outerRing(feature);
      const centroid = ringCentroid(ring);
      if (!centroid || !ring) continue;
      const key = featureKey(feature, centroid);
      if (seen.has(key)) continue;
      seen.add(key);
      if (options.isProtected?.(feature, centroid)) continue;
      if (!isPlainArchitectureCandidate(feature)) continue;
      const height = clamp(Number(feature?.properties?.height || 0), 4, 72);
      if (!Number.isFinite(height)) continue;
      const centroidMerc = mapboxgl.MercatorCoordinate.fromLngLat(centroid, 0);
      const distance = Math.hypot(centroidMerc.x - centerMerc.x, centroidMerc.y - centerMerc.y);
      const distanceMeters = distance / centroidMerc.meterInMercatorCoordinateUnits();
      if (distanceMeters > 2100) continue;
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
      const frame = outwardEdgeFrame(item.ring, item.centroid, roadSegments);
      if (!frame) continue;
      const facadeWidth = clamp(frame.meters * 0.92, 4, 42);
      const residential = item.profile === 'home';
      const tower = /tower$/.test(item.profile) || (item.height >= 28 && item.profile !== 'parking' && !residential);
      if (tower) {
        architectureStats.towers += 1;
        const towerFrames = exteriorEdgeFrames(item.ring, item.centroid, frame, item.height >= 42 ? 4 : 3);
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
        const parkingFrames = exteriorEdgeFrames(item.ring, item.centroid, frame, item.height >= 12 ? 3 : 2);
        for (const parkingFrame of parkingFrames) {
          const parkingResult = addParkingFacade(records, parkingFrame, item.height, budget);
          architectureStats.parkingOpenings += parkingResult.openings;
        }
        continue;
      }
      const midrise = item.height >= 14 && !residential;
      if (midrise) {
        architectureStats.midrises += 1;
        const midriseFrames = exteriorEdgeFrames(item.ring, item.centroid, frame, item.height >= 22 ? 3 : 2);
        for (const midriseFrame of midriseFrames) {
          const midriseResult = addMidriseFacade(records, midriseFrame, item.height, item.feature, budget);
          if (midriseResult.pieces > 0) architectureStats.midriseFacades += 1;
          architectureStats.balconies += midriseResult.balconies;
          if (midriseResult.storefront) architectureStats.storefronts += 1;
        }
        continue;
      }
      if (addOrderedWindowGrid(records, frame, item.height, residential, budget) > 0) architectureStats.lowriseFaces += 1;

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
        pushRecord(records, 'FacadeKit_Canopy', matrixFor(frame, doorAlong, 0.42, 3.05, [4.2, 0.8, 0.16]), budget);
      }
      if (facadeWidth >= 8 && budget.count < MAX_INSTANCES) {
        const sideFrame = adjacentTowerFrame(item.ring, item.centroid, frame);
        if (addOrderedWindowGrid(records, sideFrame, item.height, residential, budget, true) > 0) architectureStats.lowriseFaces += 1;
      }
    }

    return {
      records,
      buildings: selected.length,
      instances: budget.count,
      skipped: Math.max(0, candidates.length - selected.length),
      ...architectureStats,
      recordsBuildMs: Math.round((global.performance?.now?.() || Date.now()) - started),
      roadQueryMs: Math.round(roadQueryMs)
    };
  }

  function clearInstancedRoot(root) {
    while (root.children.length) {
      root.children.pop();
    }
  }

  function tuneFacadeMaterial(name, material) {
    const colors = {
      FacadeKit_WindowBay: 0x587f8d,
      FacadeKit_EntryDoor: 0x29434d,
      FacadeKit_Canopy: 0x465255,
      FacadeKit_BrickPanel: 0xb06349,
      FacadeKit_LimestonePanel: 0xd4c5a7,
      FacadeKit_WoodPanel: 0x815f47,
      FacadeKit_ConcretePanel: 0xb9b5ac,
      FacadeKit_Mullion: 0xd9dfe0,
      FacadeKit_GarageDoor: 0xc9c7bd,
      FacadeKit_Porch: 0x8a7159,
      FacadeKit_Driveway: 0x929895,
      FacadeKit_TowerWindowBay: 0x4b7888,
      FacadeKit_TowerLobbyGlass: 0x6699a2,
      FacadeKit_TowerSpandrel: 0x3d535c,
      FacadeKit_TowerColumn: 0xd1d8d6,
      FacadeKit_MidriseWindowBand: 0x5d818b,
      FacadeKit_MasonryPier: 0xd6c9ae,
      FacadeKit_BalconySlab: 0xc5c1b8,
      FacadeKit_BalconyRail: 0x47565b,
      FacadeKit_StorefrontFrame: 0x354a52,
      FacadeKit_TowerCrownBand: 0x71858c
    };
    const neighborhoodSkinColor = global.SimpleRidesNeighborhoodSkinV1?.getFacadeMaterialColor?.(name);
    const color = neighborhoodSkinColor || colors[name];
    if (color && material.color) material.color.setHex(color);
    material.side = THREE.DoubleSide;
    if (material.emissive && material.color) {
      material.emissive.copy(material.color).multiplyScalar(/Window|Glass|EntryDoor/.test(name) ? 0.02 : 0.01);
      material.emissiveIntensity = 0.3;
    }
    if (/Window|Glass/.test(name)) {
      material.opacity = 1;
      material.transparent = false;
      material.depthWrite = true;
      if ('roughness' in material) material.roughness = 0.34;
      if ('metalness' in material) material.metalness = 0.16;
    } else if (/Brick|Limestone|Wood|Concrete|Masonry|Porch|Driveway/.test(name)) {
      if ('roughness' in material) material.roughness = /Wood/.test(name) ? 0.78 : 0.9;
      if ('metalness' in material) material.metalness = 0.02;
    } else if (/Mullion|Rail|Frame|Canopy|Crown/.test(name)) {
      if ('roughness' in material) material.roughness = 0.46;
      if ('metalness' in material) material.metalness = 0.42;
    }
    material.depthTest = true;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -2;
    material.polygonOffsetUnits = -2;
    material.needsUpdate = true;
    return material;
  }

  function create(options) {
    const map = options.map;
    const state = {
      enabled: options.enabled !== false,
      ready: false,
      loading: false,
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
    }

    const notify = () => options.onStatus?.({ ...state, layerId: LAYER_ID, minZoom: MIN_ZOOM });

    const layer = {
      id: LAYER_ID,
      type: 'custom',
      // Standard's building volumes occupy the middle 3D pass. Mount the skin in
      // the top slot so shallow facade modules remain visible while still sharing
      // Mapbox's depth buffer and geographic camera.
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
              if (node.isMesh && MODULE_NAMES.includes(node.name)) prototypes[node.name] = node;
            });
            const missing = MODULE_NAMES.filter((name) => !prototypes[name]);
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
        const meshStarted = global.performance?.now?.() || Date.now();
        for (const name of MODULE_NAMES) {
          const matrices = result.records[name];
          if (!matrices.length || !prototypes[name]) continue;
          const geometry = prototypes[name].geometry;
          let material = meshMaterials.get(name);
          if (!material) {
            material = tuneFacadeMaterial(name, prototypes[name].material.clone());
            meshMaterials.set(name, material);
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
        state.skipped = result.skipped;
        state.recordsBuildMs = result.recordsBuildMs;
        state.roadQueryMs = result.roadQueryMs;
        state.meshBuildMs = Math.round((global.performance?.now?.() || Date.now()) - meshStarted);
        state.lastBuildMs = Math.round((global.performance?.now?.() || Date.now()) - started);
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

  global.SimpleRidesFacadeKitV1 = {
    create,
    layerId: LAYER_ID,
    assetUrl: ASSET_URL,
    limits: { minZoom: MIN_ZOOM, maxBuildings: MAX_BUILDINGS, maxInstances: MAX_INSTANCES }
  };
})(window);
