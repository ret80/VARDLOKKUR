/* tiles.ts — Вся процедурная генерация тайловых текстур.
   Не знает про Engine, не хранит игровое состояние.
   Принимает WorldData + параметры → возвращает текстуры/спрайты. */

import { Application, Sprite, Texture } from "pixi.js";
import { T, Tl, WorldData } from "./world";

/* ================== типы ================== */

export const TILE_COLORS: Record<number, string> = {
  [Tl.WATER]: "#0a1620", [Tl.SHORE]: "#4a5a64", [Tl.SNOW]: "#8b98a6", [Tl.SNOW2]: "#7e8b99",
  [Tl.PATH]: "#55636e", [Tl.FOREST]: "#26333c", [Tl.TREE]: "#1c262e", [Tl.ROCK]: "#515d6a",
  [Tl.MTN]: "#5f6b78", [Tl.SWAMP]: "#2c3a3e", [Tl.POOL]: "#1b2a30", [Tl.VILLAGE]: "#635a4c",
  [Tl.PALISADE]: "#463626", [Tl.HOUSE]: "#3a322c", [Tl.RUINS]: "#4e5a68", [Tl.COLUMN]: "#5a6570",
  [Tl.CAVE]: "#2b3646", [Tl.CAVEWALL]: "#1a222c", [Tl.STAIRS]: "#39424e", [Tl.DFLOOR]: "#39424e",
  [Tl.DWALL]: "#10151c", [Tl.ALTAR]: "#39424e",
};

export interface HouseMetrics {
  mode: "side" | "front" | "two";
  wallW: number;
  footH: number;
  wallH: number;
  roofH: number;
  topPad: number;
  ridgeLen: number;
  marginX: number;
  foundH: number;
  wallTop: number;
  canvasW: number;
  canvasH: number;
}

export interface HouseSpriteEntry {
  spr: Sprite;
  hw: number;
  hh: number;
  v: number;
  ruined: boolean;
}

export interface TileBuildResult {
  groundTexture: Texture;
  wallSprites: (Sprite | import("pixi.js").Graphics)[];
  houseSprites: HouseSpriteEntry[];
  wallCache: WallTextureCache;
  houseCache: HouseTextureCache;
}

/* ================== хелперы ================== */

const rnd = (x: number, y: number, s: number) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

const dither = (ctx: CanvasRenderingContext2D, x: number, y: number, base: string, dark: string, light: string) => {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, T, T);
  for (let i = 0; i < 6; i++) {
    const px = x + Math.floor(rnd(x, y, i) * T);
    const py = y + Math.floor(rnd(y, x, i + 9) * T);
    ctx.fillStyle = i % 2 ? dark : light;
    ctx.fillRect(px, py, 1, 1);
  }
};

/* ================== houseMetrics ================== */

export function houseMetrics(hw: number, hh: number): HouseMetrics {
  const wallW = hw * T, footH = hh * T;
  const marginX = 12, foundH = 3, bottomPad = 3;
  const mode: "side" | "front" | "two" =
    hw >= 3 && hh >= 3 ? "two" : hw > hh ? "side" : "front";
  let wallH: number, roofH: number, topPad: number, ridgeLen = 0;
  if (mode === "side")      { wallH = 18; roofH = 22; topPad = 8; }
  else if (mode === "two")  { wallH = 37; roofH = 24; topPad = 8; }
  else { ridgeLen = hh > hw ? 14 : 6; wallH = hh > hw ? 24 : 20; roofH = 18; topPad = ridgeLen + 8; }
  const wallTop = topPad + roofH;
  return { mode, wallW, footH, wallH, roofH, topPad, ridgeLen, marginX, foundH, wallTop,
           canvasW: wallW + marginX * 2, canvasH: wallTop + wallH + foundH + bottomPad };
}

/* ================== paintWall ================== */

