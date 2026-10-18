/* gen-relief-svg.mjs — генератор дизайн-превью уступов/пандусов (SVG/relief.svg).
 *
 * Логика отрисовки рельефа здесь 1-в-1 повторяет то, что пойдёт в
 * tile-geom.ts: те же палитры, та же детерминированная dither-функция,
 * те же размеры граней. Скрипт автономен (node scripts/gen-relief-svg.mjs).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const T = 16;
const SCALE_DETAIL = 12;
const SCALE_SCENE = 6;
const BG = '#070a0e';

/** Детерминированный шум (точно как в tile-geom.ts) */
const rnd = (x, y, s) => {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
};

const hx = (c) => '#' + c.toString(16).padStart(6, '0');
/** alpha -> svg-атрибут (только если < 1) */
const alpha = (a) => (a >= 1 ? '' : ` fill-opacity="${a}"`);

/* ================= ПАЛИТРЫ БИОМОВ =================
 * ground: база/тень/свет грунта (из drawTileLocal)
 * rock:   грань уступа / её тень / светлая кромка («лип») / слои / базовая тень
 * ramp:   тело пандуса / линия ступени / светлая кромка
 */
const BIOMES = {
  meadow: {
    label: 'Луг (MEADOW)',
    ground: [0x5f6b52, 0x55614a, 0x69755c],
    rock: { face: 0x474f57, dark: 0x363e46, lip: 0x707b86, strata: 0x2c343d },
    ramp: { body: 0x5a646e, step: 0x3b434c, lip: 0x7d8894 },
  },
  forest: {
    label: 'Лес (FOREST)',
    ground: [0x26333c, 0x1e2a32, 0x2e3d47],
    rock: { face: 0x3a444d, dark: 0x2b343c, lip: 0x5c6874, strata: 0x222b33 },
    ramp: { body: 0x454f59, step: 0x2d363e, lip: 0x66727e },
  },
  swamp: {
    label: 'Топи (SWAMP)',
    ground: [0x2c3a3e, 0x243034, 0x354347],
    rock: { face: 0x384348, dark: 0x2a3337, lip: 0x5a666b, strata: 0x222b2e },
    ramp: { body: 0x434e53, step: 0x2b3438, lip: 0x636f74 },
  },
  snow: {
    label: 'Снег (SNOW)',
    ground: [0x8b98a6, 0x7e8b99, 0x9aa7b5],
    rock: { face: 0x5d6a77, dark: 0x4a5763, lip: 0xc8d3dc, strata: 0x3e4a57 },
    ramp: { body: 0x76838f, step: 0x525f6b, lip: 0xd6e0e8 },
  },
  mountain: {
    label: 'Скалы (MTN/ROCK)',
    ground: [0x5f6b78, 0x525e6b, 0x6d7986],
    rock: { face: 0x4c5662, dark: 0x3a434f, lip: 0x7d8997, strata: 0x303843 },
    ramp: { body: 0x5f6a76, step: 0x3f4854, lip: 0x8b97a4 },
  },
  scree: {
    label: 'Осыпь (SCREE)',
    ground: [0x59636f, 0x4b5561, 0x6a7480],
    rock: { face: 0x49535f, dark: 0x38414c, lip: 0x7a8490, strata: 0x2e3640 },
    ramp: { body: 0x5b6570, step: 0x3c4550, lip: 0x87929d },
  },
};

/* ================= СПЕЦИФИКАЦИЯ РЕЛЬЕФА ================= */

const CLIFF_STEP_PX = 6;   // высота грани на 1 уровень перепада
const FACE_CAP = T - 2;    // грань никогда не закрывает весь тайл
const SIDE_PX = 3;         // ширина боковой (W/E) грани
const RAMP_STEPS = 3;      // ступеней на пандусе

/**
 * Прямоугольники северной (горизонтальной) грани.
 * Рисуется на НИЖНЕМ тайле (x,y), у его верхней кромки; сосед сверху выше на dN.
 */
function northFace(R, x0, y0, dN, rock) {
  const faceH = Math.min(FACE_CAP, CLIFF_STEP_PX * dN);
  const mid = faceH >> 1;

  // тело грани + вертикальный градиент (к низу темнее)
  R(x0, y0, T, faceH, rock.face);
  R(x0, y0 + mid, T, faceH - mid, rock.dark);

  // горизонтальные слои камня
  if (faceH >= 6) {
    R(x0, y0 + Math.max(2, Math.round(faceH * 0.34)), T, 1, rock.strata);
    R(x0, y0 + Math.round(faceH * 0.72), T, 1, rock.strata);
  }

  // светлая кромка сверху (кап травы соседа) и тень под ней
  R(x0, y0, T, 1, rock.lip);
  R(x0, y0 + 1, T, 1, rock.dark);

  // базовая тень у подножия + мягкая тень на грунте перед гранью
  R(x0, y0 + faceH, T, 1, rock.strata);
  R(x0, y0 + faceH + 1, T, 1, 0x10151c, 0.28);
  R(x0, y0 + faceH + 2, T, 1, 0x10151c, 0.14);

  // случайные сколы по нижней кромке
  for (let n = 0; n < 4; n++) {
    const nx = x0 + Math.floor(rnd(x0 / T, y0 / T, n + 71) * T);
    const nw = 1 + Math.floor(rnd(y0 / T, x0 / T, n + 83) * 2);
    R(nx, y0 + faceH - 1, nw, 1, rock.strata);
  }
}

