const EARTH_RADIUS_METERS = 6371000;

export function normalizeHeading(value) {
  const heading = Number(value);
  if (!Number.isFinite(heading)) return null;
  return ((heading % 360) + 360) % 360;
}

export function smoothHeading(previous, next, weight = 0.28) {
  const normalizedNext = normalizeHeading(next);
  const normalizedPrevious = normalizeHeading(previous);
  if (normalizedNext === null) return normalizedPrevious;
  if (normalizedPrevious === null) return normalizedNext;
  const delta = ((normalizedNext - normalizedPrevious + 540) % 360) - 180;
  return normalizeHeading(normalizedPrevious + delta * Math.min(1, Math.max(0, weight)));
}

export function distanceMeters(from, to) {
  if (!Array.isArray(from) || !Array.isArray(to)) return Infinity;
  const lat1 = Number(from[1]) * Math.PI / 180;
  const lat2 = Number(to[1]) * Math.PI / 180;
  const deltaLat = (Number(to[1]) - Number(from[1])) * Math.PI / 180;
  const deltaLng = (Number(to[0]) - Number(from[0])) * Math.PI / 180;
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function normalizePosition(position, now = Date.now()) {
  const coords = position?.coords || position?.position?.coords || position;
  const longitude = Number(coords?.longitude ?? coords?.lng);
  const latitude = Number(coords?.latitude ?? coords?.lat);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return {
    coordinate: [longitude, latitude],
    accuracy: Math.max(0, Number(coords?.accuracy || 0)),
    altitude: Number.isFinite(Number(coords?.altitude)) ? Number(coords.altitude) : null,
    altitudeAccuracy: Number.isFinite(Number(coords?.altitudeAccuracy)) ? Number(coords.altitudeAccuracy) : null,
    heading: normalizeHeading(coords?.heading),
    speed: Number.isFinite(Number(coords?.speed)) ? Math.max(0, Number(coords.speed)) : 0,
    timestamp: Number(position?.timestamp || now)
  };
}

export function evaluatePosition(position, options = {}) {
  const normalized = normalizePosition(position, options.now);
  if (!normalized) return { accepted: false, reason: "invalid-coordinate", position: null };
  const maxAccuracy = Number(options.maxAccuracyMeters || 65);
  const maxAge = Number(options.maxAgeMs || 15000);
  const age = Math.max(0, Number(options.now || Date.now()) - normalized.timestamp);
  if (normalized.accuracy > maxAccuracy) {
    return { accepted: false, reason: "low-accuracy", position: normalized };
  }
  if (age > maxAge) {
    return { accepted: false, reason: "stale", position: normalized };
  }
  return { accepted: true, reason: "trusted", position: normalized };
}

export function replayPointToPosition(point, startedAt = Date.now()) {
  return {
    coords: {
      longitude: point.longitude,
      latitude: point.latitude,
      accuracy: point.accuracy ?? 7,
      altitude: point.altitude ?? null,
      altitudeAccuracy: point.altitudeAccuracy ?? null,
      heading: point.heading ?? null,
      speed: point.speed ?? 8
    },
    timestamp: startedAt + Number(point.offsetMs || 0)
  };
}