export function paintWall(ctx: CanvasRenderingContext2D, t: number, v: number, dungeonId: number) {
  const ox = 8, oy = 20;
  const P = (x: number, y: number, w: number, h: number, c: number, a = 1) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = "#" + c.toString(16).padStart(6, "0");
    ctx.fillRect(x + ox, y + oy, w, h);
  };
  switch (t) {
    case Tl.TREE: {
  // зеркало для разнообразия (v & 2), ширины всегда > 0
  const MX = (x: number, w: number) => (v & 2 ? 16 - x - w : x);
  if (v & 1) {
    // ===== ЕЛЬ (снег комками, как в утверждённом SVG) =====
    P(MX(7, 3), 4, 3, 12, 0x241d14); P(MX(7, 1), 4, 1, 12, 0x2f2618);
    // ярус 1
    P(MX(3, 11), 2, 11, 3, 0x1d2b22);
    P(MX(4, 3), 2, 3, 1, 0xc8d3dc); P(MX(9, 2), 2, 2, 1, 0xc8d3dc);
    P(MX(12, 1), 3, 1, 1, 0xc8d3dc); P(MX(3, 1), 4, 1, 1, 0xc8d3dc);
    // ярус 2
    P(MX(4, 9), -2, 9, 3, 0x24352a);
    P(MX(6, 2), -2, 2, 1, 0xc8d3dc); P(MX(9, 2), -2, 2, 1, 0xc8d3dc);
    P(MX(4, 1), -1, 1, 1, 0xc8d3dc);
    // ярус 3
    P(MX(5, 7), -6, 7, 3, 0x1d2b22);
    P(MX(5, 1), -6, 1, 1, 0xc8d3dc); P(MX(7, 2), -6, 2, 1, 0xc8d3dc);
    P(MX(10, 1), -5, 1, 1, 0xc8d3dc);
    // ярус 4
    P(MX(6, 5), -10, 5, 3, 0x24352a);
    P(MX(7, 2), -10, 2, 1, 0xc8d3dc); P(MX(9, 1), -9, 1, 1, 0xc8d3dc);
    // верхушка
    P(MX(7, 3), -13, 3, 3, 0x1d2b22);
    P(MX(8, 1), -13, 1, 1, 0xc8d3dc); P(MX(7, 1), -12, 1, 1, 0xc8d3dc);
    // сугроб
    P(MX(6, 5), 14, 5, 2, 0x8b98a6);
  } else {
    // ===== СУХАЯ СОСНА (вариант 2) =====
    // высокий голый ствол
    P(MX(7, 3), -10, 3, 24, 0x241d14); P(MX(7, 1), -10, 1, 24, 0x2f2618);
    // сухой пучок на верхушке + снег
    P(MX(6, 4), -12, 4, 2, 0x1d2b22); P(MX(7, 2), -12, 2, 1, 0xc8d3dc);
    // сухие сучья (короткие, с опущенными кончиками)
    P(MX(4, 3), -6, 3, 1, 0x241d14); P(MX(3, 1), -6, 1, 2, 0x241d14);
    P(MX(10, 3), -8, 3, 1, 0x241d14); P(MX(12, 1), -7, 1, 2, 0x241d14);
    P(MX(5, 2), -2, 2, 1, 0x241d14); P(MX(10, 2), -3, 2, 1, 0x241d14);
    // снег комками на сучьях
    P(MX(4, 2), -7, 2, 1, 0xc8d3dc); P(MX(10, 2), -9, 2, 1, 0xc8d3dc);
    P(MX(5, 1), -3, 1, 1, 0xc8d3dc); P(MX(10, 1), -4, 1, 1, 0xc8d3dc);
    P(MX(3, 1), -7, 1, 1, 0xeef6fc); P(MX(12, 1), -8, 1, 1, 0xeef6fc);
    // сугроб
    P(MX(6, 5), 14, 5, 2, 0x8b98a6);
  }
  break;
}
  if (v & 1) {
    // ель (без изменений)
    P(7, 4, 3, 12, 0x241d14); P(7, 4, 1, 12, 0x2f2618);
    P(3, 2, 11, 3, 0x1d2b22); P(4, 2, 9, 1, 0xc8d3dc);
    P(4, -2, 9, 3, 0x24352a); P(5, -2, 7, 1, 0xc8d3dc);
    P(5, -6, 7, 3, 0x1d2b22); P(6, -6, 5, 1, 0xc8d3dc);
    P(6, -10, 5, 3, 0x24352a); P(7, -10, 3, 1, 0xc8d3dc);
    P(7, -13, 3, 3, 0x1d2b22); P(8, -13, 1, 1, 0xc8d3dc);
    P(6, 14, 5, 2, 0x8b98a6);
  } else {
    // лиственное: голое дерево под снегом (вариант 3)
    // MX — зеркало для разнообразия (v & 2), ширины всегда > 0
    const MX = (x: number, w: number) => (v & 2 ? 16 - x - w : x);
    // ствол (доходит до сугроба)
    P(MX(6, 3), 1, 3, 13, 0x3a2c1c);
    P(MX(6, 3), 1, 1, 13, 0x4e3c28);
    // левая ветвь (каждый сегмент стыкуется с предыдущим)
    P(MX(5, 2), 0, 2, 2, 0x3a2c1c);
    P(MX(3, 2), -2, 2, 2, 0x3a2c1c);
    P(MX(2, 2), -3, 2, 1, 0x3a2c1c);
    P(MX(1, 2), -4, 2, 1, 0x3a2c1c);
    // правая ветвь
    P(MX(9, 2), 0, 2, 2, 0x3a2c1c);
    P(MX(11, 2), -2, 2, 2, 0x3a2c1c);
    P(MX(12, 2), -3, 2, 1, 0x3a2c1c);
    P(MX(13, 2), -4, 2, 1, 0x3a2c1c);
    // верхушка
    P(MX(7, 1), -4, 1, 5, 0x3a2c1c);
    P(MX(7, 1), -6, 1, 2, 0x3a2c1c);
    P(MX(8, 1), -5, 1, 2, 0x3a2c1c);
    // снег на ветвях (светлые линии = силуэт на тёмном фоне)
    P(MX(1, 3), -5, 3, 1, 0xeef6fc);
    P(MX(3, 2), -3, 2, 1, 0xc8d3dc);
    P(MX(5, 2), -1, 2, 1, 0xc8d3dc);
    P(MX(13, 2), -5, 2, 1, 0xeef6fc);
    P(MX(11, 2), -3, 2, 1, 0xc8d3dc);
    P(MX(9, 2), -1, 2, 1, 0xc8d3dc);
    P(MX(6, 3), -7, 3, 1, 0xeef6fc); // снежная шапка верхушки
    P(MX(6, 3), 0, 3, 1, 0xc8d3dc);  // снег на "плечах" развилки
    // сугроб у основания
    P(4, 14, 7, 2, 0x8b98a6);
  }
  break;
      if (v & 1) {
        P(7, 4, 3, 12, 0x241d14); P(7, 4, 1, 12, 0x2f2618);
        P(3, 2, 11, 3, 0x1d2b22); P(4, 2, 9, 1, 0xc8d3dc);
        P(4, -2, 9, 3, 0x24352a); P(5, -2, 7, 1, 0xc8d3dc);
        P(5, -6, 7, 3, 0x1d2b22); P(6, -6, 5, 1, 0xc8d3dc);
        P(6, -10, 5, 3, 0x24352a); P(7, -10, 3, 1, 0xc8d3dc);
        P(7, -13, 3, 3, 0x1d2b22); P(8, -13, 1, 1, 0xc8d3dc);
        P(6, 14, 5, 2, 0x8b98a6);
      } else {
        P(7, 0, 3, 16, 0x1a1611); P(7, 0, 1, 16, 0x262015);
        P(4, -6, 3, 2, 0x1a1611); P(3, -8, 2, 3, 0x1a1611);
        P(10, -4, 3, 2, 0x1a1611); P(12, -7, 2, 4, 0x1a1611);
        P(6, -8, 2, 3, 0x1a1611); P(9, -10, 2, 3, 0x1a1611);
        P(3, -9, 2, 1, 0x9fb4c4); P(12, -8, 2, 1, 0x9fb4c4); P(9, -11, 2, 1, 0x9fb4c4);
        P(6, 14, 5, 2, 0x8b98a6);
      }
      break;
    case Tl.ROCK:
      P(2, 5, 12, 10, 0x4e5a68);
      P(3, 4, 10, 4, 0x5c6875);
      P(2, 12, 12, 3, 0x39424e);
      if (v & 1) P(4, 4, 2, 1, 0x8f9aa8);
      break;
    case Tl.PALISADE:
      for (let i = 0; i < 4; i++) {
        const px = 1 + i * 4;
        P(px, -4, 3, 19, 0x4e3c28);
        P(px, -4, 1, 19, 0x63503a);
        P(px + 2, -4, 1, 19, 0x3a2c1c);
        P(px, -6, 3, 2, 0x5a4632);
        P(px + 1, -8, 1, 2, 0x6e5840);
      }
      P(0, 3, 16, 2, 0x463626);
      P(0, 3, 16, 1, 0x5a4632);
      break;
    case Tl.COLUMN: {
      P(5, -10, 7, 24, 0x515d6a);
      P(5, -10, 2, 24, 0x62707e);
      P(11, -10, 1, 24, 0x3f4a56);
      P(6, -12, 5, 2, 0x5c6875);
      P(7, -13, 3, 1, 0x6a7580);
      const rune = v & 1 ? 0x8fd8e8 : 0x7a8a98;
      P(8, -6, 1, 2, rune); P(9, -4, 1, 2, rune); P(8, -2, 2, 1, rune); P(9, 1, 1, 2, rune);
      P(4, 12, 9, 2, 0x39424e);
      P(4, 12, 9, 1, 0x8b98a6);
      if (v & 2) P(10, 5, 2, 3, 0x2e4234);
      break;
    }
    case Tl.DWALL: {
      const dark = dungeonId === 1 ? 0x1c261c : dungeonId === 2 ? 0x2c2824 : 0x10151c;
      const light = dungeonId === 1 ? 0x2c362c : dungeonId === 2 ? 0x3a342e : 0x232c38;
      P(0, 0, 16, 16, dark);
      P(0, 0, 16, 5, light);
      P(1, 9, 4, 4, 0x0a0e14); P(9, 7, 5, 5, 0x0a0e14);
      break;
    }
    case Tl.CAVEWALL:
      P(0, 0, 16, 16, 0x12181f);
      P(0, 0, 16, 6, 0x1a222c);
      P(2, 8, 3, 3, 0x0d1218); P(10, 10, 3, 3, 0x0d1218);
      break;
  }
}

