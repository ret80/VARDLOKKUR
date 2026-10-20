/* gen-skeleton-preview.mjs — SVG-превью новых врагов: скелет мечник и скелет лучник.
   Пиксель-арт рисуется теми же прямоугольниками (px(x,y,w,h,color)), которые пойдут
   в renderers/enemy/*Renderer.drawBody. Вывод: skeleton-preview.svg (корень репо).
   Запуск: node scripts/gen-skeleton-preview.mjs */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dir, "..", "skeleton-preview.svg");

/* ---------- палитра ---------- */
const B = { light: "#ece6d6", mid: "#cdc5b2", dark: "#9a917d", socket: "#14171d" };
const M = { blade: "#c6d0dd", hi: "#eef2f7", guard: "#7a6238", grip: "#54402a" };
const ARCH = { bow: "#8a6438", string: "#ded7c6", shaft: "#9a7a4a", head: "#dfe6ee", leather: "#6b4f2c" };

/* ячейка: игровая область x -12..18, y -19..11 (30x30 игровых px) */
const Z = 10, CW = 30, CH = 30, OX = 12, OY = 19;

/* ---------- общая основа скелета ---------- */
function skeletonBase(step) {
  const r = [];
  // ноги (шаг анимации как у драугра)
  r.push({ x: -3, y: 1 + step * 0.3, w: 2, h: 4, c: B.dark });
  r.push({ x: 1, y: 1 - step * 0.3, w: 2, h: 4, c: B.mid });
  // таз
  r.push({ x: -3, y: -1, w: 6, h: 2, c: B.mid });
  r.push({ x: -3, y: -1, w: 1, h: 1, c: B.socket });
  r.push({ x: 2, y: -1, w: 1, h: 1, c: B.socket });
  // рёбра
  r.push({ x: -4, y: -8, w: 8, h: 7, c: B.mid });
  for (const y of [-6, -4, -2]) {
    r.push({ x: -3, y, w: 2, h: 1, c: B.socket });
    r.push({ x: 1, y, w: 2, h: 1, c: B.socket });
  }
  // шея + череп
  r.push({ x: -1, y: -9, w: 2, h: 1, c: B.dark });
  r.push({ x: -3, y: -15, w: 6, h: 6, c: B.light });
  r.push({ x: -2, y: -13, w: 1, h: 2, c: B.socket }); // глазницы
  r.push({ x: 1, y: -13, w: 1, h: 2, c: B.socket });
  r.push({ x: -1, y: -11, w: 2, h: 1, c: B.socket }); // нос
  r.push({ x: -2, y: -10, w: 4, h: 1, c: B.socket }); // рот
  r.push({ x: -1, y: -10, w: 1, h: 1, c: B.light });  // зубы
  r.push({ x: 1, y: -10, w: 1, h: 1, c: B.light });
  // задняя рука
  r.push({ x: -5, y: -8, w: 2, h: 5, c: B.dark });
  return r;
}

function quiver() {
  const r = [];
  r.push({ x: -6, y: -9, w: 3, h: 6, c: ARCH.leather }); // колчан
  r.push({ x: -6, y: -12, w: 1, h: 3, c: B.light });     // хвосты стрел
  r.push({ x: -4, y: -12, w: 1, h: 3, c: "#c6d0dd" });
  r.push({ x: -4, y: -7, w: 8, h: 1, c: ARCH.leather });  // ремень через грудь
  return r;
}

/** Лук: вертикальная дуга (1px), выгнутая вперёд (+x), наконечники у xTip */
function bow(ymin, ymax, xTip, curve) {
  const r = [];
  const span = ymax - ymin;
  for (let y = ymin; y < ymax; y++) {
    const t = ((y - ymin) / span) * 2 - 1;
    const x = xTip + Math.round(curve * (1 - t * t));
    r.push({ x, y, w: 1, h: 1, c: ARCH.bow });
  }
  return r;
}

/* ---------- позы: скелет мечник ---------- */
function swordIdle(step) {
  const r = skeletonBase(step);
  r.push({ x: 3, y: -8, w: 2, h: 5, c: B.mid });   // передняя рука
  r.push({ x: 3, y: -3, w: 3, h: 2, c: B.light });  // кисть
  r.push({ x: 4, y: -4, w: 2, h: 3, c: M.grip });   // рукоять
  r.push({ x: 3, y: -5, w: 4, h: 1, c: M.guard });  // гарда
  r.push({ x: 4, y: -14, w: 2, h: 9, c: M.blade }); // клинок
  r.push({ x: 4, y: -14, w: 1, h: 9, c: M.hi });    // блик
  r.push({ x: 5, y: -15, w: 1, h: 1, c: M.hi });    // кончик
  return r;
}

