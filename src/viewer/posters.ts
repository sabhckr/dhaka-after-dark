import { POSTER_SPECS, type PosterSpec } from "@/viewer/copy.ts";

export type CellUV = { u0: number; v0: number; u1: number; v1: number; sheet: number };

const TONE: Record<PosterSpec["tone"], [string, string, string]> = {
  pink: ["#2a1020", "#ff4d8d", "#ffd6e6"],
  cyan: ["#062028", "#3de0e0", "#dffcff"],
  amber: ["#2a1608", "#ffb020", "#ffe3b0"],
  paper: ["#d7c4a2", "#5c4030", "#1c140e"],
  indigo: ["#140820", "#b08cff", "#f4ecff"],
  rust: ["#2a100c", "#e85d3a", "#ffd4c4"],
};

function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (cur && ctx.measureText(next).width > maxW) {
      lines.push(cur);
      cur = word;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [text];
}

function fitLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxH: number, weight: number): { size: number; lines: string[] } {
  let size = Math.min(92, Math.floor(maxH));
  let lines = [text];
  while (size >= 18) {
    ctx.font = `${weight} ${size}px "Noto Sans Bengali"`;
    lines = wrap(ctx, text, maxW);
    const widest = Math.max(...lines.map((ln) => ctx.measureText(ln).width));
    if (widest <= maxW && lines.length * size * 1.15 <= maxH) return { size, lines };
    size -= 2;
  }
  ctx.font = `700 18px "Noto Sans Bengali"`;
  return { size: 18, lines: wrap(ctx, text, maxW).slice(0, Math.max(1, Math.floor(maxH / 20))) };
}

function tears(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) {
  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000";
  for (let i = 0; i < 5; i++) {
    const edge = rnd();
    ctx.beginPath();
    if (edge < 0.5) {
      ctx.moveTo(0, rnd() * h);
      ctx.lineTo(18 + rnd() * 28, rnd() * h);
      ctx.lineTo(0, rnd() * h);
    } else {
      ctx.moveTo(w, rnd() * h);
      ctx.lineTo(w - 18 - rnd() * 24, rnd() * h);
      ctx.lineTo(w, rnd() * h);
    }
    ctx.fill();
  }
  ctx.restore();
}

function grime(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) {
  ctx.save();
  for (let i = 0; i < 28; i++) {
    ctx.globalAlpha = 0.08 + rnd() * 0.14;
    ctx.fillStyle = rnd() > 0.5 ? "#2a1c12" : "#f3ead6";
    ctx.fillRect(rnd() * w, rnd() * h, 6 + rnd() * 36, 2 + rnd() * 8);
  }
  ctx.restore();
}

function tape(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, rot: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "rgba(226, 206, 140, 0.62)";
  ctx.fillRect(-len / 2, -7, len, 14);
  ctx.restore();
}

function skyline(ctx: CanvasRenderingContext2D, w: number, h: number, ink: string, rnd: () => number) {
  ctx.fillStyle = ink;
  for (let i = 0; i < 7; i++) {
    const bh = 28 + rnd() * (h * 0.28);
    ctx.fillRect(12 + i * ((w - 24) / 7), h * 0.46 - bh, (w - 40) / 7, bh);
  }
}

function silhouette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#140c10";
  ctx.beginPath();
  ctx.arc(w * 0.46, h * 0.22, Math.min(26, w * 0.05), 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.34, h * 0.48);
  ctx.lineTo(w * 0.58, h * 0.48);
  ctx.lineTo(w * 0.7, h * 0.3);
  ctx.lineTo(w * 0.48, h * 0.27);
  ctx.lineTo(w * 0.28, h * 0.36);
  ctx.fill();
}

export function paintSpec(ctx: CanvasRenderingContext2D, w: number, h: number, spec: PosterSpec) {
  const [bg, accent, ink] = TONE[spec.tone];
  const rnd = rng(seedOf(spec.id));
  const paper = spec.layout === "poster" && !spec.glow;
  ctx.fillStyle = paper ? "#d9c7a4" : bg;
  ctx.fillRect(0, 0, w, h);
  if (!paper) {
    const wash = ctx.createLinearGradient(0, 0, w, h);
    wash.addColorStop(0, accent);
    wash.addColorStop(1, bg);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
  if (spec.kind === "movie" || spec.kind === "politics") {
    skyline(ctx, w, h, paper ? "#3a2418" : accent, rnd);
    if (spec.kind === "movie") silhouette(ctx, w, h);
    else {
      ctx.strokeStyle = paper ? "#6a2030" : accent;
      ctx.lineWidth = 5;
      const cx = w * 0.5;
      const cy = h * 0.2;
      ctx.strokeRect(cx - 22, cy - 16, 44, 34);
      ctx.beginPath();
      ctx.moveTo(cx, cy - 16);
      ctx.lineTo(cx, cy - 30);
      ctx.stroke();
    }
  } else if (!paper) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(42, h * 0.28, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(58, h * 0.34, 10, -0.4, 1.2);
    ctx.stroke();
  }
  const titleColor = paper ? "#1a100c" : ink;
  const block = fitLines(ctx, spec.title, w - 40, paper ? h * 0.3 : h * 0.5, spec.layout === "poster" ? 900 : 700);
  ctx.fillStyle = titleColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const top = paper ? h * 0.62 : h * 0.46;
  block.lines.forEach((ln, i) => {
    ctx.font = `${spec.layout === "poster" ? 900 : 700} ${block.size}px "Noto Sans Bengali"`;
    ctx.fillText(ln, w / 2, top + (i - (block.lines.length - 1) / 2) * block.size * 1.12);
  });
  if (spec.lines && paper) {
    ctx.font = `700 ${Math.max(16, Math.floor(w / 22))}px "Noto Sans Bengali"`;
    ctx.fillStyle = "#24160f";
    spec.lines.slice(0, 2).forEach((ln, i) => ctx.fillText(ln, w / 2, h * 0.78 + i * 26));
  }
  if (spec.sub) {
    ctx.font = `700 ${Math.max(15, Math.floor(w / 30))}px "Noto Sans Bengali"`;
    ctx.fillStyle = paper ? "#6a4030" : accent;
    ctx.fillText(spec.sub, w / 2, h - 26);
  }
  ctx.strokeStyle = paper ? "#6a4030" : accent;
  ctx.lineWidth = paper ? 10 : 6;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  if (!paper) {
    ctx.strokeStyle = ink;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, w - 32, h - 32);
    ctx.globalAlpha = 1;
  }
  tape(ctx, 36, 18, 54, -0.4);
  tape(ctx, w - 30, 16, 48, 0.35);
  grime(ctx, w, h, rnd);
  tears(ctx, w, h, rng(seedOf(spec.id) ^ 99));
}