/* ================== paintHouse ================== */

export function paintHouse(ctx: CanvasRenderingContext2D, hw: number, hh: number, v: number, ruined = false, roofSnow = true) {
  const { mode, wallW, wallH, topPad, marginX, foundH, wallTop, ridgeLen } = houseMetrics(hw, hh);
  const wx = marginX, cx = marginX + wallW / 2;
  const snow = roofSnow;
  const SNOW = 0xeef6fc, SNOW2 = 0xc8d8e8, ICE = 0xbdeef8;
  const R = (x: number, y: number, w: number, h: number, c: number, a = 1) => {
    ctx.globalAlpha = a; ctx.fillStyle = "#" + c.toString(16).padStart(6, "0");
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
  const CIRC = (x: number, y: number, r: number, c: number, a = 1) => {
    ctx.globalAlpha = a; ctx.fillStyle = "#" + c.toString(16).padStart(6, "0");
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  };
  const PATH = (pts: [number, number][], c: number, a = 1) => {
    ctx.globalAlpha = a; ctx.fillStyle = "#" + c.toString(16).padStart(6, "0");
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fill();
  };
  const logWall = (x: number, y: number, w: number, h: number) => {
    R(x, y, w, h, 0x4a3624);
    for (let ly = 0; ly < h; ly += 4) {
      R(x, y + ly, w, 1, 0x6a543c); R(x, y + ly + 1, w, 2, 0x5a4430); R(x, y + ly + 3, w, 1, 0x2e2012);
    }
    for (let ly = 2; ly + 4 < h; ly += 8) {
      R(x - 3, y + ly, 3, 5, 0x2e2012); R(x - 3, y + ly + 1, 2, 3, 0x6a543c);
      R(x + w, y + ly, 3, 5, 0x2e2012); R(x + w + 1, y + ly + 1, 2, 3, 0x6a543c);
    }
  };
  const door = (dx: number, yB: number, w: number, h: number) => {
    if (ruined) {
      const dy = yB - h;
      R(dx - 2, dy - 2, w + 4, h + 2, 0x1a120c);
      R(dx, dy, w, h, 0x120c08);
      for (let i = 0; i < w; i += 5) R(dx + i, dy, 1, h, 0x241a12);
      for (let i = 0; i < w - 2; i++)
        R(dx + 1 + i, dy + h - 3 - (i & 1), 1, 2, 0x2c2016);
      return;
    }
    const dy = yB - h;
    R(dx - 2, dy - 2, w + 4, h + 2, 0x241a10); R(dx - 1, dy - 3, w + 2, 1, 0x241a10);
    R(dx, dy, w, h, 0x38281a);
    for (let i = 3; i < w - 1; i += 4) R(dx + i, dy + 1, 1, h - 1, 0x241809);
    R(dx, dy + 4, w, 1, 0x262b33); R(dx, dy + h - 5, w, 1, 0x262b33);
    R(dx + w - 3, dy + (h >> 1), 1, 2, 0x9aa4b2);
    if (snow) R(dx - 2, dy - 4, w + 4, 1, SNOW2, 0.9);
  };
  const win = (x0: number, y0: number) => {
    if (ruined) {
      R(x0 - 1, y0 - 1, 9, 9, 0x1a120c);
      R(x0, y0, 7, 7, 0x100a06);
      R(x0 + 2, y0, 1, 7, 0x241a12); R(x0, y0 + 4, 7, 1, 0x241a12);
      return;
    }
    R(x0 - 1, y0 - 1, 9, 9, 0x2e2012);
    R(x0, y0, 7, 7, v & 1 ? 0xf8e0a0 : 0xb8d0e8);
    R(x0 + 3, y0, 1, 7, 0x2e2012); R(x0, y0 + 3, 7, 1, 0x2e2012);
    if (snow) R(x0 - 1, y0 - 2, 9, 1, SNOW, 0.9);
  };
  const icicles = (x0: number, x1: number, y0: number) => {
    if (!snow) return;
    const off = (v & 1) ? 3 : 0;
    for (let ix = x0 + 2 + off; ix < x1 - 2; ix += 7) R(ix, y0, 1, (ix >> 3) & 1 ? 3 : 2, ICE, 0.9);
  };
  const crossBeams = (ex: number, ry: number) => {
    for (let i = 0; i < 4; i++) { R(ex - 3 + i, ry - i, 2, 2, 0x3a2c1c); R(ex + 1 - i, ry - i, 2, 2, 0x3a2c1c); }
    if (snow) { R(ex - 3, ry - 4, 2, 1, SNOW); R(ex + 1, ry - 4, 2, 1, SNOW); }
  };
  const sideRoof = (ry: number, ey: number, x0: number, x1: number) => {
    R(x0 + 2, ry - 4, x1 - x0 - 4, 4, 0x35291c);
    if (snow) R(x0 + 3, ry - 5, x1 - x0 - 6, 1, SNOW2, 0.9);
    for (let y = ry; y < ey; y += 2) {
      const row = (y - ry) >> 1;
      R(x0, y, x1 - x0, 2, row % 2 ? 0x4a3a28 : 0x423222);
      for (let sx = x0 + (row % 2 ? 2 : 0); sx < x1; sx += 4) R(sx, y, 1, 2, 0x3a2c1c);
      if (snow && row % 2 === 1)
        for (let sx = x0 + 3 + ((row * 7) % 5); sx < x1 - 5; sx += 9) R(sx, y, 3, 1, SNOW, 0.75);
    }
    R(x0, ry - 2, x1 - x0, 2, 0x6a5a40);
    if (snow) R(x0 + 1, ry - 3, x1 - x0 - 2, 2, SNOW);
    crossBeams(x0 + 3, ry - 2); crossBeams(x1 - 3, ry - 2);
    R(x0, ey - 1, x1 - x0, 2, 0x5a4a34);
    icicles(x0, x1, ey + 1);
  };

  // ===== фундамент =====
  R(wx - 2, wallTop + wallH, wallW + 4, foundH, 0x3f444c);
  R(wx - 2, wallTop + wallH, wallW + 4, 1, 0x5a616c);
  for (let sx = wx - 1; sx < wx + wallW; sx += 6) R(sx, wallTop + wallH + 1, 3, 2, 0x4a505a);

  if (mode === "side") {
    logWall(wx, wallTop, wallW, wallH);
    door(Math.round(cx - 6), wallTop + wallH, 12, wallH - 3);
    win(wx + 6, wallTop + 5); win(wx + wallW - 13, wallTop + 5);
    sideRoof(topPad, wallTop, wx - 6, wx + wallW + 6);
  } else if (mode === "two") {
    logWall(wx, wallTop, wallW, wallH);
    const ledgeY = wallTop + 12;
    R(wx - 6, ledgeY - 1, wallW + 12, 1, 0x6a5a40);
    R(wx - 6, ledgeY, wallW + 12, 3, 0x4a3a28);
    R(wx - 6, ledgeY + 3, wallW + 12, 1, 0x2e2012);
    if (snow) R(wx - 6, ledgeY - 2, wallW + 12, 2, SNOW);
    icicles(wx - 6, wx + wallW + 6, ledgeY + 4);
    door(Math.round(cx - 7), wallTop + wallH, 14, 17);
    win(wx + 5, ledgeY + 9); win(wx + wallW - 13, ledgeY + 9);
    for (const ox of [cx - 14, cx - 4, cx + 6]) win(ox, wallTop + 3);
    sideRoof(topPad, wallTop, wx - 6, wx + wallW + 6);
  } else {
    logWall(wx, wallTop, wallW, wallH);
    const dw = 10, doorX = Math.round(cx - dw / 2);
    door(doorX, wallTop + wallH, dw, Math.min(17, wallH - 4));
    const gapL = doorX - 2 - wx, gapR = wx + wallW - (doorX + dw + 2);
    if (gapL >= 9 && !ruined) {
      const shX = wx + (gapL >> 1), shY = wallTop + Math.floor(wallH * 0.55);
      CIRC(shX, shY, 5, 0x262b33); CIRC(shX, shY, 4, v & 2 ? 0x8a3a34 : 0x3d5a66); CIRC(shX, shY, 1.5, 0xc9a24b);
      if (snow) R(shX - 4, shY - 6, 8, 1, SNOW2, 0.8);
    }
    if (gapR >= 9) win(doorX + dw + 2 + ((gapR - 7) >> 1), wallTop + Math.floor(wallH * 0.3));
    const ov = 6, eL = wx - ov, eR = wx + wallW + ov;
    const apF = topPad, apR = topPad - ridgeLen;
    PATH([[eL, wallTop], [cx, apF], [cx, apR], [eL + 2, wallTop - ridgeLen]], 0x403020);
    PATH([[eR, wallTop], [cx, apF], [cx, apR], [eR - 2, wallTop - ridgeLen]], 0x4a3a28);
    if (snow) for (let i = 1; i <= 3; i++) {
      R(cx - 4 - i * 3, apF - i * (ridgeLen / 4), 3, 1, SNOW, 0.7);
      R(cx + 2 + i * 2, apF - i * (ridgeLen / 4) + 1, 3, 1, SNOW, 0.7);
    }
    R(cx - 1, apR - 1, 2, ridgeLen + 3, snow ? SNOW : 0x6a5a40);
    const gH = wallTop - topPad;
    for (let i = 0; i < gH; i += 2) {
      const halfW = 1 + (wallW / 2 + ov - 1) * ((i + 2) / gH);
      const y = topPad + i;
      for (let x = Math.ceil(cx - halfW); x < cx + halfW; x += 3)
        R(x, y, Math.min(3, Math.ceil(cx + halfW) - x), 2, (Math.floor(x / 3) & 1) === 0 ? 0x4a3a28 : 0x423222);
      R(cx - halfW - 2, y - 1, 3, 2, 0x6a5a40); R(cx + halfW - 1, y - 1, 3, 2, 0x6a5a40);
      if (snow) { R(cx - halfW - 2, y - 2, 3, 1, SNOW); R(cx + halfW - 1, y - 2, 3, 1, SNOW); }
    }
    const ly0 = topPad + Math.floor(gH * 0.5);
    CIRC(cx, ly0, 4, 0x2e2012); CIRC(cx, ly0, 3, v & 1 ? 0xf8e0a0 : 0x241809);
    R(cx - 1, ly0 - 3, 1, 6, 0x2e2012); R(cx - 3, ly0 - 1, 6, 1, 0x2e2012);
    crossBeams(cx, topPad - 1);
    R(eL, wallTop - 1, eR - eL, 2, 0x5a4a34);
    icicles(eL, eR, wallTop + 1);
  }

  // ===== разрушения для руин =====
  if (ruined) {
    const canvasW = wallW + marginX * 2, canvasH = wallTop + wallH + foundH + 3;
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = 0.45; ctx.fillStyle = "#1a1410"; ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.globalAlpha = 0.25; ctx.fillStyle = "#3a3a40"; ctx.fillRect(0, 0, canvasW, canvasH);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    let s = hw * 71 + hh * 137 + v * 31 + 977;
    const rr = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const holes: [number, number, number, number][] = [];
    const nH = 2 + Math.floor(rr() * 2);
    for (let i = 0; i < nH; i++) {
      const w2 = 6 + Math.floor(rr() * 8), h2 = 4 + Math.floor(rr() * 6);
      holes.push([wx + Math.floor(rr() * (wallW - w2)), topPad + Math.floor(rr() * Math.max(4, wallTop - topPad - h2)), w2, h2]);
    }
    for (let i = 0; i < 5; i++)
      holes.push([wx + Math.floor(rr() * wallW), wallTop - 3 - Math.floor(rr() * 6), 3 + Math.floor(rr() * 4), 3 + Math.floor(rr() * 3)]);
    holes.push([wx + 2 + Math.floor(rr() * (wallW - 10)), wallTop + 4 + Math.floor(rr() * Math.max(4, wallH - 12)), 6 + Math.floor(rr() * 5), 5 + Math.floor(rr() * 4)]);
    ctx.globalCompositeOperation = "destination-out";
    for (const [hx, hy, w2, h2] of holes) ctx.fillRect(hx, hy, w2, h2);
    ctx.globalCompositeOperation = "source-over";
    for (const [hx, hy, w2, h2] of holes) {
      R(hx - 1, hy - 1, w2 + 2, 1, 0x150f0a); R(hx - 1, hy + h2, w2 + 2, 1, 0x150f0a);
      R(hx - 1, hy, 1, h2, 0x150f0a); R(hx + w2, hy, 1, h2, 0x150f0a);
      for (let bx = hx + 1; bx < hx + w2 - 1; bx += 3) R(bx, hy + 1, 1, h2 - 2, 0x241a12);
      if (rr() < 0.4) R(hx + 1 + Math.floor(rr() * (w2 - 2)), hy + h2 - 2, 1, 1, 0xe07030, 0.8);
    }
    for (let i = 0; i < 6; i++) {
      const dx = wx - 6 + Math.floor(rr() * (wallW + 12));
      R(dx, wallTop + wallH + foundH - 2 - Math.floor(rr() * 2), 3 + Math.floor(rr() * 4), 1, i % 2 ? 0x241d16 : 0x3a3630);
    }
    for (let i = 0; i < 6; i++) R(wx + 2 + i, wallTop - 2 + i, 2, 1, 0x1f1812);
    ctx.globalAlpha = 1;
  }
  // ===== сугробы у основания =====
  if (snow && !ruined) {
    R(wx - 3, wallTop + wallH + foundH - 2, wallW + 6, 1, SNOW2, 0.8);
    R(wx - 3, wallTop + wallH + foundH - 3, 6, 2, SNOW, 0.9);
    R(wx + wallW - 3, wallTop + wallH + foundH - 3, 6, 2, SNOW, 0.9);
  }
  ctx.globalAlpha = 1;
}

/* ================== кэш текстур стен ================== */

export class WallTextureCache {
  private cache = new Map<string, Texture>();

  getSprite(t: number, r1: number, r2: number, dungeonId: number): Sprite {
    let v = 0;
    if (t === Tl.TREE) v = (r2 > 0.5 ? 1 : 0) | (r2 > 0.7 ? 2 : 0);
    else if (t === Tl.ROCK) v = r1 > 0.5 ? 1 : 0;
    else if (t === Tl.COLUMN) v = (r1 > 0.5 ? 1 : 0) | (r2 > 0.7 ? 2 : 0);
    const key = t + "_" + v + "_" + dungeonId;
    let tex = this.cache.get(key);
    if (!tex) {
      const c = document.createElement("canvas");
      c.width = 32; c.height = 44;
      paintWall(c.getContext("2d")!, t, v, dungeonId);
      tex = Texture.from(c);
      this.cache.set(key, tex);
    }
    return new Sprite(tex);
  }

  invalidate() { this.cache.clear(); }
  destroy() { this.cache.forEach((t) => t.destroy(true)); this.cache.clear(); }
}

/* ================== кэш текстур домов ================== */

export class HouseTextureCache {
  private cache = new Map<string, Texture>();

  getTexture(hw: number, hh: number, v: number, ruined: boolean, roofSnow: boolean): Texture {
    const key = `house_${hw}x${hh}_v${v}_r${ruined ? 1 : 0}_snow${roofSnow ? 1 : 0}`;
    let tex = this.cache.get(key);
    if (!tex) {
      const m = houseMetrics(hw, hh);
      const c = document.createElement("canvas");
      c.width = m.canvasW; c.height = m.canvasH;
      paintHouse(c.getContext("2d")!, hw, hh, v, ruined, roofSnow);
      tex = Texture.from(c);
      this.cache.set(key, tex);
    }
    return tex;
  }

  invalidate() { this.cache.clear(); }
  destroy() { this.cache.forEach((t) => t.destroy(true)); this.cache.clear(); }
}

/* ================== buildGroundTexture ================== */

function buildGroundTexture(map: WorldData): Texture {
  const { W, H } = map;
  const gc = document.createElement("canvas"); gc.width = W * T; gc.height = H * T;
  const gx = gc.getContext("2d")!;

  const pals: Record<number, { f: [string, string, string]; w: [string, string] }> = {
    0: { f: ["#39424e", "#2f3844", "#445060"], w: ["#10151c", "#232c38"] },
    1: { f: ["#3d4a3e", "#2f3830", "#4e5a4e"], w: ["#1c261c", "#2c362c"] },
    2: { f: ["#5a524a", "#4a423a", "#6a625a"], w: ["#2c2824", "#3a342e"] },
  };
  const pal = map.isDungeon ? pals[map.dungeonId] ?? pals[0] : null;

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = map.tiles[y * W + x];
    const X = x * T, Y = y * T;
    switch (t) {
      case Tl.WATER:
        dither(gx, X, Y, "#0a1620", "#081219", "#12303e");
        if (rnd(x, y, 3) > 0.7) { gx.fillStyle = "#1d3a4a"; gx.fillRect(X + 3, Y + Math.floor(rnd(x, y, 5) * 12) + 2, 6, 1); }
        break;
      case Tl.SHORE: dither(gx, X, Y, "#4a5a64", "#3d4d57", "#5a6a74"); break;
      case Tl.SNOW: dither(gx, X, Y, "#8b98a6", "#7e8b99", "#9aa7b5"); break;
      case Tl.SNOW2: dither(gx, X, Y, "#7e8b99", "#717e8c", "#8d9aa8"); break;
      case Tl.PATH: dither(gx, X, Y, "#55636e", "#495762", "#61707b"); break;
      case Tl.FOREST: dither(gx, X, Y, "#26333c", "#1e2a32", "#2e3d47"); break;
      case Tl.MTN: dither(gx, X, Y, "#5f6b78", "#525e6b", "#6d7986"); break;
      case Tl.SWAMP: dither(gx, X, Y, "#2c3a3e", "#243034", "#354347"); break;
      case Tl.POOL:
        dither(gx, X, Y, "#1b2a30", "#152127", "#223339");
        gx.fillStyle = "#2a4a55";
        gx.fillRect(X + 3, Y + 4, 5, 1); gx.fillRect(X + 8, Y + 10, 4, 1);
        break;
      case Tl.VILLAGE: dither(gx, X, Y, "#635a4c", "#575043", "#6f6658"); break;
      case Tl.RUINS:
        dither(gx, X, Y, "#4e5a68", "#424d5a", "#5c6875");
        if (rnd(x, y, 7) > 0.75) { gx.fillStyle = "#39424e"; gx.fillRect(X + 2, Y + 2, 6, 1); gx.fillRect(X + 2, Y + 2, 1, 5); }
        break;
      case Tl.CAVE: dither(gx, X, Y, "#2b3646", "#222b38", "#343f50"); break;
      case Tl.CAVEWALL:
        gx.fillStyle = "#12181f"; gx.fillRect(X, Y, T, T);
        gx.fillStyle = "#1a222c"; gx.fillRect(X, Y, T, 6);
        break;
      case Tl.STAIRS:
        dither(gx, X, Y, "#39424e", "#2b3646", "#4e5a68");
        gx.fillStyle = "#222b38";
        gx.fillRect(X + 2, Y + 3, 12, 2); gx.fillRect(X + 3, Y + 7, 10, 2); gx.fillRect(X + 4, Y + 11, 8, 2);
        break;
      case Tl.DFLOOR:
        if (pal) dither(gx, X, Y, pal.f[0], pal.f[1], pal.f[2]);
        else dither(gx, X, Y, "#39424e", "#2f3844", "#445060");
        break;
      case Tl.DWALL:
        gx.fillStyle = pal ? pal.w[0] : "#10151c"; gx.fillRect(X, Y, T, T);
        gx.fillStyle = pal ? pal.w[1] : "#232c38"; gx.fillRect(X, Y, T, 5);
        break;
      case Tl.ALTAR: dither(gx, X, Y, "#1a222c", "#141a22", "#232c38"); break;
      case Tl.TREE: dither(gx, X, Y, "#1c262e", "#161f26", "#232e37"); break;
      case Tl.ROCK: dither(gx, X, Y, map.isDungeon ? "#39424e" : "#5f6b78", "#525e6b", "#6d7986"); break;
      case Tl.PALISADE: dither(gx, X, Y, "#3a3020", "#2e2618", "#46382a"); break;
      case Tl.HOUSE: {
        const ru = false; // handled by ruinedTiles set in buildWallAndHouseSprites
        gx.fillStyle = ru ? "#191411" : "#2c2620";
        gx.fillRect(X, Y, T, T);
        if (ru && rnd(x, y, 21) > 0.6) { gx.fillStyle = "#0f0b08"; gx.fillRect(X + 3, Y + 3, 4, 3); }
        break;
      }
      case Tl.COLUMN: dither(gx, X, Y, "#4e5a68", "#424d5a", "#5c6875"); break;
      default:
        gx.fillStyle = TILE_COLORS[t] ?? "#10151c";
        gx.fillRect(X, Y, T, T);
    }
  }
  return Texture.from(gc);
}