/** Прямоугольники боковой (вертикальной) грани.
 * Бит стены стоит на НИЖНЕМ тайле и указывает на более высокого соседа:
 * dir<0 → западный сосед выше, dir>0 → восточный. */
function sideFace(R, x0, y0, dir, dN, rock) {
  const faceW = Math.min(5, SIDE_PX + dN - 1);
  const westHigher = dir < 0;
  const sx = westHigher ? x0 : x0 + T - faceW;
  const edgeHigh = westHigher ? sx : sx + faceW - 1;   // кромка у границы с верхней террасой
  const edgeLow = westHigher ? sx + faceW - 1 : sx;    // подножие, смотрящее на нижнюю террасу

  R(sx, y0, faceW, T, rock.face);
  R(edgeLow, y0, 1, T, rock.dark);
  R(edgeHigh, y0, 1, T, rock.lip);
  if (faceW >= 4) R(sx + (faceW >> 1), y0, 1, T, rock.strata);
  // тень на нижнем грунте у подножия
  R(westHigher ? sx + faceW : sx - 1, y0, 1, T, 0x10151c, 0.3);
}

/** Пандус: уровни отличаются, но стены нет. Светлая «лесенка» поперёк стыка. */
function rampH(R, x0, y0, rock, ramp) {
  const band = RAMP_STEPS * 2;
  const top = y0 - (band >> 1);
  R(x0, top, T, band, ramp.body);
  for (let s = 0; s < RAMP_STEPS; s++) {
    const sy = top + s * 2;
    R(x0, sy, T, 1, s === 0 ? ramp.lip : ramp.body);
    R(x0, sy + 1, T, 1, ramp.step);
  }
  R(x0, top + band, T, 1, 0x10151c, 0.22);
  // бортики, чтобы пандус читался как законченный проход
  R(x0, top, 1, band, ramp.step);
  R(x0 + T - 1, top, 1, band, ramp.step);
  void rock;
}

/** То же для вертикального стыка: dir<0 → западный сосед выше. */
function rampV(R, x0, y0, dir, ramp) {
  const band = RAMP_STEPS * 2;
  const westHigher = dir < 0;
  const sx = westHigher ? x0 - (band >> 1) : x0 + T - (band >> 1);
  R(sx, y0, band, T, ramp.body);
  for (let s = 0; s < RAMP_STEPS; s++) {
    const px = sx + s * 2;
    R(px, y0, 1, T, s === 0 ? ramp.lip : ramp.body);
    R(px + 1, y0, 1, T, ramp.step);
  }
  R(westHigher ? sx + band : sx - 1, y0, 1, T, 0x10151c, 0.22);
  R(sx, y0, band, 1, ramp.step);
  R(sx, y0 + T - 1, band, 1, ramp.step);
}

/* ================= РЕНДЕР В SVG ================= */

function makeSceneRenderer() {
  const rects = [];
  /** R(x, y, w, h, color, a=1) — координаты в пикселях сцены */
  const R = (x, y, w, h, c, a = 1) => {
    rects.push({ x, y, w, h, c, a });
  };
  return { R, rects };
}

const hxAttr = (r) =>
  `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${hx(r.c)}"${alpha(r.a)}/>`;

/** Грунт одного тайла: база + 6 точек крапа (как в drawTileLocal) */
function groundTile(R, gx, gy, ground) {
  const [base, dark, light] = ground;
  R(gx * T, gy * T, T, T, base);
  for (let i = 0; i < 6; i++) {
    const px = gx * T + Math.floor(rnd(gx * T, gy * T, i) * T);
    const py = gy * T + Math.floor(rnd(gy * T, gx * T, i + 9) * T);
    R(px, py, 1, 1, i % 2 ? dark : light);
  }
}

/** Карта высот сцены 6×4 — «хребет»: гряда с двумя террасами по бокам. */
const SCENE_W = 6, SCENE_H = 4;
const LEVELS = [
  [1, 2, 3, 3, 2, 1],
  [1, 2, 3, 3, 2, 1],
  [0, 1, 2, 2, 1, 0],
  [0, 1, 2, 2, 1, 0],
];

