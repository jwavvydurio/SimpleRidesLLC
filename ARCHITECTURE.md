# Showcase architecture

The public showcase contains two selected surfaces:

```text
Neighborhood interface
demo/index.html
  -> demo/neighborhood.css
  -> demo/neighborhood.js
  -> assets/neighborhood/*

Austin map architecture
map-architecture-mock.html
  -> maps-config.js
  -> src/map-architecture/mock-bootstrap.js
  -> src/map-architecture/mock-app.js
  -> src/map-architecture/live-location-*.js
  -> src/map-architecture/terrain-controller.js
  -> src/map-architecture/performance-budget.js
  -> assets/map-architecture/*
```

## Map pipeline

1. Vite loads Mapbox GL JS and the safe local configuration.
2. The map initializes over Austin with the standard 3D basemap.
3. GPS input is quality-checked or replayed deterministically for testing.
4. The facade runtime classifies visible buildings and selects a model profile.
5. Mapbox-native model layers place level-of-detail assets without adding a second WebGL renderer.
6. Performance and replacement-rule checks report whether the scene is ready for review.

## Design decisions

- The visual neighborhood turns separate business capabilities into understandable destinations.
- Mapbox remains the map, camera, label, and depth authority.
- Native model layers keep the architecture pipeline inside the Mapbox renderer.
- GPS input is rejected when stale or too inaccurate.
- Device-aware performance budgets cap density and level of detail.
- No production token or private customer data is stored in this repository.