/* ================== buildWallAndHouseSprites ================== */

function buildWallAndHouseSprites(
  map: WorldData,
  wallCache: WallTextureCache,
  houseCache: HouseTextureCache,
  ruinedTiles: Set<number>,
  roofSnow: boolean
): { wallSprites: (Sprite | import("pixi.js").Graphics)[]; houseSprites: HouseSpriteEntry[] } {
  const { W, H } = map;
  const wallSprites: (Sprite | import("pixi.js").Graphics)[] = [];
  const houseSprites: HouseSpriteEntry[] = [];

  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = map.tiles[y * W + x];
    const X = x * T, Y = y * T;
    if (
      t === Tl.TREE || t === Tl.ROCK || t === Tl.PALISADE ||
      t === Tl.COLUMN || t === Tl.DWALL || t === Tl.CAVEWALL
    ) {
      const ws = wallCache.getSprite(t, rnd(x, y, 11), rnd(x, y, 13), map.dungeonId);
      ws.position.set(X - 8, Y - 20);
      ws.zIndex = Y + T;
      wallSprites.push(ws);
    }
  }

  const houseSeen = new Set<string>();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = map.tiles[y * W + x];
    if (t !== Tl.HOUSE) continue;
    const key = `${x},${y}`;
    if (houseSeen.has(key)) continue;

    let hw = 1, hh = 1;
    while (x + hw < W && map.tiles[y * W + (x + hw)] === Tl.HOUSE) hw++;
    while (y + hh < H) {
      let rowOk = true;
      for (let dx = 0; dx < hw; dx++) {
        if (map.tiles[(y + hh) * W + (x + dx)] !== Tl.HOUSE) { rowOk = false; break; }
      }
      if (!rowOk) break;
      hh++;
    }

    for (let dy = 0; dy < hh; dy++) for (let dx = 0; dx < hw; dx++) {
      houseSeen.add(`${x + dx},${y + dy}`);
    }

    const m = houseMetrics(hw, hh);
    const isRuined = ruinedTiles.has(y * W + x);
    const v = (rnd(x, y, 13) > 0.5 ? 1 : 0) | (rnd(x, y, 11) > 0.6 ? 2 : 0);
    const tex = houseCache.getTexture(hw, hh, v, isRuined, roofSnow);
    const ws = new Sprite(tex);
    ws.position.set(x * T - m.marginX, y * T + hh * T + 1 - (m.wallTop + m.wallH + m.foundH));
    ws.zIndex = y * T + hh * T;
    wallSprites.push(ws);
    houseSprites.push({ spr: ws, hw, hh, v, ruined: isRuined });
  }

  return { wallSprites, houseSprites };
}