/** Биты стен выводятся ИЗ карты высот (конвенция игры: бит на НИЖНЕМ тайле
 *  указывает на более высокого соседа). Часть стен заменяется пандусами. */
const WALLS = (() => {
  const map = new Map();
  for (let y = 0; y < SCENE_H; y++) for (let x = 0; x < SCENE_W; x++) {
    const me = LEVELS[y][x];
    const bits = {};
    if (y > 0 && LEVELS[y - 1][x] > me) bits.N = 1;
    if (x > 0 && LEVELS[y][x - 1] > me) bits.W = 1;
    if (x < SCENE_W - 1 && LEVELS[y][x + 1] > me) bits.E = 1;
    if (Object.keys(bits).length) map.set(`${x},${y}`, bits);
  }
  const ramp = (x, y, dir) => map.set(`${x},${y}`, { [`RAMP${dir}`]: 1 });
  ramp(2, 2, 'N');  // подъём на гряду с юга
  ramp(0, 3, 'E');  // подъём на террасу с запада
  ramp(5, 2, 'W');  // подъём на террасу с востока
  return map;
})();

function buildScene(pal) {
  const { R, rects } = makeSceneRenderer();
  for (let y = 0; y < SCENE_H; y++) {
    for (let x = 0; x < SCENE_W; x++) groundTile(R, x, y, pal.ground);
  }
  // мягкая тень террас: чем выше уровень — тем светлее
  for (let y = 0; y < SCENE_H; y++) for (let x = 0; x < SCENE_W; x++) {
    const tone = LEVELS[y][x] / 4;
    if (tone > 0.45) R(x * T, y * T, T, T, 0xdbe5ee, Math.min(0.12, (tone - 0.45) * 0.3));
  }
  // рельеф
  for (let y = 0; y < SCENE_H; y++) for (let x = 0; x < SCENE_W; x++) {
    const w = WALLS.get(`${x},${y}`);
    if (!w) continue;
    const x0 = x * T, y0 = y * T;
    if (w.N) northFace(R, x0, y0, LEVELS[y - 1][x] - LEVELS[y][x], pal.rock);
    if (w.W) sideFace(R, x0, y0, -1, LEVELS[y][x - 1] - LEVELS[y][x], pal.rock);
    if (w.E) sideFace(R, x0, y0, +1, LEVELS[y][x + 1] - LEVELS[y][x], pal.rock);
    if (w.RAMPN) rampH(R, x0, y0, pal.rock, pal.ramp);
    if (w.RAMPE) rampV(R, x0, y0, +1, pal.ramp);
    if (w.RAMPW) rampV(R, x0, y0, -1, pal.ramp);
  }
  return rects;
}

/** Крупный план одного элемента (для секции «Детали») */
function buildDetail(kind, pal) {
  const { R, rects } = makeSceneRenderer();
  groundTile(R, 0, 0, pal.ground);
  const x0 = 0, y0 = 0;
  if (kind === 'n1') northFace(R, x0, y0, 1, pal.rock);
  if (kind === 'n2') northFace(R, x0, y0, 2, pal.rock);
  if (kind === 'n3') northFace(R, x0, y0, 3, pal.rock);
  if (kind === 'sideR') sideFace(R, x0, y0, +1, 1, pal.rock);
  if (kind === 'sideL') sideFace(R, x0, y0, -1, 1, pal.rock);
  if (kind === 'ramp') rampH(R, x0, y0, pal.rock, pal.ramp);
  if (kind === 'rampV') rampV(R, x0, y0, -1, pal.ramp);
  return rects;
}

/* ================= ЧИСЛЕННАЯ ПРОВЕРКА (--check) =================
 * Растеризуем сцену в ASCII: так можно проверить, что грани и пандусы
 * стоят ровно на границах тайлов, не перекрывают друг друга и не «улетают».
 */
if (process.argv.includes('--check')) {
  const rects = buildScene(BIOMES.mountain);
  const CW = SCENE_W * T, CH = SCENE_H * T;
  const buf = new Float64Array(CW * CH);
  for (const r of rects) {
    const cr = ((r.c >> 16) & 255) / 255, cg = ((r.c >> 8) & 255) / 255, cb = (r.c & 255) / 255;
    const l = 0.299 * cr + 0.587 * cg + 0.114 * cb;
    for (let y = Math.max(0, r.y); y < Math.min(CH, r.y + r.h); y++)
      for (let x = Math.max(0, r.x); x < Math.min(CW, r.x + r.w); x++) {
        const i = y * CW + x;
        buf[i] = buf[i] * (1 - r.a) + l * r.a;
      }
  }
  const RAMP = ' .`:-=+*#%@';
  console.log('растеризованная сцена (горизонтальные метки | = граница тайла по X):');
  for (let y = 0; y < CH; y++) {
    let line = '';
    for (let x = 0; x < CW; x++) {
      line += x % T === 0 ? '|' : RAMP[Math.min(10, Math.round(buf[y * CW + x] * 10))];
    }
    if (y % T === 0) line = ('--- y=' + y + ' ').padEnd(12, '-') + line;
    console.log(line);
  }
  // сверка: сколько прямоугольников выходит за пределы сцены
  const oob = rects.filter((r) => r.x < 0 || r.y < 0 || r.x + r.w > CW || r.y + r.h > CH);
  console.log(`rects=${rects.length} out-of-bounds=${oob.length}`);
  process.exit(0);
}

