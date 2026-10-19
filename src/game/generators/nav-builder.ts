/* Генерация навигационной сетки (NavMesh).
 *
 * Полигоны — прямоугольники, точно выровненные по границам клеток: библиотека
 * navmesh строит портал между полигонами только по ОБЩЕМУ краю (коллинеарные
 * рёбра с перекрытием). При ужатии полигонов (shrink) общие края исчезают, и
 * findPath не может перейти между любыми двумя полигонами — раньше меш из
 * NavBuilder был почти непроходим.
 *
 * Стены уступов (map.walls, террасы) лежат НА стыках клеток, а не на самих
 * клетках, поэтому учитываются при:
 *   - разрезании горизонтальных «ранов» (бит E между соседними клетками);
 *   - вертикальном слиянии (бит N по всей ширине полигона);
 *   - валидации порталов: портал, пересекающий солид или закрытый стык,
 *     удаляется из графа (библиотека может связать коллинеарные рёбра,
 *     разделённые «дырой» — это даёт путь сквозь стену).
 */
import { NavMesh } from "navmesh";
import { WorldData, T, idx, inB, isSolidTileId } from "./types";
import { WallBit, edgeOpen } from "./terrain-walls";

/** Горизонтальный прогон непроходимых клеток в строке. */
interface Run { x: number; len: number; id: number }
/** Прямоугольник в клеточных индексах, [x0,x1) × [y0,y1). */
interface Rect { x0: number; x1: number; y0: number; y1: number }

export class NavBuilder {
  public build(w: WorldData): NavMesh {
    const { W, H, walls } = w;

    const solid = (x: number, y: number): boolean =>
      !inB(w, x, y) || isSolidTileId(w.tiles[idx(w, x, y)]);
    /** Открыт ли вертикальный стык клеток (x,y)|(x+1,y) — нет стены уступа. */
    const hOpen = (x: number, y: number): boolean =>
      !walls || edgeOpen(walls, idx(w, x, y), idx(w, x + 1, y), WallBit.E);
    /** Открыт ли горизонтальный стык клеток (x,y)/(x,y+1) — нет стены уступа. */
    const vOpen = (x: number, y: number): boolean =>
      !walls || edgeOpen(walls, idx(w, x, y), idx(w, x, y + 1), WallBit.N);

    /* 1. Прогоны по строкам: рвёмся на солидах И на стенах уступов. */
    const rows: Run[][] = [];
    let id = 0;
    for (let y = 0; y < H; y++) {
      const rs: Run[] = [];
      let x = 0;
      while (x < W) {
        if (solid(x, y)) { x++; continue; }
        let len = 1;
        while (x + len < W && !solid(x + len, y) && hOpen(x + len - 1, y)) len++;
        rs.push({ x, len, id: id++ });
        x += len;
      }
      rows.push(rs);
    }

    /* 2. Вертикальное слияние: ран снизу, ПОКРЫВАЮЩИЙ диапазон сверху,
          съедается посередине, остатки (слева/справа) возвращаются в строку
          как отдельные раны. Так прямоугольники получаются максимально
          крупными, а клетки не теряются (широкий ран больше не «съедается»
          целиком, как было раньше). Слияние требует открытого стыка по всей
          ширине диапазона — стена уступа рвёт полигон. */
    const rects: Rect[] = [];
    const used = new Set<number>();
    for (let y = 0; y < H; y++) {
      for (const r of rows[y]) {
        if (used.has(r.id)) continue;
        used.add(r.id);
        const x0 = r.x, x1 = r.x + r.len;
        let y1 = y + 1;
        merge: while (y1 < H) {
          const bi = rows[y1].findIndex((b) => !used.has(b.id) && b.x <= x0 && b.x + b.len >= x1);
          if (bi < 0) break;
          for (let cx = x0; cx < x1; cx++) if (!vOpen(cx, y1 - 1)) break merge;
          // Покрытая часть вливается в текущий прямоугольник.
          const b = rows[y1][bi];
          used.add(b.id);
          const parts: Run[] = [];
          if (b.x < x0) parts.push({ x: b.x, len: x0 - b.x, id: id++ });
          parts.push({ x: x0, len: x1 - x0, id: b.id }); // id покрытой части (used)
          if (b.x + b.len > x1) parts.push({ x: x1, len: b.x + b.len - x1, id: id++ });
          rows[y1].splice(bi, 1, ...parts);
          y1++;
        }
        rects.push({ x0, x1, y0: y, y1 });
      }
    }

    /* 3. Полигоны: прямоугольники без ужатия. Разрезаем по колонкам там, где
          верхний/нижний стык меняется с «открыт» на «закрытый» — так границы
          полигонов совпадают с границами открытых участков, и порталы
          строятся только там, где проход реально есть. */
    const polys: { x: number; y: number }[][] = [];
    for (const rc of rects) {
      const upOpen = (cx: number): boolean =>
        rc.y0 > 0 && !solid(cx, rc.y0 - 1) && vOpen(cx, rc.y0 - 1);
      const downOpen = (cx: number): boolean =>
        rc.y1 < H && !solid(cx, rc.y1) && vOpen(cx, rc.y1 - 1);
      let start = rc.x0;
      for (let cx = rc.x0 + 1; cx <= rc.x1; cx++) {
        if (cx === rc.x1 || upOpen(cx) !== upOpen(cx - 1) || downOpen(cx) !== downOpen(cx - 1)) {
          polys.push([
            { x: start * T, y: rc.y0 * T },
            { x: cx * T, y: rc.y0 * T },
            { x: cx * T, y: rc.y1 * T },
            { x: start * T, y: rc.y1 * T },
          ]);
          start = cx;
        }
      }
    }

    const mesh = new NavMesh(polys, 0);
    validatePortals(mesh, w);
    return mesh;
  }
}