/* ================== фасадная функция ================== */

export function buildAllTileTextures(map: WorldData, roofSnow: boolean): TileBuildResult {
  const wallCache = new WallTextureCache();
  const houseCache = new HouseTextureCache();

  // ruinedTiles — для house-level (целые блоки домов)
  const ruinedTiles = new Set<number>();
  for (const r of map.ruinedHouses)
    for (let dy = 0; dy < r.h; dy++) for (let dx = 0; dx < r.w; dx++)
      ruinedTiles.add((r.y + dy) * map.W + (r.x + dx));

  const groundTexture = buildGroundTexture(map);
  const { wallSprites, houseSprites } = buildWallAndHouseSprites(map, wallCache, houseCache, ruinedTiles, roofSnow);

  return { groundTexture, wallSprites, houseSprites, wallCache, houseCache };
}

/* ================== buildMinimapBase ================== */

export function buildMinimapBase(map: WorldData): ImageData {
  const c = document.createElement("canvas");
  c.width = map.W * 2; c.height = map.H * 2;
  const cx = c.getContext("2d")!;
  for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
    cx.fillStyle = TILE_COLORS[map.tiles[y * map.W + x]] ?? "#10151c";
    cx.fillRect(x * 2, y * 2, 2, 2);
  }
  return cx.getImageData(0, 0, c.width, c.height);
}

