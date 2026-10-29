import * as THREE from "three";

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function noise2(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function vnoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = noise2(x0, y0);
  const b = noise2(x0 + 1, y0);
  const c = noise2(x0, y0 + 1);
  const d = noise2(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(x: number, y: number): number {
  return vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;
}

function stain(ctx: CanvasRenderingContext2D, w: number, h: number, amt: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm(x / 48, y / 48);
      const grit = noise2(x * 0.37, y * 0.37);
      const k = 1 - amt + n * amt * 0.85 + (grit - 0.5) * amt * 0.25;
      const i = (y * w + x) * 4;
      d[i] = Math.max(0, Math.min(255, d[i] * k));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * k));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * k));
    }
  }
  ctx.putImageData(img, 0, 0);
}

export type MapSet = {
  color: HTMLCanvasElement;
  rough: HTMLCanvasElement;
  normal: HTMLCanvasElement;
};

function gray(ctx: CanvasRenderingContext2D, hex: string, w: number, h: number) {
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, w, h);
}

/** Marked roads keep edge lines and a worn centre dash. Plain alleys stay patched. */
export function makeAsphalt(marked: boolean): MapSet {
  const w = 512;
  const h = 512;
  const color = canvas(w, h);
  const rough = canvas(w, h);
  const ctx = color.getContext("2d");
  const rx = rough.getContext("2d");
  if (!ctx || !rx) return { color, rough, normal: color };
  ctx.fillStyle = marked ? "#2a2e33" : "#34322e";
  ctx.fillRect(0, 0, w, h);
  gray(rx, "#b4b4b4", w, h);
  ctx.fillStyle = "rgba(92, 84, 74, 0.45)";
  for (let i = 0; i < 9; i++) {
    const x = (i * 83) % 430;
    const y = (i * 120) % 420;
    const pw = 54 + (i % 4) * 22;
    const ph = 28 + (i % 3) * 10;
    ctx.fillRect(x, y, pw, ph);
    rx.fillStyle = i % 2 === 0 ? "#8a8a8a" : "#d0d0d0";
    rx.fillRect(x, y, pw, ph);
  }
  ctx.fillStyle = "rgba(18, 16, 16, 0.55)";
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(70 + i * 90, 80 + (i % 3) * 140, 26 + (i % 2) * 10, 14, 0.4, 0, Math.PI * 2);
    ctx.fill();
    rx.fillStyle = "#3a3a3a";
    rx.beginPath();
    rx.ellipse(70 + i * 90, 80 + (i % 3) * 140, 22, 10, 0.4, 0, Math.PI * 2);
    rx.fill();
  }
  stain(ctx, w, h, 0.34);
  ctx.strokeStyle = "rgba(8, 8, 10, 0.7)";
  ctx.lineWidth = 2;
  for (let k = 0; k < 8; k++) {
    ctx.beginPath();
    let x = (k * 70) % w;
    let y = 0;
    ctx.moveTo(x, y);
    for (let s = 0; s < 7; s++) {
      x += Math.sin(k * 2.2 + s) * 16;
      y += 72;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  if (marked) {
    ctx.fillStyle = "#e6e2d6";
    ctx.fillRect(10, 0, 7, h);
    ctx.fillRect(w - 17, 0, 7, h);
    ctx.fillStyle = "#d2b15a";
    for (let y = 10; y < h; y += 72) ctx.fillRect(w / 2 - 5, y, 10, 26);
    rx.fillStyle = "#ececec";
    rx.fillRect(10, 0, 8, h);
    rx.fillRect(w - 18, 0, 8, h);
  }
  return { color, rough, normal: heightToNormal(color, 1.15) };
}

export function makeBallast(): HTMLCanvasElement {
  const c = canvas(256, 256);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#6a645c";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) {
    const x = (i * 47) % 256;
    const y = (i * 83) % 256;
    const g = 70 + (i % 5) * 18;
    ctx.fillStyle = `rgb(${g - 8},${g - 6},${g - 12})`;
    ctx.fillRect(x, y, 2 + (i % 3), 2 + ((i * 3) % 3));
  }
  stain(ctx, 256, 256, 0.22);
  return c;
}

