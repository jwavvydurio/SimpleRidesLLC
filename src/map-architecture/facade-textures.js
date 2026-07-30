function makeTexture(THREE, size, painter, colorSpace = null) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const color = painter(x, y, size);
      const offset = ((y * size) + x) * 4;
      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = color[3] ?? 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  if (colorSpace && 'colorSpace' in texture) texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

function tilePattern(base, mortar, tileWidth, tileHeight) {
  return (x, y) => {
    const row = Math.floor(y / tileHeight);
    const shifted = (x + ((row % 2) * Math.floor(tileWidth / 2))) % tileWidth;
    const seam = shifted <= 1 || y % tileHeight <= 1;
    return seam ? mortar : base;
  };
}

export function createFacadeTextureSet(THREE) {
  const srgb = THREE.SRGBColorSpace;
  const neutralNormal = makeTexture(THREE, 32, (x, y) => {
    const seam = x % 8 <= 1 || y % 8 <= 1;
    return seam ? [118, 118, 244, 255] : [128, 128, 255, 255];
  });
  const set = {
    glass: {
      map: makeTexture(THREE, 32, (x, y) => {
        const mullion = x % 8 <= 1 || y % 10 <= 1;
        const highlight = (x + y) % 17 === 0;
        if (mullion) return [212, 221, 220, 255];
        return highlight ? [132, 181, 192, 255] : [69, 111, 128, 255];
      }, srgb),
      normalMap: neutralNormal,
      roughnessMap: makeTexture(THREE, 16, (x, y) => ((x + y) % 5 === 0 ? [68, 68, 68, 255] : [96, 96, 96, 255]))
    },
    brick: {
      map: makeTexture(THREE, 32, tilePattern([157, 78, 58, 255], [194, 168, 139, 255], 8, 5), srgb),
      normalMap: neutralNormal,
      roughnessMap: makeTexture(THREE, 16, () => [224, 224, 224, 255])
    },
    stone: {
      map: makeTexture(THREE, 32, tilePattern([202, 190, 166, 255], [166, 155, 136, 255], 12, 8), srgb),
      normalMap: neutralNormal,
      roughnessMap: makeTexture(THREE, 16, () => [216, 216, 216, 255])
    },
    wood: {
      map: makeTexture(THREE, 32, (x, y) => {
        const seam = y % 5 <= 1;
        const grain = (x * 7 + y * 3) % 19 === 0;
        return seam ? [95, 68, 49, 255] : grain ? [139, 99, 68, 255] : [121, 86, 61, 255];
      }, srgb),
      normalMap: neutralNormal,
      roughnessMap: makeTexture(THREE, 16, () => [205, 205, 205, 255])
    },
    concrete: {
      map: makeTexture(THREE, 32, (x, y) => {
        const seam = x % 16 <= 1 || y % 12 <= 1;
        const grain = 184 + ((x * 13 + y * 7) % 9);
        return seam ? [148, 148, 144, 255] : [grain, grain, grain - 3, 255];
      }, srgb),
      normalMap: neutralNormal,
      roughnessMap: makeTexture(THREE, 16, () => [226, 226, 226, 255])
    },
    metal: {
      map: makeTexture(THREE, 16, (x) => (x % 4 === 0 ? [111, 124, 128, 255] : [66, 78, 82, 255]), srgb),
      normalMap: neutralNormal,
      roughnessMap: makeTexture(THREE, 16, () => [122, 122, 122, 255])
    }
  };
  return {
    get(kind) {
      return set[kind] || set.concrete;
    },
    dispose() {
      const textures = new Set([neutralNormal]);
      Object.values(set).forEach((entry) => Object.values(entry).forEach((texture) => textures.add(texture)));
      textures.forEach((texture) => texture.dispose?.());
    }
  };
}