/* ================= СБОРКА SVG ================= */

const DETAILS = [
  ['n1', 'Грань · 1 уровень', 0],
  ['n2', 'Грань · 2 уровня', 0],
  ['n3', 'Грань · 3 уровня', 0],
  ['sideR', 'Боковая грань · E', 0],
  ['sideL', 'Боковая грань · W', 0],
  ['ramp', 'Пандус N', 0],
  ['rampV', 'Пандус · вертикальный стык', 3],
];

const PAD = 32;
const detailW = T * SCALE_DETAIL;
const detailGap = 40;
const detailBlockW = DETAILS.length * (detailW + detailGap) - detailGap;
const sceneW = SCENE_W * T * SCALE_SCENE;
const sceneH = SCENE_H * T * SCALE_SCENE;
const sceneGapX = 56, sceneGapY = 64;
const cols = 2;
const gridW = cols * sceneW + (cols - 1) * sceneGapX;
const gridH = 3 * (sceneH + sceneGapY) - sceneGapY;
const W = Math.max(detailBlockW, gridW) + PAD * 2;
const H = 120 + detailW + 56 + gridH + PAD;

const svg = [];
svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges">`);
svg.push(`  <rect width="${W}" height="${H}" fill="${BG}"/>`);
svg.push(`  <text x="${PAD}" y="42" font-family="monospace" font-size="18" fill="#c8d4e0">tile-geom.ts · рельеф террас (уступы/грани/пандусы) · T=16 · CLIFF_STEP_PX=${CLIFF_STEP_PX}</text>`);
svg.push(`  <text x="${PAD}" y="68" font-family="monospace" font-size="14" fill="#7d8b99">черновик на утверждение · коллизия уже работает, меняется только отрисовка</text>`);

// --- Секция «Детали» ---
let dx = PAD;
const detailY = 104;
svg.push(`  <text x="${PAD}" y="${detailY - 10}" font-family="monospace" font-size="15" fill="#9fb0c0">ДЕТАЛИ (крупный план, биом — скалы)</text>`);
for (const [kind, label, off] of DETAILS) {
  const pal = BIOMES.mountain;
  svg.push(`  <g transform="translate(${dx + off * SCALE_DETAIL},${detailY}) scale(${SCALE_DETAIL})">`);
  svg.push(`    <rect x="0" y="0" width="${T}" height="${T}" fill="#0c1116"/>`);
  svg.push(...buildDetail(kind, pal).map((r) => '    ' + hxAttr(r)));
  svg.push(`  </g>`);
  svg.push(`  <text x="${dx + off * SCALE_DETAIL}" y="${detailY + detailW + 20}" font-family="monospace" font-size="13" fill="#8a98a6">${label}</text>`);
  dx += detailW + detailGap;
}

// --- Секция «Биомы» ---
let sy = detailY + detailW + 56;
svg.push(`  <text x="${PAD}" y="${sy - 12}" font-family="monospace" font-size="15" fill="#9fb0c0">СЦЕНЫ ПО БИОМАМ (6×4 тайла, стены + два пандуса)</text>`);
let i = 0;
for (const [key, pal] of Object.entries(BIOMES)) {
  const col = i % cols, row = (i / cols) | 0;
  const x = PAD + col * (sceneW + sceneGapX);
  const y = sy + row * (sceneH + sceneGapY);
  svg.push(`  <text x="${x}" y="${y - 8}" font-family="monospace" font-size="14" fill="#9fb0c0">${pal.label}</text>`);
  svg.push(`  <g transform="translate(${x},${y}) scale(${SCALE_SCENE})">`);
  svg.push(...buildScene(pal).map((r) => '    ' + hxAttr(r)));
  svg.push(`  </g>`);
  i++;
}

svg.push(`</svg>`);

const outFile = fileURLToPath(new URL('../SVG/relief.svg', import.meta.url));
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, svg.join('\n') + '\n');
console.log(`written ${outFile} (${W}x${H})`);