export function makeConcreteMaps(tint: string): MapSet {
  const w = 512;
  const h = 512;
  const color = canvas(w, h);
  const rough = canvas(w, h);
  const ctx = color.getContext("2d");
  const rx = rough.getContext("2d");
  if (!ctx || !rx) return { color, rough, normal: color };
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, w, h);
  gray(rx, "#cfcfcf", w, h);
  ctx.strokeStyle = "rgba(40, 36, 32, 0.4)";
  ctx.lineWidth = 3;
  for (let y = 0; y < h; y += 128) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(120, 100, 80, 0.2)";
  ctx.fillRect(40, 60, 90, 48);
  ctx.fillRect(300, 280, 120, 36);
  stain(ctx, w, h, 0.32);
  return { color, rough, normal: heightToNormal(color, 1.3) };
}

/** Slab walk with a worn curb stripe and one drain. */
export function makeSidewalk(): MapSet {
  const w = 512;
  const h = 512;
  const color = canvas(w, h);
  const rough = canvas(w, h);
  const ctx = color.getContext("2d");
  const rx = rough.getContext("2d");
  if (!ctx || !rx) return { color, rough, normal: color };
  ctx.fillStyle = "#b7aa96";
  ctx.fillRect(0, 0, w, h);
  gray(rx, "#d2d2d2", w, h);
  ctx.strokeStyle = "rgba(60, 52, 44, 0.45)";
  ctx.lineWidth = 4;
  for (let y = 0; y < h; y += 96) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(w * 0.5, 0);
  ctx.lineTo(w * 0.5, h);
  ctx.stroke();
  ctx.fillStyle = "#2c2a26";
  ctx.fillRect(0, 0, 22, h);
  ctx.fillStyle = "#c2ae62";
  for (let y = 0; y < h; y += 28) ctx.fillRect(0, y, 22, 14);
  ctx.fillStyle = "#3a3e42";
  ctx.beginPath();
  ctx.arc(w * 0.72, h * 0.4, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#6a7074";
  ctx.lineWidth = 3;
  ctx.stroke();
  stain(ctx, w, h, 0.28);
  return { color, rough, normal: heightToNormal(color, 1.4) };
}

export function makeRoof(): MapSet {
  const maps = makeConcreteMaps("#8d8072");
  const ctx = maps.color.getContext("2d");
  if (!ctx) return maps;
  ctx.fillStyle = "rgba(40, 36, 32, 0.35)";
  ctx.fillRect(0, 0, 512, 10);
  ctx.fillStyle = "rgba(90, 70, 50, 0.28)";
  ctx.beginPath();
  ctx.ellipse(180, 220, 70, 28, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(30, 28, 26, 0.55)";
  ctx.strokeRect(300, 80, 90, 70);
  return maps;
}

export function makeBark(): MapSet {
  const w = 256;
  const h = 256;
  const color = canvas(w, h);
  const rough = canvas(w, h);
  const ctx = color.getContext("2d");
  const rx = rough.getContext("2d");
  if (!ctx || !rx) return { color, rough, normal: color };
  ctx.fillStyle = "#5c4636";
  ctx.fillRect(0, 0, w, h);
  gray(rx, "#e0e0e0", w, h);
  ctx.strokeStyle = "rgba(30, 18, 12, 0.65)";
  ctx.lineWidth = 2;
  for (let x = 8; x < w; x += 18) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 6, 60, x - 8, 140, x + 2, h);
    ctx.stroke();
  }
  stain(ctx, w, h, 0.35);
  return { color, rough, normal: heightToNormal(color, 1.8) };
}

/** Near-white mottling so instance colors stay in charge. */
export function makeCanopy(): HTMLCanvasElement {
  const c = canvas(128, 128);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#f2f2f0";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = "rgba(40, 60, 30, 0.18)";
  for (let i = 0; i < 18; i++) ctx.fillRect((i * 37) % 110, (i * 19) % 110, 16, 10);
  return c;
}

