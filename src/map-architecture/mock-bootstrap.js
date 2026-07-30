import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { createPerformanceBudgetController } from "./performance-budget.js";

window.mapboxgl = mapboxgl;
window.__srMockDependencyVersions = Object.freeze({
  mapboxGl: mapboxgl.version,
  three: "not-loaded",
  pipeline: "mapbox-native-model-layers"
});
window.__srMockPerformanceController = createPerformanceBudgetController(window).start();

await import("../../assets/map-architecture/facade-kit-v2-runtime.js");
await import("./mock-app.js");