/**
 * Привести порталы к «честной» длине.
 *
 * Библиотека считает порталом любое перекрытие коллинеарных рёбер — в том
 * числе участки стыка, закрытые стеной уступа, и зазор между двумя полигонами
 * на одной линии. Раньше такой портал вырезался целиком, из-за чего терялась
 * связность даже там, где БОЛЬШАЯ часть общего края открыта (широкий rect со
 * стеной уступа только на одной клетке по высоте). Теперь портал УЖИМАЕТСЯ
 * до самого длинного открытого подотрезка (стыки кратны клетке, поэтому
 * подотрезки клеточные); если открытых нет — пара вырезается из графа.
 *
 * Порядок точек start/end сохраняется: библиотека ориентирует портал относительно
 * центроида каждого полигона, и перепутанный порядок ломает string-pulling.
 */
function validatePortals(mesh: NavMesh, w: WorldData): void {
  const { W, H, walls } = w;
  const walk = (x: number, y: number): boolean =>
    inB(w, x, y) && !isSolidTileId(w.tiles[idx(w, x, y)]);
  /** Проходим ли вертикальный стык на линии x*T между клетками (x-1,y),(x,y). */
  const seamH = (x: number, y: number): boolean =>
    x > 0 && x < W && walk(x - 1, y) && walk(x, y) &&
    (!walls || edgeOpen(walls, idx(w, x - 1, y), idx(w, x, y), WallBit.E));
  /** Проходим ли горизонтальный стык на линии y*T между клетками (x,y-1),(x,y). */
  const seamV = (x: number, y: number): boolean =>
    y > 0 && y < H && walk(x, y - 1) && walk(x, y) &&
    (!walls || edgeOpen(walls, idx(w, x, y - 1), idx(w, x, y), WallBit.N));

  /** Открытые подотрезки сегмента вдоль вертикальной линии x*T. */
  const openRunsV = (x: number, a: number, b: number): Array<[number, number]> => {
    const runs: Array<[number, number]> = [];
    const y0 = Math.floor(a / T), y1 = Math.floor((b - 1e-9) / T);
    for (let ky = y0; ky <= y1; ky++) {
      if (!seamH(x, ky)) continue;
      const lo = Math.max(a, ky * T), hi = Math.min(b, (ky + 1) * T);
      const last = runs[runs.length - 1];
      if (last && last[1] >= lo - 1e-9) last[1] = Math.max(last[1], hi);
      else runs.push([lo, hi]);
    }
    return runs;
  };
  /** Открытые подотрезки сегмента вдоль горизонтальной линии y*T. */
  const openRunsH = (y: number, a: number, b: number): Array<[number, number]> => {
    const runs: Array<[number, number]> = [];
    const x0 = Math.floor(a / T), x1 = Math.floor((b - 1e-9) / T);
    for (let kx = x0; kx <= x1; kx++) {
      if (!seamV(kx, y)) continue;
      const lo = Math.max(a, kx * T), hi = Math.min(b, (kx + 1) * T);
      const last = runs[runs.length - 1];
      if (last && last[1] >= lo - 1e-9) last[1] = Math.max(last[1], hi);
      else runs.push([lo, hi]);
    }
    return runs;
  };

  type Portal = { start: { x: number; y: number }; end: { x: number; y: number } };
  type Poly = { id: number; neighbors: Poly[]; portals: Portal[] };
  /** Новый портал того же класса Point, что и у библиотеки (.equals и пр.). */
  const retarget = (proto: Portal, s: { x: number; y: number }, e: { x: number; y: number }): Portal => {
    const C = (proto.start as unknown as { constructor: new (x: number, y: number) => unknown }).constructor;
    return { start: new C(s.x, s.y) as unknown as { x: number; y: number }, end: new C(e.x, e.y) as unknown as { x: number; y: number } };
  };
  const all = mesh.getPolygons() as unknown as Poly[];
  const drop = new Map<Poly, Set<number>>();
  const seen = new Set<string>();
  const mark = (p: Poly, i: number): void => {
    let s = drop.get(p);
    if (!s) { s = new Set(); drop.set(p, s); }
    s.add(i);
  };
  const EPS = 1e-6;
  for (const p of all) {
    for (let i = 0; i < p.neighbors.length; i++) {
      const n = p.neighbors[i];
      const key = p.id < n.id ? `${p.id}:${n.id}` : `${n.id}:${p.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const portal = p.portals[i];
      if (!portal) { mark(p, i); mark(n, n.neighbors.indexOf(p)); continue; }
      const { start, end } = portal;
      const vertical = Math.abs(start.x - end.x) < EPS;
      let runs: Array<[number, number]>;
      let lo: number, hi: number; // открытый подотрезок вдоль оси сегмента
      if (vertical) {
        const kx = Math.round(start.x / T);
        lo = Math.min(start.y, end.y); hi = Math.max(start.y, end.y);
        runs = openRunsV(kx, lo, hi);
      } else {
        const ky = Math.round(start.y / T);
        lo = Math.min(start.x, end.x); hi = Math.max(start.x, end.x);
        runs = openRunsH(ky, lo, hi);
      }
      if (runs.length === 0) { mark(p, i); mark(n, n.neighbors.indexOf(p)); continue; }
      let best = runs[0];
      for (const r of runs) if (r[1] - r[0] > best[1] - best[0]) best = r;
      const fullOpen = runs.length === 1 && Math.abs(best[0] - lo) < EPS && Math.abs(best[1] - hi) < EPS;
      if (fullOpen) continue;
      if (best[1] - best[0] < EPS) { mark(p, i); mark(n, n.neighbors.indexOf(p)); continue; }
      // Ужимаем: сохраняем порядок start→end исходного портала.
      const alongStart = vertical ? start.y : start.x;
      const firstIsStart = Math.abs(alongStart - best[0]) <= Math.abs(alongStart - best[1]);
      const mk = (v: number): { x: number; y: number } =>
        vertical ? { x: start.x, y: v } : { x: v, y: start.y };
      const ns = mk(firstIsStart ? best[0] : best[1]);
      const ne = mk(firstIsStart ? best[1] : best[0]);
      p.portals[i] = retarget(portal, ns, ne);
      const j = n.neighbors.indexOf(p);
      if (j >= 0) {
        // У соседа тот же сегмент, но ориентация его собственная — ужимаем с
        // сохранением ЕГО порядка точек.
        const np = n.portals[j];
        const nAlong = vertical ? np.start.y : np.start.x;
        const nFirst = Math.abs(nAlong - best[0]) <= Math.abs(nAlong - best[1]);
        const mkN = (v: number): { x: number; y: number } =>
          vertical ? { x: np.start.x, y: v } : { x: v, y: np.start.y };
        n.portals[j] = retarget(np, mkN(nFirst ? best[0] : best[1]), mkN(nFirst ? best[1] : best[0]));
      }
    }
  }
  for (const [p, idxs] of drop) {
    for (const i of [...idxs].sort((a, b) => b - a)) {
      p.neighbors.splice(i, 1);
      p.portals.splice(i, 1);
    }
  }
}