const AWN = ["#8d3a3a", "#c4a15a", "#2f5c48", "#5c4638", "#3d4e62"];

function paintShopBand(
  ctx: CanvasRenderingContext2D,
  ex: CanvasRenderingContext2D,
  rx: CanvasRenderingContext2D,
  hx: CanvasRenderingContext2D,
  y0: number,
  y1: number,
  kind: number,
) {
  const w = ctx.canvas.width;
  const bays = 4;
  const bw = w / bays;
  const hh = Math.max(8, y1 - y0);
  for (let b = 0; b < bays; b++) {
    const x0 = b * bw;
    const awning = AWN[(b + kind) % AWN.length];
    ctx.fillStyle = awning;
    const ah = Math.max(8, hh * 0.16);
    ctx.fillRect(x0 + 6, y0 + 6, bw - 12, ah);
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fillRect(x0 + 10, y0 + 6 + ah, bw - 20, 5);
    const shutter = kind === 2 ? (b + kind) % 5 === 0 : (b + kind) % 3 === 0;
    if (shutter) {
      ctx.fillStyle = "#4c545a";
      for (let sy = y0 + hh * 0.3; sy < y1 - 6; sy += 7) ctx.fillRect(x0 + 16, sy, bw - 32, 4);
      rx.fillStyle = "#9a9a9a";
      rx.fillRect(x0 + 16, y0 + hh * 0.3, bw - 32, hh * 0.55);
    } else {
      ctx.fillStyle = "#140e0c";
      ctx.fillRect(x0 + 12, y0 + hh * 0.28, bw - 24, hh * 0.64);
      const lit = (b * 3 + kind) % 5 !== 1;
      const glass = lit ? "#c9a36a" : "#1c242c";
      ctx.fillStyle = glass;
      ctx.fillRect(x0 + 18, y0 + hh * 0.34, bw - 36, hh * 0.5);
      if (lit) {
        ex.fillStyle = "#e8c49a";
        ex.fillRect(x0 + 18, y0 + hh * 0.34, bw - 36, hh * 0.5);
        ex.fillStyle = "#fff1dc";
        ex.fillRect(x0 + 22, y0 + hh * 0.36, bw - 44, 3);
      }
      rx.fillStyle = "#2c2c2c";
      rx.fillRect(x0 + 18, y0 + hh * 0.34, bw - 36, hh * 0.5);
      hx.fillStyle = "#4a4a4a";
      hx.fillRect(x0 + 18, y0 + hh * 0.34, bw - 36, hh * 0.5);
      ctx.strokeStyle = "rgba(90, 50, 24, 0.55)";
      ctx.lineWidth = 2;
      ctx.strokeRect(x0 + 26, y0 + hh * 0.42, bw - 52, hh * 0.1);
      ctx.strokeRect(x0 + 26, y0 + hh * 0.56, bw - 52, hh * 0.1);
    }
    ctx.fillStyle = "rgba(20, 16, 14, 0.55)";
    ctx.fillRect(x0 + 8, y1 - 8, bw - 16, 6);
  }
}

