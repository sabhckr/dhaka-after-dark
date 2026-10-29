import * as THREE from "three";
import { GRADE, PALETTE } from "@/viewer/grade.ts";
import { LOOKS, type CityLook } from "@/viewer/looks.ts";
import { canvasTexture, makeAsphalt, makeBallast, makeBark, makeCanopy, makeConcreteMaps, makeFacade, makePark, makeRoof, makeSidewalk, makeWater } from "@/viewer/proc-tex.ts";
import { buildPosterSheets, type CellUV } from "@/viewer/posters.ts";
import type { SurfaceLibrary } from "@/viewer/meshes.ts";

export type CityMaterials = {
  surfaces: SurfaceLibrary;
  sheets: { mat: THREE.MeshStandardMaterial; glow: boolean }[];
  cells: CellUV[];
  pole: THREE.MeshStandardMaterial;
  head: THREE.MeshStandardMaterial;
  cable: THREE.LineBasicMaterial;
  tank: THREE.MeshStandardMaterial;
  antenna: THREE.MeshStandardMaterial;
  sky: THREE.ShaderMaterial;
  ground: THREE.MeshStandardMaterial;
  fontOk: boolean;
  levels: { shopEmit: number };
  trackShop: (mat: THREE.MeshStandardMaterial) => void;
  untrackShop: (mat: THREE.MeshStandardMaterial) => void;
  applyLook: (look: CityLook, scene: THREE.Scene, renderer: THREE.WebGLRenderer, lights: CityLights, settled?: boolean) => void;
  setQuality: (quality: "low" | "high") => void;
  tick: (dt: number, lightning: number) => void;
  dispose: () => void;
};

export type CityLights = {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
};

function std(params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.02, ...params });
}

export async function loadBanglaFont(): Promise<boolean> {
  const faces = [
    new FontFace("Noto Sans Bengali", "url(/fonts/noto-sans-bengali-bengali-700-normal.woff)", {
      weight: "700",
      unicodeRange: "U+0980-09FF, U+200C-200D, U+0964-0965",
    }),
    new FontFace("Noto Sans Bengali", "url(/fonts/noto-sans-bengali-bengali-900-normal.woff)", {
      weight: "900",
      unicodeRange: "U+0980-09FF, U+200C-200D, U+0964-0965",
    }),
    new FontFace("Noto Sans Bengali", "url(/fonts/noto-sans-bengali-latin-700-normal.woff)", {
      weight: "700",
      unicodeRange: "U+0000-00FF",
    }),
  ];
  try {
    await Promise.all(faces.map((face) => face.load()));
    for (const face of faces) document.fonts.add(face);
    await document.fonts.load('700 48px "Noto Sans Bengali"');
    await document.fonts.load('900 64px "Noto Sans Bengali"');
    return true;
  } catch {
    return false;
  }
}

