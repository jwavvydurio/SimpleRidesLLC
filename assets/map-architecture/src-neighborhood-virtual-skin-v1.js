(function installSimpleRidesNeighborhoodSkinV1(global) {
  'use strict';

  const VERSION = '1.4.2-go-live-clarity';
  const ACTIVE_CLASS = 'src-neighborhood-skin-active';
  const LAYER_IDS = {
    walls: 'src-mock-real-building-tileset-storefront-base',
    entries: 'src-mock-real-building-tileset-entry-shadow-reveals',
    glass: 'src-mock-real-building-tileset-street-glass-bands',
    parking: 'src-mock-real-building-tileset-parking-deck-bands'
  };

  const facadePalette = Object.freeze({
    FacadeKit_WindowBay: 0x426f78,
    FacadeKit_EntryDoor: 0x173d43,
    FacadeKit_Canopy: 0x293f42,
    FacadeKit_BrickPanel: 0x934632,
    FacadeKit_LimestonePanel: 0xc5b18a,
    FacadeKit_WoodPanel: 0x6f513a,
    FacadeKit_ConcretePanel: 0xa9aca8,
    FacadeKit_Mullion: 0xd6dedb,
    FacadeKit_GarageDoor: 0x969c98,
    FacadeKit_Porch: 0x745c46,
    FacadeKit_Driveway: 0x747f7b,
    FacadeKit_TowerWindowBay: 0x355c68,
    FacadeKit_TowerLobbyGlass: 0x4f7d84,
    FacadeKit_TowerSpandrel: 0x2f474d,
    FacadeKit_TowerColumn: 0xd9dfdc,
    FacadeKit_MidriseWindowBand: 0x3b6670,
    FacadeKit_MasonryPier: 0xc9b58d,
    FacadeKit_BalconySlab: 0xb8b7af,
    FacadeKit_BalconyRail: 0x526b6f,
    FacadeKit_StorefrontFrame: 0x3d6368,
    FacadeKit_TowerCrownBand: 0x718589
  });

  const wallColor = [
    'match',
    ['get', 'material'],
    'brick', '#934632',
    'residentialBrick', '#98543e',
    'retailBrick', '#a6402b',
    'softTerracotta', '#b95d3d',
    'warmWood', '#6f513a',
    'storefrontWarm', '#548f8b',
    'parkingGarage', '#5d625f',
    'officeGlass', '#527f8b',
    'midriseGlass', '#65949b',
    'creamGlass', '#9ebbb4',
    'steelStone', '#75878a',
    'hotelStoneGlass', '#b7a276',
    'limestone', '#c5b081',
    'tanStone', '#b78950',
    'paleConcrete', '#adaea6',
    'entertainmentStorefront', '#65958f',
    ['coalesce', ['get', 'baseColor'], '#ad986f']
  ];

  const entryColor = [
    'match',
    ['get', 'material'],
    'storefrontWarm', '#16474b',
    'parkingGarage', '#252925',
    'retailBrick', '#6f3427',
    'brick', '#66352a',
    'residentialBrick', '#643a2e',
    'warmWood', '#463326',
    'officeGlass', '#274e57',
    'midriseGlass', '#305963',
    'hotelStoneGlass', '#6b5f4a',
    'limestone', '#76664b',
    'tanStone', '#735535',
    'paleConcrete', '#5d615d',
    '#302d28'
  ];

  const glassColor = [
    'match',
    ['get', 'material'],
    'retailBrick', '#63c7c2',
    'storefrontWarm', '#5bd2ca',
    'hotelStoneGlass', '#7ec8d0',
    'entertainmentStorefront', '#58cfc6',
    'officeGlass', '#4bb8ce',
    'midriseGlass', '#64bdc8',
    'creamGlass', '#82cec8',
    'steelStone', '#72b2bd',
    'limestone', '#d8e4db',
    'tanStone', '#d5b982',
    'paleConcrete', '#d4d8d1',
    ['coalesce', ['get', 'windowColor'], '#6bd2d0']
  ];

  let map = null;
  let enabled = true;
  let applyCount = 0;
  let lastReason = 'initializing';
  let lastError = '';
  let lastLayerSignature = '';

  function setConfig(property, value) {
    try {
      map?.setConfigProperty?.('basemap', property, value);
      return true;
    } catch {
      return false;
    }
  }

  function setPaint(layerId, property, value) {
    try {
      if (!map?.getLayer?.(layerId)) return false;
      map.setPaintProperty(layerId, property, value);
      return true;
    } catch {
      return false;
    }
  }

  function updatePublicStatus(mountedLayers) {
    const status = {
      active: enabled,
      version: VERSION,
      mode: 'Mapbox shared-WebGL visual skin',
      coverage: 'map-wide environment; published footprints for architecture',
      mountedLayers,
      applyCount,
      lastReason,
      error: lastError
    };
    global.__srNeighborhoodVirtualSkin = status;
    if (global.document?.body?.dataset) {
      global.document.body.dataset.srcNeighborhoodSkin = enabled ? 'active' : 'inactive';
      global.document.body.dataset.srcNeighborhoodSkinLayers = String(mountedLayers);
      global.document.body.dataset.srcNeighborhoodSkinVersion = VERSION;
    }
    global.document?.dispatchEvent?.(new CustomEvent('src-neighborhood-skin:status', { detail: status }));
    return status;
  }

  function apply(reason = 'refresh') {
    lastReason = reason;
    if (!enabled || !map) return updatePublicStatus(0);
    try {
      document.body.classList.add(ACTIVE_CLASS);
      const layerSignature = Object.values(LAYER_IDS)
        .filter((layerId) => map.getLayer?.(layerId))
        .sort()
        .join('|');
      if (reason === 'map-idle' && layerSignature === lastLayerSignature) {
        return updatePublicStatus(layerSignature ? layerSignature.split('|').length : 0);
      }
      setConfig('show3dObjects', true);
      setConfig('lightPreset', 'dusk');
      setConfig('show3dBuildings', true);
      setConfig('show3dLandmarks', true);
      setConfig('show3dFacades', true);
      setConfig('show3dTrees', true);
      setConfig('showRoadLabels', true);
      setConfig('showPointOfInterestLabels', true);
      setConfig('showPlaceLabels', true);

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

      const mounted = [
        setPaint(LAYER_IDS.walls, 'fill-extrusion-color', wallColor),
        setPaint(LAYER_IDS.walls, 'fill-extrusion-opacity', 0.92),
        setPaint(LAYER_IDS.walls, 'fill-extrusion-ambient-occlusion-intensity', 0.16),
        setPaint(LAYER_IDS.walls, 'fill-extrusion-ambient-occlusion-radius', 2.2),
        setPaint(LAYER_IDS.entries, 'fill-extrusion-color', entryColor),
        setPaint(LAYER_IDS.entries, 'fill-extrusion-opacity', 0.82),
        setPaint(LAYER_IDS.glass, 'fill-extrusion-color', glassColor),
        setPaint(LAYER_IDS.glass, 'fill-extrusion-opacity', 0.86),
        setPaint(LAYER_IDS.parking, 'fill-extrusion-color', '#222b28'),
        setPaint(LAYER_IDS.parking, 'fill-extrusion-opacity', 0.9)
      ].filter(Boolean).length;

      lastLayerSignature = layerSignature;
      applyCount += 1;
      lastError = '';
      return updatePublicStatus(mounted);
    } catch (error) {
      lastError = String(error?.message || error);
      return updatePublicStatus(0);
    }
  }

  function install(nextMap) {
    map = nextMap || map;
    enabled = true;
    return apply('install');
  }

  function refresh(reason = 'manual-refresh') {
    return apply(reason);
  }

  function destroy() {
    enabled = false;
    document.body.classList.remove(ACTIVE_CLASS);
    map = null;
    lastLayerSignature = '';
    return updatePublicStatus(0);
  }

  global.SimpleRidesNeighborhoodSkinV1 = Object.freeze({
    version: VERSION,
    install,
    apply,
    refresh,
    destroy,
    getFacadeMaterialColor(name) {
      return facadePalette[name] || null;
    },
    getStatus() {
      return { ...(global.__srNeighborhoodVirtualSkin || updatePublicStatus(0)) };
    }
  });
})(window);
