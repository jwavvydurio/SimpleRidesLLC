import {
  distanceMeters,
  evaluatePosition,
  replayPointToPosition,
  smoothHeading
} from "./live-location-core.js";

export class LiveLocationController {
  constructor(options) {
    this.map = options.map;
    this.mapboxgl = options.mapboxgl;
    this.readout = options.readout || null;
    this.onLocation = options.onLocation || (() => {});
    this.onModeChange = options.onModeChange || (() => {});
    this.cameraUpdater = options.cameraUpdater || null;
    this.maxAccuracyMeters = options.maxAccuracyMeters || 65;
    this.mode = "follow";
    this.lastPosition = null;
    this.smoothedHeading = null;
    this.control = null;
    this.replayTimer = 0;
    this.destroyed = false;
    this.boundMapHandlers = [];
  }

  setMode(mode, reason = "programmatic") {
    if (!['follow', 'passive', 'manual'].includes(mode)) return false;
    if (this.mode === mode) return true;
    this.mode = mode;
    document.body.dataset.mockCameraMode = mode;
    document.body.dataset.mockCameraModeReason = reason;
    this.onModeChange({ mode, reason });
    this.updateReadout();
    return true;
  }

  updateReadout(extra = "") {
    if (!this.readout) return;
    if (!this.lastPosition) {
      this.readout.textContent = extra || `GPS ${this.mode}: waiting for a trusted fix`;
      return;
    }
    const { coordinate, accuracy, heading } = this.lastPosition;
    const headingText = heading === null ? "heading --" : `heading ${Math.round(heading)} deg`;
    this.readout.textContent = `Live ${this.mode}: ${coordinate[1].toFixed(5)}, ${coordinate[0].toFixed(5)} | +/-${Math.round(accuracy)}m | ${headingText}${extra ? ` | ${extra}` : ""}`;
  }

  applyCamera(position) {
    if (this.mode !== "follow") return;
    if (this.cameraUpdater) {
      this.cameraUpdater(position, this.mode);
      return;
    }
    this.map.easeTo({
      center: position.coordinate,
      bearing: position.heading ?? this.map.getBearing(),
      zoom: Math.max(this.map.getZoom(), 16.2),
      pitch: 60,
      duration: 520,
      essential: true
    });
  }

  ingest(rawPosition, source = "browser") {
    const result = evaluatePosition(rawPosition, {
      maxAccuracyMeters: this.maxAccuracyMeters,
      maxAgeMs: source === "replay" ? 60000 : 15000
    });
    if (!result.accepted) {
      document.body.dataset.mockGpsLastRejected = result.reason;
      this.updateReadout(result.reason === "low-accuracy" ? "refining accuracy" : result.reason);
      return false;
    }

    const next = result.position;
    const movement = this.lastPosition
      ? distanceMeters(this.lastPosition.coordinate, next.coordinate)
      : Infinity;
    this.smoothedHeading = smoothHeading(
      this.smoothedHeading,
      next.speed >= 0.8 ? next.heading : this.smoothedHeading,
      movement > 12 ? 0.42 : 0.26
    );
    next.heading = this.smoothedHeading;
    this.lastPosition = next;
    document.body.dataset.mockGpsStatus = "trusted";
    document.body.dataset.mockGpsAccuracy = String(Math.round(next.accuracy));
    document.body.dataset.mockGpsSource = source;
    this.updateReadout(source === "replay" ? "GPS replay" : "");
    this.onLocation(next, { source, movement });
    this.applyCamera(next);
    return true;
  }

  bindMapModeEvents() {
    const makePassive = (event) => {
      if (event?.originalEvent && this.mode === "follow") this.setMode("passive", "user-map-gesture");
    };
    ["dragstart", "rotatestart", "zoomstart"].forEach((name) => {
      this.map.on(name, makePassive);
      this.boundMapHandlers.push([name, makePassive]);
    });
  }

  install() {
    if (this.control || this.destroyed) return this.control;
    this.control = new this.mapboxgl.GeolocateControl({
      positionOptions: {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 3000
      },
      fitBoundsOptions: { maxZoom: 17.2 },
      trackUserLocation: true,
      showAccuracyCircle: true,
      showUserHeading: true
    });
    this.map.addControl(this.control, "bottom-right");
    this.control.on("geolocate", (event) => this.ingest(event, "browser"));
    this.control.on("error", (event) => {
      document.body.dataset.mockGpsStatus = "error";
      this.updateReadout(event?.message || "location unavailable");
    });
    this.control.on("trackuserlocationstart", () => this.setMode("follow", "geolocate-control"));
    this.control.on("trackuserlocationend", () => this.setMode("passive", "geolocate-control"));
    this.bindMapModeEvents();
    document.body.dataset.mockGpsController = "mapbox-geolocate-tracked";
    window.setTimeout(() => {
      if (!this.destroyed && !new URLSearchParams(window.location.search).has("gpsReplay")) {
        this.control?.trigger?.();
      }
    }, 700);
    return this.control;
  }

  resumeFollow() {
    this.setMode("follow", "resume-follow");
    if (this.lastPosition) this.applyCamera(this.lastPosition);
    else this.control?.trigger?.();
  }

  async replay(points, options = {}) {
    this.stopReplay();
    this.setMode("follow", "gps-replay");
    const intervalMs = Math.max(20, Number(options.intervalMs || 220));
    const startedAt = Date.now();
    let index = 0;
    return new Promise((resolve) => {
      const step = () => {
        if (this.destroyed || index >= points.length) {
          this.replayTimer = 0;
          document.body.dataset.mockGpsReplay = `complete:${index}`;
          resolve(index);
          return;
        }
        this.ingest(replayPointToPosition(points[index], startedAt), "replay");
        index += 1;
        document.body.dataset.mockGpsReplay = `running:${index}/${points.length}`;
        this.replayTimer = window.setTimeout(step, intervalMs);
      };
      step();
    });
  }

  stopReplay() {
    window.clearTimeout(this.replayTimer);
    this.replayTimer = 0;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopReplay();
    this.boundMapHandlers.forEach(([name, handler]) => this.map.off(name, handler));
    this.boundMapHandlers = [];
    if (this.control) {
      try { this.map.removeControl(this.control); } catch {}
    }
    this.control = null;
  }
}