function swordAttack(step) {
  const r = skeletonBase(step);
  r.push({ x: 3, y: -9, w: 4, h: 2, c: B.mid });    // рука вперёд
  r.push({ x: 6, y: -10, w: 2, h: 2, c: B.light });  // кисть
  r.push({ x: 8, y: -11, w: 1, h: 5, c: M.guard });  // гарда (вертикально)
  r.push({ x: 9, y: -10, w: 8, h: 2, c: M.blade });  // клинок горизонтально
  r.push({ x: 9, y: -10, w: 8, h: 1, c: M.hi });     // блик
  r.push({ x: 17, y: -10, w: 1, h: 2, c: M.hi });    // кончик
  return r;
}

/* ---------- позы: скелет лучник ---------- */
function bowIdle(step) {
  const r = skeletonBase(step);
  r.push(...quiver());
  const b = bow(-11, 5, 4, 4);           // лук опущен, рукоять у кисти (y≈-3)
  r.push(...b);
  r.push({ x: 4, y: -11, w: 1, h: 16, c: ARCH.string });
  r.push({ x: 3, y: -8, w: 2, h: 5, c: B.mid });   // передняя рука
  r.push({ x: 5, y: -4, w: 3, h: 2, c: B.light });  // кисть на рукояти
  return r;
}

function bowShoot(step) {
  const r = skeletonBase(step);
  r.push(...quiver());
  r.push(...bow(-16, -2, 5, 4));                 // лук поднят, прицел вперёд
  r.push({ x: 3, y: -10, w: 5, h: 2, c: B.mid });    // передняя рука (держит лук)
  r.push({ x: 7, y: -11, w: 2, h: 3, c: B.light });  // кисть на рукояти
  r.push({ x: 5, y: -16, w: 1, h: 15, c: ARCH.string }); // тетива
  r.push({ x: 5, y: -9, w: 9, h: 1, c: ARCH.shaft });     // стрела
  r.push({ x: 14, y: -10, w: 1, h: 1, c: ARCH.head });    // наконечник
  r.push({ x: 14, y: -9, w: 2, h: 1, c: ARCH.head });
  r.push({ x: 14, y: -8, w: 1, h: 1, c: ARCH.head });
  // задняя рука у тетивы
  r.push({ x: -2, y: -10, w: 4, h: 2, c: B.dark });
  r.push({ x: 2, y: -10, w: 2, h: 2, c: B.light });
  return r;
}

/* ---------- эталон: драугр (дословно из DraugrRenderer, fx=1, step=0, bob=0) ---------- */
function draugr() {
  return [
    { x: -4, y: 1, w: 3, h: 4, c: "#2c3038" },
    { x: 1, y: 1, w: 3, h: 4, c: "#2c3038" },
    { x: -4, y: -8, w: 8, h: 9, c: "#55606c" },
    { x: -3, y: -13, w: 7, h: 6, c: "#8f9aa8" },
    { x: -1, y: -11, w: 1, h: 1, c: "#e05050" },
    { x: 2, y: -11, w: 1, h: 1, c: "#e05050" },
    { x: 5, y: -8, w: 3, h: 8, c: "#4a3e2e" },
    { x: 6, y: -6, w: 1, h: 3, c: "#8a744a" },
  ];
}

