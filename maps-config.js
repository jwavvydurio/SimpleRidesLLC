window.SimpleRidesMaps = {
  provider: "mapbox",
  mapboxAccessToken: import.meta.env.VITE_MAPBOX_TOKEN?.trim() || "",
  defaultCenter: [-97.7431, 30.2672],
  defaultZoom: 19.1,
  style: "mapbox://styles/mapbox/standard",
  fallbackStyle: "mapbox://styles/mapbox/standard",
  terrain: true,
  terrainExaggeration: 1.12,
  buildings3d: true,
  buildingShadows: true,
  streetPitch: 72,
  streetBearing: -18,
  cesiumIonToken: "",
  googlePhotorealisticTiles: false
};