export type PosterSheet = {
  canvas: HTMLCanvasElement;
  glow: boolean;
  cells: CellUV[];
};

/** Pack every fictional spec into banner sheets and poster sheets. Cell index matches POSTER_SPECS. */
export function buildPosterSheets(): { sheets: PosterSheet[]; cells: CellUV[] } {
  const banners = POSTER_SPECS.map((spec, index) => ({ spec, index })).filter((row) => row.spec.layout === "banner");
  const posters = POSTER_SPECS.map((spec, index) => ({ spec, index })).filter((row) => row.spec.layout === "poster");
  const sheets: PosterSheet[] = [];
  const cells: CellUV[] = new Array(POSTER_SPECS.length);

  const pack = (rows: { spec: PosterSpec; index: number }[], cols: number, cw: number, ch: number, glow: boolean) => {
    const rowsN = Math.max(1, Math.ceil(rows.length / cols));
    const canvas = document.createElement("canvas");
    canvas.width = cols * cw;
    canvas.height = rowsN * ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const sheet = sheets.length;
    rows.forEach((row, i) => {
      const col = i % cols;
      const r = Math.floor(i / cols);
      ctx.save();
      ctx.beginPath();
      ctx.rect(col * cw, r * ch, cw, ch);
      ctx.clip();
      ctx.translate(col * cw, r * ch);
      paintSpec(ctx, cw, ch, row.spec);
      ctx.restore();
      const uv: CellUV = {
        sheet,
        u0: col / cols,
        u1: (col + 1) / cols,
        v1: 1 - r / rowsN,
        v0: 1 - (r + 1) / rowsN,
      };
      cells[row.index] = uv;
    });
    sheets.push({ canvas, glow, cells: cells.filter((c) => c && c.sheet === sheet) });
  };

  pack(banners, 4, 640, 256, true);
  pack(posters, 3, 420, 640, false);
  return { sheets, cells };
}

export function paintShopAtlas(items: { text: string; category: string }[]): { canvas: HTMLCanvasElement; uvs: CellUV[] } | null {
  if (!items.length) return null;
  const cols = 4;
  const rows = Math.ceil(items.length / cols);
  const cw = 512;
  const ch = 192;
  const canvas = document.createElement("canvas");
  canvas.width = cols * cw;
  canvas.height = rows * ch;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const uvs: CellUV[] = [];
  items.forEach((item, i) => {
    const col = i % cols;
    const r = Math.floor(i / cols);
    const x = col * cw;
    const y = r * ch;
    ctx.fillStyle = i % 2 === 0 ? "#2a1812" : "#102028";
    ctx.fillRect(x, y, cw, ch);
    const accent = i % 3 === 0 ? "#ff4d8d" : i % 3 === 1 ? "#3de0e0" : "#ffb020";
    ctx.fillStyle = accent;
    ctx.fillRect(x, y, 10, ch);
    ctx.fillRect(x, y + ch - 14, cw, 14);
    for (let b = 0; b < 7; b++) {
      ctx.beginPath();
      ctx.arc(x + 36 + b * 28, y + 18, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    const fitted = fitLines(ctx, item.text, cw - 48, ch - 78, 700);
    ctx.fillStyle = "#fff6e8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitted.lines.forEach((ln, li) => {
      ctx.font = `700 ${fitted.size}px "Noto Sans Bengali"`;
      ctx.fillText(ln, x + cw / 2, y + 36 + ch * 0.28 + (li - (fitted.lines.length - 1) / 2) * fitted.size * 1.05);
    });
    ctx.font = `700 20px "Noto Sans Bengali"`;
    ctx.fillStyle = "#e7d3b0";
    ctx.fillText(item.category, x + cw / 2, y + ch - 34);
    uvs.push({
      sheet: 0,
      u0: col / cols,
      u1: (col + 1) / cols,
      v1: 1 - r / rows,
      v0: 1 - (r + 1) / rows,
    });
  });
  return { canvas, uvs };
}

/** True when the loaded face actually paints Bengali ink, including a conjunct. */
export function banglaHasInk(): boolean {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 80;
  const ctx = c.getContext("2d");
  if (!ctx) return false;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "#fff";
  ctx.font = `700 42px "Noto Sans Bengali"`;
  ctx.textBaseline = "middle";
  ctx.fillText("ক্ষ ইচ্ছা থাকবে", 8, 40);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let ink = 0;
  for (let i = 0; i < data.length; i += 16) if (data[i] > 80) ink++;
  return ink > 30;
}