/* ================== drawMinimap ================== */

export interface MinimapOverlays {
  shrines: { x: number; y: number }[];
  player: { x: number; y: number };
  target: { x: number; y: number } | null;
  secretKnown: boolean;
  stashSpot: { x: number; y: number };
  nornsFavor: boolean;
  pedestals: { x: number; y: number; taken: boolean }[];
  map: WorldData;
  realT: number;
}

export function drawMinimap(
  ctx: CanvasRenderingContext2D,
  base: ImageData,
  o: MinimapOverlays
) {
  const c = ctx.canvas;
  if (c.width !== base.width || c.height !== base.height) {
    c.width = base.width; c.height = base.height;
  }
  ctx.putImageData(base, 0, 0);
  ctx.fillStyle = "#8fd8e8";
  for (const s of o.shrines) ctx.fillRect(s.x / T * 2 - 1, s.y / T * 2 - 1, 2, 2);
  if (o.secretKnown && !o.map.isDungeon) {
    ctx.fillStyle = "#c9a24b";
    ctx.fillRect(o.stashSpot.x * 2 - 1, o.stashSpot.y * 2 - 1, 3, 3);
  }
  if (o.nornsFavor && !o.map.isDungeon) {
    ctx.fillStyle = "#63d8c8";
    for (const p of o.pedestals) if (!p.taken) ctx.fillRect(p.x / T * 2 - 1, p.y / T * 2 - 1, 2, 2);
  }
  const tgt = o.target;
  if (tgt && Math.floor(o.realT * 3) % 2 === 0) {
    ctx.fillStyle = "#e8c979";
    ctx.fillRect(tgt.x / T * 2 - 1.5, tgt.y / T * 2 - 1.5, 3, 3);
  }
  ctx.fillStyle = "#f4f8fc";
  ctx.fillRect(o.player.x / T * 2 - 1, o.player.y / T * 2 - 1, 3, 3);
}

