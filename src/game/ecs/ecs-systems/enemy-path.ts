/* enemy-path.ts — построение пути врагов через NavMesh.
 *
 * Раньше враги шли «напрямую» к игроку и застревали об уступы террас. Здесь:
 *   - путь ищется через `map.nav.findPath` (NavMesh) с репассом каждые 0.5с;
 *   - движение — по waypoints с отсечением углов (radius waypoint);
 *   - детекция застревания: если враг не двигается, направление сдвигается
 *     вдоль препятствия, а путь пересчитывается немедленно;
 *   - «дом»: запоминается позиция первого спавна, после отвязки от игрока
 *     враг возвращается домой по пути, а не бредёт по прямой в стену.
 */
import type { NavMesh } from "navmesh";
import { Position, Enemy } from "../ecs-components";
import { T, idx, inB, isSolidTileId, type WorldData } from "../../generators/types";

/** Период пересчёта пути (сек). */
const REPATH_TIME = 0.5;
/** Радиус, в котором waypoint считается достигнутым (отсечение углов). */
const WAYPOINT_R = 7;
/** Цель удалилась дальше порога — пересчитать путь немедленно. */
const TARGET_REPATH_DIST = 40;
/** Сколько секунд враг может «упираться» قبل смены тактики. */
const STUCK_T = 0.4;
/** Радиус, ближе которого враг считается вернувшимся домой. */
const HOME_RADIUS = 48;
/** Бюджет поиска пути за кадр — чтобы dozens врагов не считали A* разом. */
const REPATHS_PER_FRAME = 10;

let _repathBudget = REPATHS_PER_FRAME;

/** Сбросить бюджет поиска пути — вызывается один раз за кадр (в AI-системе). */
export function beginPathTick(): void {
  _repathBudget = REPATHS_PER_FRAME;
}

interface PathState {
  /** Точки пути (без стартовой), Vector2-подобные. */
  pts: { x: number; y: number }[];
  /** Текущий waypoint. */
  i: number;
  repathT: number;
  /** Цель на момент последнего репасса. */
  tx: number;
  ty: number;
  /** Позиция врага на момент последнего кадра (для детекции застревания). */
  px: number;
  py: number;
  stuckT: number;
  forceRepath: boolean;
  /** Дом (место первого спавна); 0,0 = ещё не записан. */
  homeX: number;
  homeY: number;
}

const states = new Map<number, PathState>();

function stateFor(eid: number): PathState {
  let st = states.get(eid);
  if (!st) {
    st = { pts: [], i: 0, repathT: 0, tx: Infinity, ty: Infinity, px: 0, py: 0, stuckT: 0, forceRepath: false, homeX: 0, homeY: 0 };
    states.set(eid, st);
  }
  return st;
}

/** Забыть врага (смерть/удаление сущности). */
export function forgetEnemyPath(eid: number): void {
  states.delete(eid);
}

/** Сбросить все пути (смена карты). */
export function resetAllEnemyPaths(): void {
  states.clear();
}

/**
 * Сбросить путь врага, сохранив «дом»: вызывается при потере агро — враг
 * прекращает погоню, а при следующей погоне строит новый путь.
 */
export function clearEnemyPath(eid: number): void {
  const st = states.get(eid);
  if (!st) return;
  st.pts = [];
  st.i = 0;
  st.repathT = 0;
  st.forceRepath = false;
  st.stuckT = 0;
  st.tx = Infinity;
  st.ty = Infinity;
}

/** Ближайшая проходимая клетка к точке (для стартовой/конечной точки пути). */
function snapToCell(w: WorldData, x: number, y: number): { x: number; y: number } {
  const cx = Math.floor(x / T), cy = Math.floor(y / T);
  const ok = (tx: number, ty: number): boolean =>
    inB(w, tx, ty) && !isSolidTileId(w.tiles[idx(w, tx, ty)]);
  if (ok(cx, cy)) return { x: cx * T + T / 2, y: cy * T + T / 2 };
  for (let r = 1; r <= 4; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (ok(cx + dx, cy + dy)) return { x: (cx + dx) * T + T / 2, y: (cy + dy) * T + T / 2 };
      }
    }
  }
  return { x, y };
}