function paintFloorBand(
  ctx: CanvasRenderingContext2D,
  ex: CanvasRenderingContext2D,
  rx: CanvasRenderingContext2D,
  hx: CanvasRenderingContext2D,
  y0: number,
  y1: number,
  kind: number,
) {
  const w = ctx.canvas.width;
  const bays = kind === 4 ? 2 : 2;
  const bw = w / bays;
  const hh = Math.max(8, y1 - y0);
  ctx.fillStyle = "rgba(28, 24, 20, 0.72)";
  ctx.fillRect(0, y1 - 16, w, 12);
  hx.fillStyle = "#c8c8c8";
  hx.fillRect(0, y1 - 16, w, 6);
  for (let b = 0; b < bays; b++) {
    const x0 = b * bw;
    const lit = (b * 5 + kind * 3) % 4 !== 0;
    const wx = x0 + bw * 0.16;
    const wy = y0 + hh * 0.1;
    const ww = bw * 0.66;
    const wh = hh * 0.64;
    ctx.fillStyle = "#100e0c";
    ctx.fillRect(wx - 6, wy - 6, ww + 12, wh + 12);
    ctx.fillStyle = lit ? "#6f8ea3" : "#12181c";
    ctx.fillRect(wx, wy, ww, wh);
    if (lit && (b + kind) % 3 === 0) {
      ex.fillStyle = "#e7c49a";
      ex.fillRect(wx + 2, wy + 2, ww - 4, wh * 0.45);
    }
    rx.fillStyle = "#343434";
    rx.fillRect(wx, wy, ww, wh);
    hx.fillStyle = "#555";
    hx.fillRect(wx, wy, ww, wh);
    ctx.strokeStyle = "rgba(10, 8, 8, 0.85)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(wx, wy + wh * 0.5);
    ctx.lineTo(wx + ww, wy + wh * 0.5);
    ctx.moveTo(wx + ww * 0.33, wy);
    ctx.lineTo(wx + ww * 0.33, wy + wh);
    ctx.moveTo(wx + ww * 0.66, wy);
    ctx.lineTo(wx + ww * 0.66, wy + wh);
    ctx.stroke();
    if ((b + kind) % 2 === 0) {
      ctx.fillStyle = "#c8c2b6";
      ctx.fillRect(wx + ww + 2, wy + 2, 8, 12);
      hx.fillStyle = "#c8c8c8";
      hx.fillRect(wx + ww + 2, wy + 2, 8, 12);
    }
  }
}

/**
 * One tile: bottom 30% is a shopfront band, the top 70% is a single floor that repeats up the wall.
 * Kinds: 0 stained plaster, 1 faded paint, 2 commercial glass, 3 brick, 4 corrugated tin.
 */
export function makeFacade(kind: number): { color: HTMLCanvasElement; emit: HTMLCanvasElement; rough: HTMLCanvasElement; normal: HTMLCanvasElement } {
  const w = 512;
  const h = 512;
  const color = canvas(w, h);
  const emit = canvas(w, h);
  const rough = canvas(w, h);
  const height = canvas(w, h);
  const ctx = color.getContext("2d");
  const ex = emit.getContext("2d");
  const rx = rough.getContext("2d");
  const hx = height.getContext("2d");
  if (!ctx || !ex || !rx || !hx) return { color, emit, rough, normal: color };
  const bases = ["#9a948a", "#8d7d6c", "#8e8c86", "#6a4034", "#4e5854"];
  ctx.fillStyle = bases[kind] || bases[0];
  ctx.fillRect(0, 0, w, h);
  ex.fillStyle = "#000";
  ex.fillRect(0, 0, w, h);
  gray(rx, kind === 4 ? "#6e6e6e" : "#c6c6c6", w, h);
  gray(hx, "#808080", w, h);

  if (kind === 3) {
    for (let y = 0; y < h; y += 18) {
      const off = Math.floor(y / 18) % 2 === 0 ? 0 : 18;
      for (let x = -18; x < w; x += 40) {
        ctx.fillStyle = (x + y) % 70 < 28 ? "#6e4034" : "#8a5644";
        ctx.fillRect(x + off, y, 36, 15);
      }
    }
  } else if (kind === 4) {
    for (let y = 0; y < h; y += 8) {
      ctx.fillStyle = Math.floor(y / 8) % 2 === 0 ? "#5e6864" : "#7a8480";
      ctx.fillRect(0, y, w, 5);
    }
    ctx.fillStyle = "rgba(140, 64, 32, 0.4)";
    ctx.fillRect(36, 0, 18, h);
    ctx.fillRect(310, 20, 22, h);
    const img = hx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const rib = Math.sin(x * 0.55) * 58 + 128;
        const i = (y * w + x) * 4;
        d[i] = rib;
        d[i + 1] = rib;
        d[i + 2] = rib;
      }
    }
    hx.putImageData(img, 0, 0);
  } else {
    ctx.fillStyle = "rgba(80, 60, 40, 0.16)";
    for (let i = 0; i < 4; i++) ctx.fillRect((i * 110 + kind * 24) % (w - 16), 0, 12, h);
    ctx.fillStyle = "rgba(236, 226, 206, 0.38)";
    ctx.fillRect(48 + kind * 20, 70, 86, 40);
    ctx.fillRect(280, 300, 70, 28);
    ctx.strokeStyle = "rgba(40, 36, 32, 0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(24, 160);
    ctx.bezierCurveTo(90, 120, 140, 210, 210, 150);
    ctx.stroke();
  }

  const shopCanvasTop = Math.floor(h * 0.7);
  paintFloorBand(ctx, ex, rx, hx, 8, shopCanvasTop - 8, kind);
  paintShopBand(ctx, ex, rx, hx, shopCanvasTop, h - 2, kind);
  stain(ctx, w, h, kind === 4 ? 0.22 : 0.2);
  if (kind < 3) {
    ctx.strokeStyle = "rgba(28, 36, 30, 0.28)";
    ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const x = 36 + i * 78;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + (i % 2 === 0 ? 8 : -6), h);
      ctx.stroke();
    }
  }
  return { color, emit, rough, normal: heightToNormal(height, kind === 4 ? 2.4 : 1.6) };
}