/* ================== buildBigMapBase ================== */

export function buildBigMapBase(map: WorldData): ImageData {
  const scale = Math.min(560 / (map.W * 2), 420 / (map.H * 2)) * 2;
  const c = document.createElement("canvas");
  c.width = Math.round(map.W * scale);
  c.height = Math.round(map.H * scale);
  const cx = c.getContext("2d")!;
  cx.imageSmoothingEnabled = false;
  for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
    cx.fillStyle = TILE_COLORS[map.tiles[y * map.W + x]] ?? "#10151c";
    cx.fillRect(x * scale, y * scale, scale, scale);
  }
  return cx.getImageData(0, 0, c.width, c.height);
}

/* ================== drawBigMap ================== */

export interface BigMapOverlays {
  shrines: { x: number; y: number }[];
  map: WorldData;
  dungeonBossDead: (id: number) => boolean;
  bossRoom: { x: number; y: number; w: number; h: number };
  bossSpot: { x: number; y: number };
  dungeonId: number;
  player: { x: number; y: number };
  target: { x: number; y: number } | null;
  secretKnown: boolean;
  stashSpot: { x: number; y: number };
  pedestals: { x: number; y: number; taken: boolean }[];
  dungeonEntries: { x: number; y: number; id: number }[];
  treeAltar: { x: number; y: number };
}

