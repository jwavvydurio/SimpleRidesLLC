const DEFAULTS = Object.freeze({
  low: Object.freeze({ maxBuildings: 30, maxInstances: 360, dprCap: 1.25, lod0Zoom: 17.0, lod1Zoom: 15.2, longTaskMs: 90, maxFacadeBuildMs: 800, maxMapReadyMs: 12000, hardMapReadyMs: 30000, maxLongTasks: 16 }),
  balanced: Object.freeze({ maxBuildings: 48, maxInstances: 620, dprCap: 1.75, lod0Zoom: 16.5, lod1Zoom: 14.8, longTaskMs: 72, maxFacadeBuildMs: 650, maxMapReadyMs: 10000, hardMapReadyMs: 25000, maxLongTasks: 12 }),
  high: Object.freeze({ maxBuildings: 64, maxInstances: 820, dprCap: 2, lod0Zoom: 16.1, lod1Zoom: 14.45, longTaskMs: 60, maxFacadeBuildMs: 520, maxMapReadyMs: 8500, hardMapReadyMs: 20000, maxLongTasks: 10 })
});

export function deriveArchitectureBudget(environment = {}) {
  const memory = Number(environment.deviceMemory || 4);
  const cores = Number(environment.hardwareConcurrency || 4);
  const reducedMotion = Boolean(environment.reducedMotion);
  const coarsePointer = Boolean(environment.coarsePointer);
  let tier = 'balanced';
  if (memory <= 2 || cores <= 2 || reducedMotion) tier = 'low';
  else if (memory >= 8 && cores >= 8 && !coarsePointer) tier = 'high';
  return { tier, ...DEFAULTS[tier] };
}

export function evaluateArchitecturePerformance(state = {}) {
  const blockers = [];
  const advisories = [];
  const worstBuildMs = Number(state.worstBuildMs || 0);
  const latestBuildMs = Number(state.latestBuildMs ?? worstBuildMs);
  const mapReadyMs = Number(state.mapReadyMs || 0);
  const longTasks = Number(state.longTasks || 0);
  const mapReadyTargetMs = Number(state.maxMapReadyMs || Infinity);
  const hardMapReadyMs = Number(state.hardMapReadyMs || mapReadyTargetMs);
  if (latestBuildMs > Number(state.maxFacadeBuildMs || Infinity)) blockers.push('facade build over budget');
  if (mapReadyMs > hardMapReadyMs) blockers.push('map ready hard limit exceeded');
  else if (mapReadyMs > mapReadyTargetMs) advisories.push('remote map-ready target exceeded');
  if (longTasks > Number(state.maxLongTasks || Infinity)) advisories.push('ambient long-task budget exceeded');
  return { ready: blockers.length === 0, blockers, advisories, latestBuildMs, worstBuildMs, mapReadyMs, longTasks };
}

export function createPerformanceBudgetController(globalObject = window) {
  const media = globalObject.matchMedia?.('(prefers-reduced-motion: reduce)');
  const coarse = globalObject.matchMedia?.('(pointer: coarse)');
  const budget = deriveArchitectureBudget({
    deviceMemory: globalObject.navigator?.deviceMemory,
    hardwareConcurrency: globalObject.navigator?.hardwareConcurrency,
    reducedMotion: media?.matches,
    coarsePointer: coarse?.matches
  });
  const state = {
    ...budget,
    longTasks: 0,
    worstLongTaskMs: 0,
    frameSamples: 0,
    slowFrames: 0,
    latestBuildMs: 0,
    worstBuildMs: 0,
    mapReadyMs: 0,
    observationStartedAt: 0,
    startedAt: Date.now()
  };
  let observer = null;

  function publish() {
    const gate = evaluateArchitecturePerformance(state);
    globalObject.__srMockPerformanceBudget = { ...state, gate };
    if (globalObject.document?.body) {
      globalObject.document.body.dataset.mockPerformanceTier = state.tier;
      globalObject.document.body.dataset.mockLongTasks = String(state.longTasks);
      globalObject.document.body.dataset.mockWorstLongTaskMs = String(Math.round(state.worstLongTaskMs));
      globalObject.document.body.dataset.mockWorstFacadeBuildMs = String(Math.round(state.worstBuildMs));
      globalObject.document.body.dataset.mockMapReadyMs = String(Math.round(state.mapReadyMs));
      globalObject.document.body.dataset.mockPerformanceGate = gate.ready ? 'clean' : 'review';
    }
  }

  function recordBuild(durationMs) {
    const duration = Number(durationMs || 0);
    state.frameSamples += 1;
    state.latestBuildMs = duration;
    state.worstBuildMs = Math.max(state.worstBuildMs, duration);
    if (duration > state.longTaskMs) state.slowFrames += 1;
    publish();
  }

  function recordMapReady(durationMs) {
    const duration = Math.max(0, Number(durationMs || 0));
    if (!state.mapReadyMs || duration < state.mapReadyMs) state.mapReadyMs = duration;
    state.longTasks = 0;
    state.worstLongTaskMs = 0;
    state.frameSamples = 0;
    state.slowFrames = 0;
    state.observationStartedAt = globalObject.performance?.now?.() || 0;
    state.interactiveAt = Date.now();
    publish();
  }

  function start() {
    try {
      if ('PerformanceObserver' in globalObject) {
        observer = new globalObject.PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.startTime < state.observationStartedAt) return;
            state.longTasks += 1;
            state.worstLongTaskMs = Math.max(state.worstLongTaskMs, entry.duration || 0);
          });
          publish();
        });
        observer.observe({ type: 'longtask', buffered: false });
      }
    } catch {
      observer = null;
    }
    publish();
    return controller;
  }

  function destroy() {
    observer?.disconnect?.();
    observer = null;
  }

  const controller = {
    state,
    start,
    destroy,
    recordBuild,
    recordMapReady,
    getBudget: () => ({ ...state, gate: evaluateArchitecturePerformance(state) })
  };
  return controller;
}