/* ---------- SVG ---------- */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function cell(rects, x0, y0, zoom) {
  const z = zoom, cw = CW * z, ch = CH * z;
  let s = `<rect x="${x0}" y="${y0}" width="${cw}" height="${ch}" fill="#171c25"/>`;
  if (zoom >= Z) {
    for (let i = 1; i < CW; i++)
      s += `<line x1="${x0 + i * z}" y1="${y0}" x2="${x0 + i * z}" y2="${y0 + ch}" stroke="#1e2430" stroke-width="1"/>`;
    for (let i = 1; i < CH; i++)
      s += `<line x1="${x0}" y1="${y0 + i * z}" x2="${x0 + cw}" y2="${y0 + i * z}" stroke="#1e2430" stroke-width="1"/>`;
  }
  // линия земли (y=+5) и тень
  const gy = y0 + (5 + OY) * z;
  s += `<line x1="${x0}" y1="${gy}" x2="${x0 + cw}" y2="${gy}" stroke="#2b3444" stroke-width="1"/>`;
  s += `<ellipse cx="${x0 + OX * z}" cy="${gy}" rx="${6 * z}" ry="${2.2 * z}" fill="#05080d" fill-opacity="0.5"/>`;
  for (const r of rects) {
    const a = r.a !== undefined ? ` fill-opacity="${r.a}"` : "";
    s += `<rect x="${x0 + (r.x + OX) * z}" y="${y0 + (r.y + OY) * z}" width="${r.w * z}" height="${r.h * z}" fill="${r.c}"${a}/>`;
  }
  return s;
}

const rows = [
  {
    title: "Скелет мечник",
    sub: "HP 2 · средняя скорость (~50) · атакует мечом в ближнем бою",
    cells: [["Стоит", swordIdle(0)], ["Идёт", swordIdle(2)], ["Атака (выпад)", swordAttack(0)]],
  },
  {
    title: "Скелет лучник",
    sub: "HP 2 · средняя скорость (~50) · стреляет из лука на расстоянии",
    cells: [["Стоит", bowIdle(0)], ["Идёт", bowIdle(2)], ["Выстрел", bowShoot(0)]],
  },
  {
    title: "Драугр — для сравнения",
    sub: "существующий враг: тот же стиль, палитра и масштаб",
    cells: [["Стоит", draugr()]],
  },
];

const PAD = 24, LABEL = 230, GAP = 14, COLS = 3, CELLW = CW * Z, CELLH = CH * Z, ROWH = CELLH + 58;
const W = PAD * 2 + LABEL + COLS * CELLW + (COLS - 1) * GAP;
const H = PAD * 2 + 86 + rows.length * ROWH + 96;

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif">`;
svg += `<rect width="${W}" height="${H}" fill="#10131a"/>`;
svg += `<text x="${PAD}" y="${PAD + 26}" fill="#e7ecf5" font-size="24" font-weight="700">Новые враги подземелья — скелет мечник и скелет лучник</text>`;
svg += `<text x="${PAD}" y="${PAD + 54}" fill="#8b97ad" font-size="15">пиксель-арт в стиле DraugrRenderer · масштаб 10× · сетка = 1 игровой пиксель · взгляд вправо</text>`;

let y = PAD + 86;
for (const row of rows) {
  svg += `<text x="${PAD}" y="${y + 34}" fill="#e7ecf5" font-size="19" font-weight="700">${esc(row.title)}</text>`;
  const words = row.sub.split(" · ");
  words.forEach((wd, i) => {
    svg += `<text x="${PAD}" y="${y + 60 + i * 20}" fill="#8b97ad" font-size="13">${esc(wd)}</text>`;
  });
  const cx0 = PAD + LABEL;
  row.cells.forEach(([name, rects], i) => {
    const x0 = cx0 + i * (CELLW + GAP);
    svg += `<text x="${x0}" y="${y + 16}" fill="#aab6cb" font-size="14" font-weight="600">${esc(name)}</text>`;
    svg += cell(rects, x0, y + 26, Z);
  });
  y += ROWH;
}

/* 1:1 — реальный размер в игре */
svg += `<text x="${PAD}" y="${y + 24}" fill="#e7ecf5" font-size="17" font-weight="700">Реальный размер в игре (1:1)</text>`;
const tiny = [
  ["мечник (стоит)", swordIdle(0)], ["мечник (атака)", swordAttack(0)],
  ["лучник (стоит)", bowIdle(0)], ["лучник (выстрел)", bowShoot(0)], ["драугр", draugr()],
];
let tx = PAD + 240;
const ty = y + 40;
for (const [name, rects] of tiny) {
  svg += cell(rects, tx, ty, 1);
  svg += `<text x="${tx + 2}" y="${ty + CH + 16}" fill="#8b97ad" font-size="12">${esc(name)}</text>`;
  tx += CH + 76;
}

svg += `</svg>`;
writeFileSync(OUT, svg);
console.log(`written: ${OUT} (${W}x${H})`);