export function makePark(): HTMLCanvasElement {
  const c = canvas(256, 256);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#3a5640";
  ctx.fillRect(0, 0, 256, 256);
  stain(ctx, 256, 256, 0.35);
  ctx.fillStyle = "rgba(110, 200, 120, 0.5)";
  for (let i = 0; i < 30; i++) ctx.fillRect((i * 47) % 240, (i * 83) % 230, 18, 12);
  ctx.fillStyle = "rgba(92, 74, 48, 0.35)";
  ctx.fillRect(20, 180, 70, 24);
  return c;
}

export function makeWater(): HTMLCanvasElement {
  const c = canvas(256, 256);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = "#1c3e4a";
  ctx.fillRect(0, 0, 256, 256);
  const grd = ctx.createLinearGradient(0, 0, 256, 256);
  grd.addColorStop(0, "rgba(80, 90, 70, 0.08)");
  grd.addColorStop(0.5, "rgba(40, 90, 110, 0.1)");
  grd.addColorStop(1, "rgba(160, 140, 90, 0.05)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(120, 200, 210, 0.28)";
  ctx.lineWidth = 2;
  for (let y = 8; y < 256; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.08 + y) * 3);
    ctx.stroke();
  }
  return c;
}

export function heightToNormal(src: HTMLCanvasElement, strength = 2.2): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const sctx = src.getContext("2d");
  const out = canvas(w, h);
  const octx = out.getContext("2d");
  if (!sctx || !octx) return out;
  const data = sctx.getImageData(0, 0, w, h).data;
  const img = octx.createImageData(w, h);
  const at = (x: number, y: number) => {
    const xx = (x + w) % w;
    const yy = (y + h) % h;
    const i = (yy * w + xx) * 4;
    return (data[i] + data[i + 1] + data[i + 2]) / (255 * 3);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const nx = -dx;
      const ny = -dy;
      const nz = 1;
      const l = Math.hypot(nx, ny, nz) || 1;
      const i = (y * w + x) * 4;
      img.data[i] = (nx / l) * 0.5 + 0.5;
      img.data[i] = img.data[i] * 255;
      img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

export function canvasTexture(source: HTMLCanvasElement, colorMap: boolean, wrapS: THREE.Wrapping, wrapT: THREE.Wrapping): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(source);
  tex.colorSpace = colorMap ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = wrapS;
  tex.wrapT = wrapT;
  tex.anisotropy = 4;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
