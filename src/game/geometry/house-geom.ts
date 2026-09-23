/* house-geom.ts — геометрическая отрисовка домов/руин (task_14).
 *
 * Перенос legacy paintHouse() из tiles.ts: вместо Canvas2D — Graphics-примитивы.
 * Локальные координаты совпадают с legacy canvas: Graphics размещается в
 * (x*T - marginX, y*T + hh*T + 1 - canvasH).
 *
 * Отличия от canvas-версии (осознанные, canvas-fx нет в IRenderer):
 *  - "дыры" руин рисуются тёмными заплатками вместо destination-out;
 *  - "затемнение" руина — тонирование кровли/стены поверх (как source-atop).
 */

import type { IRenderer, GraphicsHandle } from '../renderer/IRenderer';
import { T } from '../world';
import { makePainter } from './geom-utils';

/** Метрики дома (те же формулы, что в legacy tiles.ts) */
export interface HouseMetrics {
  mode: 'side' | 'front' | 'two';
  wallW: number;
  footH: number;
  wallH: number;
  roofH: number;
  topPad: number;
  ridgeLen: number;
  marginX: number;
  foundH: number;
  wallTop: number;
}

export function houseMetrics(hw: number, hh: number): HouseMetrics {
  const wallW = hw * T, footH = hh * T;
  const marginX = 12, foundH = 3, bottomPad = 3;
  const mode: 'side' | 'front' | 'two' =
    hw >= 3 && hh >= 3 ? 'two' : hw > hh ? 'side' : 'front';
  let wallH: number, roofH: number, topPad: number, ridgeLen = 0;
  if (mode === 'side') { wallH = 18; roofH = 22; topPad = 8; }
  else if (mode === 'two') { wallH = 37; roofH = 24; topPad = 8; }
  else { ridgeLen = hh > hw ? 14 : 6; wallH = hh > hw ? 24 : 20; roofH = 18; topPad = ridgeLen + 8; }
  const wallTop = topPad + roofH;
  return { mode, wallW, footH, wallH, roofH, topPad, ridgeLen, marginX, foundH, wallTop };
}

/**
 * Нарисовать дом hw×hh (в тайлах) в локальных координатах Graphics.
 * @param v        вариант (биты 1,2: окна/цвет линзы)
 * @param ruined   руины (тёмные проёмы, заплатки-дыры)
 * @param roofSnow снег на крышах
 * @param ox, oy   смещение для батчинга (когда один Graphics на все дома)
 */
export function drawHouseGeometry(
  renderer: IRenderer,
  g: GraphicsHandle,
  hw: number,
  hh: number,
  v: number,
  ruined = false,
  roofSnow = true,
  ox = 0,
  oy = 0
): void {
  const { mode, wallW, wallH, topPad, marginX, foundH, wallTop, ridgeLen } = houseMetrics(hw, hh);
  const wx = marginX, cx = marginX + wallW / 2;
  const snow = roofSnow;
  const SNOW = 0xeef6fc, SNOW2 = 0xc8d8e8, ICE = 0xbdeef8;

  const painter = makePainter(renderer, g);
  // Смещение ox/oy — для батчинга нескольких домов в одном Graphics
  const R = (x: number, y: number, w: number, h: number, c: number, a = 1) => painter.P(x + ox, y + oy, w, h, c, a);
  const CIRC = (x: number, y: number, r: number, c: number, a = 1) => painter.C(x + ox, y + oy, r, c, a);
  const PATH = (pts: number[], c: number, a = 1) =>
    painter.POLY(pts.map((v, i) => (i % 2 === 0 ? v + ox : v + oy)), c, a);

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

  if (mode === 'side') {
    logWall(wx, wallTop, wallW, wallH);
    door(Math.round(cx - 6), wallTop + wallH, 12, wallH - 3);
    win(wx + 6, wallTop + 5); win(wx + wallW - 13, wallTop + 5);
    sideRoof(topPad, wallTop, wx - 6, wx + wallW + 6);
  } else if (mode === 'two') {
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
    PATH([eL, wallTop, cx, apF, cx, apR, eL + 2, wallTop - ridgeLen], 0x403020);
    PATH([eR, wallTop, cx, apF, cx, apR, eR - 2, wallTop - ridgeLen], 0x4a3a28);
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

  // ===== разрушения для руин (заплатки вместо destination-out) =====
  if (ruined) {
    // затемнение стен (как legacy source-atop 0.45+0.25, но без скрытия фона)
    R(wx, wallTop, wallW, wallH, 0x1a1410, 0.45);
    R(wx, wallTop, wallW, wallH, 0x3a3a40, 0.25);

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
    for (const [hx, hy, w2, h2] of holes) {
      // сама дыра — тёмная проплешина
      R(hx, hy, w2, h2, 0x0b0805, 0.9);
      // рама дыры
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
  }

  // ===== сугробы у основания =====
  if (snow && !ruined) {
    R(wx - 3, wallTop + wallH + foundH - 2, wallW + 6, 1, SNOW2, 0.8);
    R(wx - 3, wallTop + wallH + foundH - 3, 6, 2, SNOW, 0.9);
    R(wx + wallW - 3, wallTop + wallH + foundH - 3, 6, 2, SNOW, 0.9);
  }
}
