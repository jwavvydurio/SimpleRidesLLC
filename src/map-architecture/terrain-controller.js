const TERRAIN_SOURCE_ID = 'src-mock-mapbox-terrain-dem';

export function createTerrainController(map, options = {}) {
  const exaggeration = Math.max(0.8, Math.min(1.35, Number(options.exaggeration || 1.04)));
  let installed = false;
  let lastElevation = 0;

  function install() {
    if (!map?.isStyleLoaded?.()) return false;
    try {
      if (!map.getSource(TERRAIN_SOURCE_ID)) {
        map.addSource(TERRAIN_SOURCE_ID, {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14
        });
      }
      map.setTerrain({ source: TERRAIN_SOURCE_ID, exaggeration });
      installed = true;
      document.body.dataset.mockTerrain = `active:${exaggeration.toFixed(2)}`;
      return true;
    } catch (error) {
      installed = false;
      document.body.dataset.mockTerrain = 'base-map-fallback';
      window.__srMockTerrainError = String(error?.message || error);
      return false;
    }
  }

  function elevationAt(coordinate) {
    try {
      const elevation = Number(map.queryTerrainElevation?.(coordinate, { exaggerated: true }) || 0);
      if (Number.isFinite(elevation)) lastElevation = elevation;
    } catch {
      // The base map remains usable while DEM tiles settle.
    }
    return lastElevation;
  }

  function cameraOptions(position) {
    const elevation = elevationAt(position.coordinate);
    const speed = Math.max(0, Number(position.speed || 0));
    const pitch = speed > 18 ? 56 : speed > 5 ? 59 : 61;
    document.body.dataset.mockTerrainElevation = String(Math.round(elevation));
    return {
      center: position.coordinate,
      bearing: position.heading ?? map.getBearing(),
      zoom: Math.max(map.getZoom(), 16.2),
      pitch,
      duration: speed > 15 ? 360 : 520,
      essential: true
    };
  }

  function destroy() {
    installed = false;
  }

  return {
    sourceId: TERRAIN_SOURCE_ID,
    install,
    elevationAt,
    cameraOptions,
    destroy,
    getStatus: () => ({ installed, exaggeration, lastElevation })
  };
}