export function drawBigMap(
  ctx: CanvasRenderingContext2D,
  base: ImageData,
  scale: number,
  o: BigMapOverlays
) {
  const c = ctx.canvas;
  c.width = Math.round(o.map.W * scale);
  c.height = Math.round(o.map.H * scale);
  ctx.imageSmoothingEnabled = false;
  ctx.putImageData(base, 0, 0);
  const dot = (wx: number, wy: number, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(wx / T * scale, wy / T * scale, r, 0, Math.PI * 2);
    ctx.fill();
  };
  for (const s of o.shrines) dot(s.x * T + 8, s.y * T + 8, 3, "#8fd8e8");
  if (!o.map.isDungeon) {
    for (const en of o.dungeonEntries) {
      const done = o.dungeonBossDead(en.id);
      dot(en.x * T + 8, en.y * T + 8, 5, done ? "#3d5a66" : "#c9a24b");
    }
    dot(o.treeAltar.x * T + 8, o.treeAltar.y * T + 8, 5, "#63d8c8");
    for (const p of o.pedestals) if (!p.taken) dot(p.x, p.y, 3, "#63d8c8");
    if (o.secretKnown) dot(o.stashSpot.x * T + 8, o.stashSpot.y * T + 8, 4, "#c9a24b");
  } else if (!o.dungeonBossDead(o.dungeonId)) {
    dot(o.bossRoom.x + o.bossRoom.w / 2, o.bossRoom.y + o.bossRoom.h / 2, 5, "#e05050");
  }
  const tgt = o.target;
  if (tgt) dot(tgt.x, tgt.y, 4, "#e8c979");
  dot(o.player.x, o.player.y, 4, "#f4f8fc");
}