export function createCityMaterials(renderer: THREE.WebGLRenderer, fontOk: boolean): CityMaterials {
  const repeat = THREE.RepeatWrapping;
  const clamp = THREE.ClampToEdgeWrapping;
  const asphalt = makeAsphalt(true);
  const asphaltPlain = makeAsphalt(false);
  const asphaltMap = canvasTexture(asphalt.color, true, clamp, repeat);
  const asphaltRough = canvasTexture(asphalt.rough, false, clamp, repeat);
  const asphaltNormal = canvasTexture(asphalt.normal, false, clamp, repeat);
  const asphaltPlainMap = canvasTexture(asphaltPlain.color, true, repeat, repeat);
  const asphaltPlainRough = canvasTexture(asphaltPlain.rough, false, repeat, repeat);
  const asphaltPlainNormal = canvasTexture(asphaltPlain.normal, false, repeat, repeat);
  const side = makeSidewalk();
  const sideMap = canvasTexture(side.color, true, repeat, repeat);
  const sideRough = canvasTexture(side.rough, false, repeat, repeat);
  const sideNormal = canvasTexture(side.normal, false, repeat, repeat);
  const roof = makeRoof();
  const roofMap = canvasTexture(roof.color, true, repeat, repeat);
  const roofRough = canvasTexture(roof.rough, false, repeat, repeat);
  const roofNormal = canvasTexture(roof.normal, false, repeat, repeat);
  const deck = makeConcreteMaps("#d5c6b4");
  const deckMap = canvasTexture(deck.color, true, repeat, repeat);
  const deckRough = canvasTexture(deck.rough, false, repeat, repeat);
  const plaza = makeConcreteMaps("#e6d7c4");
  const plazaMap = canvasTexture(plaza.color, true, repeat, repeat);
  const parkMap = canvasTexture(makePark(), true, repeat, repeat);
  const waterMap = canvasTexture(makeWater(), true, repeat, repeat);
  const bark = makeBark();
  const barkMap = canvasTexture(bark.color, true, repeat, repeat);
  const barkRough = canvasTexture(bark.rough, false, repeat, repeat);
  const canopyMap = canvasTexture(makeCanopy(), true, repeat, repeat);
  const ballastMap = canvasTexture(makeBallast(), true, repeat, repeat);

  const facades: THREE.MeshStandardMaterial[] = [];
  const textures: THREE.Texture[] = [
    asphaltMap,
    asphaltRough,
    asphaltNormal,
    asphaltPlainMap,
    asphaltPlainRough,
    asphaltPlainNormal,
    sideMap,
    sideRough,
    sideNormal,
    roofMap,
    roofRough,
    roofNormal,
    deckMap,
    deckRough,
    plazaMap,
    parkMap,
    waterMap,
    barkMap,
    barkRough,
    canopyMap,
    ballastMap,
  ];
  const normalMats: THREE.MeshStandardMaterial[] = [];
  const bindNormal = (mat: THREE.MeshStandardMaterial, amp: number) => {
    mat.userData.normalAmp = amp;
    normalMats.push(mat);
  };
  for (let kind = 0; kind < 5; kind++) {
    const painted = makeFacade(kind);
    const map = canvasTexture(painted.color, true, repeat, repeat);
    const emit = canvasTexture(painted.emit, true, repeat, repeat);
    const rough = canvasTexture(painted.rough, false, repeat, repeat);
    const normal = canvasTexture(painted.normal, false, repeat, repeat);
    textures.push(map, emit, rough, normal);
    const mat = std({
      map,
      roughness: 1,
      roughnessMap: rough,
      normalMap: normal,
      normalScale: new THREE.Vector2(kind === 4 ? 0.85 : 0.5, kind === 4 ? 0.85 : 0.5),
      emissive: new THREE.Color(0xfff1dd),
      emissiveMap: emit,
      emissiveIntensity: 0.8,
      metalness: kind === 4 ? 0.35 : 0.02,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    bindNormal(mat, kind === 4 ? 0.85 : 0.5);
    facades.push(mat);
  }

  const surfaces: SurfaceLibrary = {
    roadMarked: std({
      map: asphaltMap,
      roughness: 1,
      roughnessMap: asphaltRough,
      normalMap: asphaltNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      metalness: 0.3,
      vertexColors: true,
      side: THREE.DoubleSide,
      envMapIntensity: 0.8,
    }),
    roadPlain: std({
      map: asphaltPlainMap,
      roughness: 1,
      roughnessMap: asphaltPlainRough,
      normalMap: asphaltPlainNormal,
      normalScale: new THREE.Vector2(0.3, 0.3),
      metalness: 0.12,
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
    bridge: std({ map: deckMap, roughness: 0.7, roughnessMap: deckRough, vertexColors: true, side: THREE.DoubleSide }),
    sidewalk: std({
      map: sideMap,
      roughness: 1,
      roughnessMap: sideRough,
      normalMap: sideNormal,
      normalScale: new THREE.Vector2(0.4, 0.4),
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
    water: std({
      map: waterMap,
      color: 0x1e3c44,
      roughness: 0.42,
      metalness: 0.16,
      vertexColors: true,
      side: THREE.DoubleSide,
      envMapIntensity: 0.45,
    }),
    canal: std({ map: waterMap, color: 0x1a3330, roughness: 0.48, metalness: 0.1, vertexColors: true, side: THREE.DoubleSide }),
    park: std({ map: parkMap, roughness: 1, vertexColors: true, side: THREE.DoubleSide }),
    plaza: std({ map: plazaMap, roughness: 0.92, vertexColors: true, side: THREE.DoubleSide }),
    deck: std({ map: deckMap, roughness: 0.75, roughnessMap: deckRough, vertexColors: true, side: THREE.DoubleSide }),
    rail: std({
      map: ballastMap,
      color: 0xffffff,
      roughness: 0.92,
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
    roof: std({
      map: roofMap,
      roughness: 1,
      roughnessMap: roofRough,
      normalMap: roofNormal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      vertexColors: true,
      side: THREE.DoubleSide,
    }),
    facades,
    trunk: std({ map: barkMap, roughness: 1, roughnessMap: barkRough, color: 0xffffff }),
    canopy: std({ map: canopyMap, roughness: 0.9, color: 0xffffff, vertexColors: true }),
  landmark: std({
    color: 0xffffff,
    emissive: 0xff8a4a,
    emissiveIntensity: 0.12,
    roughness: 0.55,
    vertexColors: true,
  }),
  trim: std({
    color: 0xffffff,
    roughness: 0.42,
    metalness: 0.28,
    vertexColors: true,
    side: THREE.DoubleSide,
  }),
};
  bindNormal(surfaces.roadMarked as THREE.MeshStandardMaterial, 0.35);
  bindNormal(surfaces.roadPlain as THREE.MeshStandardMaterial, 0.3);
  bindNormal(surfaces.sidewalk as THREE.MeshStandardMaterial, 0.4);
  bindNormal(surfaces.roof as THREE.MeshStandardMaterial, 0.45);

  const waterTime = { value: 0 };
  const ripple = (mat: THREE.Material) => {
    mat.userData.shader = null;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = waterTime;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;")
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
         diffuseColor.rgb += vec3(0.015, 0.04, 0.045) * sin(vMapUv.x * 14.0 + uTime) * sin(vMapUv.y * 11.0 - uTime * 0.75);`,
        );
      mat.userData.shader = shader;
    };
  };
  ripple(surfaces.water);
  ripple(surfaces.canal);

  const built = fontOk ? buildPosterSheets() : { sheets: [], cells: [] as CellUV[] };
  const sheets = built.sheets.map((sheet) => {
    const map = canvasTexture(sheet.canvas, true, clamp, clamp);
    textures.push(map);
    const mat = std({
      map,
      roughness: sheet.glow ? 0.45 : 0.9,
      metalness: 0.02,
      emissive: new THREE.Color(sheet.glow ? 0xfff0e8 : 0x000000),
      emissiveMap: sheet.glow ? map : null,
      emissiveIntensity: sheet.glow ? 0.7 : 0,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    return { mat, glow: sheet.glow };
  });

  const sky = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(PALETTE.skyNightTop) },
      midColor: { value: new THREE.Color(PALETTE.skyNightMid) },
      botColor: { value: new THREE.Color(PALETTE.skyNightBot) },
      sunColor: { value: new THREE.Color(PALETTE.moon) },
      sunDir: { value: new THREE.Vector3(0.2, 0.9, 0.1) },
      cloud: { value: 0.18 },
      time: { value: 0 },
      flash: { value: 0 },
      fogColor: { value: new THREE.Color(PALETTE.fogNight) },
    },
    vertexShader: `
      out vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      in vec3 vDir;
      uniform vec3 topColor;
      uniform vec3 midColor;
      uniform vec3 botColor;
      uniform vec3 sunColor;
      uniform vec3 sunDir;
      uniform float cloud;
      uniform float time;
      uniform float flash;
      uniform vec3 fogColor;
      out vec4 fragColor;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;
        vec3 col = mix(botColor, midColor, smoothstep(-0.18, 0.22, h));
        col = mix(col, topColor, smoothstep(0.05, 0.72, h));
        float n = noise(dir.xz * 3.2 + vec2(time * 0.012, 0.0));
        float n2 = noise(dir.xz * 6.4 - vec2(time * 0.018, time * 0.01));
        float puff = smoothstep(0.46, 0.82, n * 0.62 + n2 * 0.38) * smoothstep(0.02, 0.42, h);
        vec3 cloudLit = mix(midColor, vec3(1.0, 0.95, 0.88), 0.5);
        vec3 cloudShade = mix(midColor, vec3(0.22, 0.26, 0.34), 0.4);
        col = mix(col, mix(cloudShade, cloudLit, n2), clamp(cloud, 0.0, 1.0) * puff);
        vec3 sun = normalize(sunDir);
        float disc = pow(max(dot(dir, sun), 0.0), 1400.0);
        float glow = pow(max(dot(dir, sun), 0.0), 36.0);
        col += sunColor * (disc * 1.6 + glow * 0.28) * (1.0 - puff * cloud * 0.65);
        col += vec3(0.75, 0.8, 0.95) * flash * smoothstep(-0.05, 0.55, h);
        col = mix(fogColor, col, smoothstep(-0.04, 0.16, h));
        fragColor = vec4(col, 1.0);
      }
    `,
  });

  const ground = std({ color: GRADE.ground, roughness: 1, metalness: 0 });
  const pole = std({ color: 0x2a2622, roughness: 0.7, metalness: 0.2 });
  const head = std({ color: 0xffe0b8, emissive: 0xffb14a, emissiveIntensity: 0, roughness: 0.35 });
  const cable = new THREE.LineBasicMaterial({ color: 0x1a1614 });
  const tank = std({ color: 0x6e7c86, roughness: 0.55, metalness: 0.25 });
  const antenna = std({ color: 0xc5ccd0, roughness: 0.4, metalness: 0.6 });

  const levels: { shopEmit: number } = { shopEmit: GRADE.paperEmit };
  const shopMats = new Set<THREE.MeshStandardMaterial>();
  const envCache = new Map<string, THREE.Texture | null>();
  let pmrem: THREE.PMREMGenerator | null = null;
  let envKey = "";

  const envFor = (look: CityLook, key: string) => {
    if (envCache.has(key)) return envCache.get(key) ?? null;
    if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
    const probe = new THREE.Scene();
    const mat = sky.clone();
    (mat.uniforms.topColor.value as THREE.Color).setHex(look.skyTop);
    (mat.uniforms.midColor.value as THREE.Color).setHex(look.skyMid);
    (mat.uniforms.botColor.value as THREE.Color).setHex(look.skyBot);
    const sphereGeo = new THREE.SphereGeometry(12, 16, 12);
    probe.add(new THREE.Mesh(sphereGeo, mat));
    const junkGeo: THREE.BufferGeometry[] = [sphereGeo];
    const junkMat: THREE.Material[] = [mat];
    PALETTE.envCards.forEach((hex, i) => {
      const cmat = new THREE.MeshBasicMaterial({ color: hex });
      const geo = new THREE.PlaneGeometry(4.2, 1.5);
      const card = new THREE.Mesh(geo, cmat);
      const ang = (i / PALETTE.envCards.length) * Math.PI * 2;
      card.position.set(Math.cos(ang) * 7, i % 2 === 0 ? 1.1 : 0.15, Math.sin(ang) * 7);
      card.lookAt(0, 0.35, 0);
      probe.add(card);
      junkGeo.push(geo);
      junkMat.push(cmat);
    });
    try {
      const tex = pmrem.fromScene(probe, 0.04).texture;
      envCache.set(key, tex);
      for (const g of junkGeo) g.dispose();
      for (const m of junkMat) m.dispose();
      return tex;
    } catch {
      envCache.set(key, null);
      for (const g of junkGeo) g.dispose();
      for (const m of junkMat) m.dispose();
      return null;
    }
  };

  const applyLook: CityMaterials["applyLook"] = (look, scene, rend, lights, settled = true) => {
    rend.toneMappingExposure = GRADE.exposure;
    rend.setClearColor(look.clear, 1);
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.setHex(look.fog);
      scene.fog.density = look.fogDensity;
    } else if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.setHex(look.fog);
      scene.fog.near = look.fogNear;
      scene.fog.far = look.fogFar;
    }
    lights.hemi.color.setHex(look.hemiSky);
    lights.hemi.groundColor.setHex(look.hemiGround);
    lights.hemi.intensity = look.hemi;
    lights.sun.color.setHex(look.sun);
    lights.sun.intensity = look.sunI;
    lights.sun.position.set(...look.sunPos);
    lights.rim.color.setHex(PALETTE.rim);
    lights.rim.intensity = look.rimI;
    lights.rim.position.set(...look.rimPos);
    lights.fill.color.setHex(PALETTE.fill);
    lights.fill.intensity = look.fillI;
    lights.fill.position.set(...look.fillPos);
    (sky.uniforms.topColor.value as THREE.Color).setHex(look.skyTop);
    (sky.uniforms.midColor.value as THREE.Color).setHex(look.skyMid);
    (sky.uniforms.botColor.value as THREE.Color).setHex(look.skyBot);
    (sky.uniforms.fogColor.value as THREE.Color).setHex(look.fog);
    sky.uniforms.cloud.value = look.cloud;
    ground.color.setHex(GRADE.ground);
    const wet = THREE.MathUtils.clamp(look.wet, 0, 1);
    const rough = THREE.MathUtils.lerp(GRADE.road.rough, GRADE.wetRoad.rough, wet);
    const metal = THREE.MathUtils.lerp(GRADE.road.metal, GRADE.wetRoad.metal, wet);
    const envI = THREE.MathUtils.lerp(GRADE.envDry, GRADE.envWet, wet);
    const roads = [surfaces.roadMarked, surfaces.roadPlain, surfaces.bridge, surfaces.sidewalk].map(
      (m) => m as THREE.MeshStandardMaterial,
    );
    for (const road of roads) {
      const plain = road === surfaces.roadPlain;
      const walk = road === surfaces.sidewalk;
      road.roughness = walk ? Math.min(1, rough + 0.12) : plain ? rough + 0.06 : rough;
      road.metalness = walk ? metal * 0.35 : plain ? metal * 0.55 : metal;
      road.envMapIntensity = envI;
    }
    const water = surfaces.water as THREE.MeshStandardMaterial;
    const canal = surfaces.canal as THREE.MeshStandardMaterial;
    water.roughness = THREE.MathUtils.lerp(GRADE.waterRough, GRADE.wetWaterRough, wet);
    water.metalness = THREE.MathUtils.lerp(0.16, 0.32, wet);
    water.envMapIntensity = envI;
    canal.roughness = water.roughness;
    canal.metalness = water.metalness;
    canal.envMapIntensity = envI;
    const len = Math.hypot(look.sunPos[0], look.sunPos[1], look.sunPos[2]) || 1;
    (sky.uniforms.sunDir.value as THREE.Vector3).set(look.sunPos[0] / len, look.sunPos[1] / len, look.sunPos[2] / len);
    (sky.uniforms.sunColor.value as THREE.Color).setHex(look.sun);
    for (const facade of surfaces.facades) (facade as THREE.MeshStandardMaterial).emissiveIntensity = look.facadeEmit;
    for (const sheet of sheets) sheet.mat.emissiveIntensity = sheet.glow ? look.bannerEmit : GRADE.paperEmit;
    for (const shop of shopMats) shop.emissiveIntensity = look.shopEmit;
    levels.shopEmit = look.shopEmit;
    head.emissiveIntensity = look.lamp;
    (surfaces.landmark as THREE.MeshStandardMaterial).emissiveIntensity = Math.min(0.45, look.lamp * 0.22);
    const key = look.lamp < 0.5 ? "bright" : "dark";
    if (settled && key !== envKey) {
      const tex = envFor(look, key);
      if (tex) scene.environment = tex;
      envKey = key;
    }
  };

  const setQuality = (quality: "low" | "high") => {
    cable.color.setHex(quality === "high" ? 0x1a1614 : 0x2a2622);
    const amp = quality === "high" ? 1 : 0.2;
    for (const mat of normalMats) {
      const base = (mat.userData.normalAmp as number) || 0.4;
      mat.normalScale.set(base * amp, base * amp);
    }
    const aniso = quality === "high" ? 8 : 1;
    for (const tex of textures) tex.anisotropy = aniso;
  };

  let skyTime = 0;
  const tick = (dt: number, lightning: number) => {
    skyTime += dt;
    waterTime.value = skyTime;
    sky.uniforms.time.value = skyTime;
    sky.uniforms.flash.value = lightning;
  };

  const dispose = () => {
    for (const tex of textures) tex.dispose();
    for (const mat of Object.values(surfaces)) {
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
    for (const sheet of sheets) sheet.mat.dispose();
    for (const shop of shopMats) shop.dispose();
    sky.dispose();
    ground.dispose();
    pole.dispose();
    head.dispose();
    cable.dispose();
    tank.dispose();
    antenna.dispose();
    for (const tex of envCache.values()) tex?.dispose();
    pmrem?.dispose();
  };

  envFor(LOOKS.day, "bright");
  envFor(LOOKS.neon, "dark");

  return {
    surfaces,
    sheets,
    cells: built.cells,
    pole,
    head,
    cable,
    tank,
    antenna,
    sky,
    ground,
    fontOk,
    levels,
    trackShop: (mat) => shopMats.add(mat),
    untrackShop: (mat) => shopMats.delete(mat),
    applyLook,
    setQuality,
    tick,
    dispose,
  };
}