function repath(st: PathState, eid: number, map: WorldData, targetX: number, targetY: number): void {
  st.repathT = REPATH_TIME;
  st.tx = targetX;
  st.ty = targetY;
  st.forceRepath = false;
  st.stuckT = 0;

  if (_repathBudget <= 0) return; // перепроверим в ближайшие кадры
  _repathBudget--;

  const pos = Position[eid];
  const nav = map.nav as NavMesh | null;
  let pts: { x: number; y: number }[] = [];
  if (nav && typeof nav.findPath === "function") {
    // Точки пути привязываются к центрам клеток: центр всегда лежит внутри
    // полигона меша, даже если враг прижат к стене уступа.
    const from = snapToCell(map, pos.x, pos.y);
    const to = snapToCell(map, targetX, targetY);
    const found = nav.findPath(from, to);
    if (found && found.length) {
      pts = found.map((p) => ({ x: p.x, y: p.y }));
      // Отбросить стартовую точку (центр текущей клетки врага).
      while (pts.length && (pts[0].x - pos.x) ** 2 + (pts[0].y - pos.y) ** 2 < (T / 2) ** 2) pts.shift();
    }
  }
  st.pts = pts;
  st.i = 0;
}

/**
 * Скорость преследования по NavMesh-пути к цели.
 *
 * Возвращает вектор velocity (нормированный × speed). Fallback — движение
 * напрямую (карта без меша или путь не найден).
 */
export function chaseVelocity(
  eid: number,
  map: WorldData,
  targetX: number,
  targetY: number,
  speed: number,
  dt: number
): { x: number; y: number } {
  const pos = Position[eid];
  if (!pos || speed <= 0) return { x: 0, y: 0 };
  const st = stateFor(eid);

  st.repathT -= dt;
  const targetMoved = Math.hypot(targetX - st.tx, targetY - st.ty);
  if (st.forceRepath || st.repathT <= 0 || targetMoved > TARGET_REPATH_DIST) {
    repath(st, eid, map, targetX, targetY);
  }

  // Цель движения: ближайший waypoint (с отсечением достигнутых), либо сама
  // цель, если путь кончился.
  let gx = targetX, gy = targetY;
  if (st.pts.length > 0) {
    while (st.i < st.pts.length - 1) {
      const wp = st.pts[st.i];
      if ((wp.x - pos.x) ** 2 + (wp.y - pos.y) ** 2 <= WAYPOINT_R * WAYPOINT_R) st.i++;
      else break;
    }
    if (st.i < st.pts.length - 1) {
      gx = st.pts[st.i].x;
      gy = st.pts[st.i].y;
    }
    if (Enemy[eid]) Enemy[eid].pathI = st.i;
  }

  let dx = gx - pos.x, dy = gy - pos.y;
  const dd = Math.hypot(dx, dy);
  if (dd < 0.5) { st.stuckT = 0; return { x: 0, y: 0 }; }
  dx /= dd;
  dy /= dd;

  // Детекция застревания: DesiredVelocity > 0, но позиция не меняется
  // (упёрся в уступ/стену/другого врага). Тогда скользим вдоль препятствия
  // и принудительно пересчитываем путь.
  const moved = Math.hypot(pos.x - st.px, pos.y - st.py);
  if (moved < speed * dt * 0.3) st.stuckT += dt;
  else st.stuckT = Math.max(0, st.stuckT - dt * 2);
  st.px = pos.x;
  st.py = pos.y;

  if (st.stuckT > STUCK_T) {
    const side = eid % 2 === 0 ? 1 : -1;
    const ang = Math.atan2(dy, dx) + side * 1.2;
    dx = Math.cos(ang);
    dy = Math.sin(ang);
    st.forceRepath = true;
  }

  return { x: dx * speed, y: dy * speed };
}

/**
 * Скорость возврата домой (к месту спавна). null — враг и так у дома,
 * пусть бродит на месте (поведение вызывающего).
 */
export function homeVelocity(
  eid: number,
  map: WorldData,
  speed: number,
  dt: number
): { x: number; y: number } | null {
  const pos = Position[eid];
  if (!pos) return null;
  const st = stateFor(eid);
  if (st.homeX === 0 && st.homeY === 0) {
    st.homeX = pos.x;
    st.homeY = pos.y;
    return null;
  }
  const d2 = (pos.x - st.homeX) ** 2 + (pos.y - st.homeY) ** 2;
  if (d2 < HOME_RADIUS * HOME_RADIUS) return null;
  return chaseVelocity(eid, map, st.homeX, st.homeY, speed, dt);
}
