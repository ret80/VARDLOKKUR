/* fog-system.ts — туман топов на основе ECS.
 *
 * Туман привязан к биому SWAMP: сильнее ближе к алтарю Древа, слабее на
 * окраинах болота. При 5 Рунах (или после смерти Змея) туман и призраки
 * рассеиваются совсем. Волны тумана удалены.
 *
 * Призраки две группы:
 *  - алтарные (leashed к treeAltar): max(0, 5 - руны);
 *  - бродячие по всему болоту: max(0, 5 - руны).
 * Пока игрок в топях — группы поддерживаются по целевому числу, убитые
 * воскресают с задержкой, лишние (при росте рун) уходят в dissipate.
 */

import { query, type World } from 'bitecs';
import {
  Position,
  Enemy,
  EnemyState,
  poolGet,
  StringPool,
} from '../ecs-components';
import { T } from '../../world';
import { Biome, Tl, isSolidTileId } from '../../generators/types';
import { audio } from '../../audio';
import { logger } from '../../debug/logger';

// ============================================================
// Конфигурация тумана
// ============================================================

// --- Интенсивность тумана по расстоянию до алтаря ---
const FOG_ALPHA_BASE = 0.30;          // туман вдали от алтаря (вошёл в топи)
const FOG_ALPHA_ALTAR = 1.0;          // плотный туман у алтаря
const FOG_DIST_FULL = 720;            // дистанция до алтаря, на которой туман максимальный (px)

// --- Круг ясности вокруг игрока ---
const FOG_RADIUS_FAR = 420;           // радиус ясности вдали от алтаря
const FOG_RADIUS_NEAR = 220;          // радиус ясности у алтаря

// --- Скорости интерполяции ---
const FOG_ALPHA_SPEED = 0.5;          // скорость изменения альфы
const FOG_RADIUS_SPEED = 1.2;         // скорость интерполяции радиуса

// --- Призраки ---
const GHOST_COUNT_ALTAR = 5;          // базовое число призраков у алтаря
const GHOST_COUNT_WANDER = 5;         // базовое число бродячих призраков
const GHOST_COUNT_MAX = 5;            // жёсткий потолок на группу
const GHOST_SPAWN_MIN_DIST = 110;     // минимальная дистанция спавна от игрока
const GHOST_SPAWN_MAX_DIST = 520;     // максимальная дистанция спавна от игрока
const GHOST_STATE_T_BASE = 1.5;       // базовое время appear
const GHOST_STATE_T_RAND = 0.5;       // разброс времени appear
const GHOST_FOG_ONLY = 1;             // флаг: только для тумана
const GHOST_RESPAWN_ALTAR = 12;       // задержка воскрешения алтарного призрака (сек)
const GHOST_RESPAWN_WANDER = 15;      // задержка воскрешения бродячего призрака (сек)
const ALTAR_ORBIT_KEEP_OUT = 150;     // бродячие не спавнятся ближе этого к алтарю

export { GHOST_RESPAWN_ALTAR, GHOST_RESPAWN_WANDER };

// ============================================================
// Fog State Interface
// ============================================================

export interface FogState {
  /** Туман проявлен (игрок был/есть в зоне топов) */
  fogActive: boolean;
  /** Игрок сейчас в зоне тумана (топи) */
  fogAmbient: boolean;
  fogRadius: number;
  /** Плавная альфа тумана (0..1) — интерполируется к fogAlphaTarget */
  fogAlpha: number;
  fogAlphaTarget: number;
  ghostClangT: number;
  /** Таймер до воскрешения алтарного/бродячего призрака после убийства */
  altarRespawnT: number;
  wanderRespawnT: number;
  /** Приветственный тост показан */
  introShown: boolean;
}

export function createFogState(): FogState {
  return {
    fogActive: false,
    fogAmbient: false,
    fogRadius: FOG_RADIUS_FAR,
    fogAlpha: 0,
    fogAlphaTarget: 0,
    ghostClangT: 0,
    altarRespawnT: 0,
    wanderRespawnT: 0,
    introShown: false,
  };
}

// ============================================================
// Топи: кэш проходимых клеток болота
// ============================================================

const swampTilesCache = new WeakMap<object, Int32Array>();

/** Проходимые клетки биома SWAMP (индексы tiles/biomes). Кэшируется по map. */
export function swampTilesFor(map: any): Int32Array {
  const cached = swampTilesCache.get(map);
  if (cached) return cached;
  const list: number[] = [];
  if (map && map.biomes && map.tiles && map.W && map.H && !map.isDungeon) {
    for (let y = 0; y < map.H; y++) {
      for (let x = 0; x < map.W; x++) {
        const i = y * map.W + x;
        if (map.biomes[i] !== Biome.SWAMP) continue;
        const t = map.tiles[i];
        if (isSolidTileId(t) || t === Tl.WATER || t === Tl.POOL) continue;
        list.push(i);
      }
    }
  }
  const arr = Int32Array.from(list);
  swampTilesCache.set(map, arr);
  if (arr.length === 0) logger.warn('fog', 'swampTilesFor: в карте нет проходимых клеток болота');
  return arr;
}

/** Случайная точка болота (мировые координаты). null — болото недоступно. */
function randomSwampPoint(map: any): { x: number; y: number } | null {
  const tiles = swampTilesFor(map);
  if (tiles.length === 0) return null;
  const i = tiles[Math.floor(Math.random() * tiles.length)];
  const tx = i % map.W;
  const ty = Math.floor(i / map.W);
  return { x: tx * T + 8, y: ty * T + 8 };
}

// ============================================================
// Обновление тумана
// ============================================================

/** Обновить туман */
export function fogUpdateSystem(
  world: World,
  playerEid: number,
  dt: number,
  rdt: number,
  fogState: FogState,
  map: any,
  flags: any,
  bus: any,
  spawnEnemyInEcs: (kind: string, x: number, y: number) => number
): void {
  if (!map || playerEid < 0) return;

  const f = flags;
  const px = Position[playerEid].x;
  const py = Position[playerEid].y;

  fogState.ghostClangT = Math.max(0, fogState.ghostClangT - dt);

  // Плавная интерполяция альфы тумана
  fogState.fogAlpha += (fogState.fogAlphaTarget - fogState.fogAlpha) * Math.min(1, rdt * FOG_ALPHA_SPEED);

  const runes = f.runes || 0;

  // === Туман рассеян: подземелье, смерть Змея, собраны все 5 Рун ===
  if (map.isDungeon || f.snakeDead || runes >= 5) {
    fogState.fogRadius += (FOG_RADIUS_FAR - fogState.fogRadius) * Math.min(1, rdt * FOG_RADIUS_SPEED);
    if (fogState.fogAmbient || fogState.fogActive) {
      fogState.fogAmbient = false;
      fogState.fogActive = false;
      fogState.fogAlphaTarget = 0;
      audio.setFog(false);
    }
    // При 5 Рунах — рассеиваются и алтарные, и бродячие призраки
    if (runes >= 5 || f.snakeDead) {
      ensureGhosts(world, 0, true, map, px, py, spawnEnemyInEcs, false);
      ensureGhosts(world, 0, false, map, px, py, spawnEnemyInEcs, false);
    }
    return;
  }

  // === Игрок в топях? ===
  const tx = Math.floor(px / T);
  const ty = Math.floor(py / T);
  const inSwamp = !!(map.biomes && tx >= 0 && ty >= 0 && tx < map.W && ty < map.H)
    && map.biomes[ty * map.W + tx] === Biome.SWAMP;

  if (inSwamp) {
    // Чем ближе к алтарю — тем сильнее туман
    const ax = map.treeAltar.x * T + 8;
    const ay = map.treeAltar.y * T + 8;
    const d = Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
    const s = Math.max(0, Math.min(1, 1 - d / FOG_DIST_FULL));

    fogState.fogActive = true;
    fogState.fogAlphaTarget = FOG_ALPHA_BASE + (FOG_ALPHA_ALTAR - FOG_ALPHA_BASE) * s;
    const radiusTarget = FOG_RADIUS_FAR + (FOG_RADIUS_NEAR - FOG_RADIUS_FAR) * s;
    fogState.fogRadius += (radiusTarget - fogState.fogRadius) * Math.min(1, rdt * FOG_RADIUS_SPEED);

    if (!fogState.fogAmbient) {
      fogState.fogAmbient = true;
      audio.setFog(true);
      if (!fogState.introShown) {
        fogState.introShown = true;
        bus.emit('toast', { msg: 'Топи дышат туманом — Древо не отпустит просто так' });
      }
    }

    // Таймеры воскрешения
    fogState.altarRespawnT = Math.max(0, fogState.altarRespawnT - dt);
    fogState.wanderRespawnT = Math.max(0, fogState.wanderRespawnT - dt);

    // Поддержка групп призраков: max(0, 5 - руны)
    const altarTarget = Math.max(0, GHOST_COUNT_ALTAR - runes);
    const wanderTarget = Math.max(0, GHOST_COUNT_WANDER - runes);
    ensureGhosts(world, altarTarget, true, map, px, py, spawnEnemyInEcs, fogState.altarRespawnT <= 0);
    ensureGhosts(world, wanderTarget, false, map, px, py, spawnEnemyInEcs, fogState.wanderRespawnT <= 0);
    return;
  }

  // === Игрок вне топов — туман стихает, призраки рассеиваются ===
  fogState.fogRadius += (FOG_RADIUS_FAR - fogState.fogRadius) * Math.min(1, rdt * FOG_RADIUS_SPEED);
  if (fogState.fogAmbient) {
    fogState.fogAmbient = false;
    fogState.fogActive = false;
    fogState.fogAlphaTarget = 0;
    audio.setFog(false);
    bus.emit('fog:altarLeave', {});
  }
}

// ============================================================
// Поддержка групп призраков
// ============================================================

/**
 * Поддержать целевое число призраков одной группы.
 * - alive > target → лишние уходят в dissipate;
 * - alive < target && canSpawn → спавнится один призрак.
 *
 * @param leashed true — группа алтарных (leashed к treeAltar), false — бродячие по болоту
 */
export function ensureGhosts(
  world: World,
  target: number,
  leashed: boolean,
  map: any,
  px: number,
  py: number,
  spawnEnemyInEcs: (kind: string, x: number, y: number) => number,
  canSpawn: boolean = true
) {
  const T0 = 16;
  const group: number[] = [];

  for (const eid of query(world, [Enemy])) {
    const enemyData = Enemy[eid];
    if (!enemyData) {
      logger.warn('fog', `ensureGhosts: Enemy[${eid}] is undefined (Enemy.length=${Enemy.length})`);
      continue; // AoS элемент может быть undefined
    }
    if (poolGet(StringPool.enemyKinds, enemyData.kind) !== 'ghost') continue;
    const isLeashed = enemyData.leashX !== 0 || enemyData.leashY !== 0;
    if (isLeashed !== leashed) continue;
    if (enemyData.state === EnemyState.dissipate) continue; // уже исчезает
    group.push(eid);
  }

  // Лишние — рассеиваем
  if (group.length > target) {
    for (let i = target; i < group.length; i++) {
      Enemy[group[i]].state = EnemyState.dissipate;
    }
    return;
  }

  if (group.length >= target || !canSpawn) return;

  // ── Определяем точку спавна ──
  const altarX = map.treeAltar.x * T0 + 8;
  const altarY = map.treeAltar.y * T0 + 8;
  let x: number;
  let y: number;

  if (leashed) {
    // Алтарные: кольцо вокруг алтаря
    const a = Math.random() * Math.PI * 2;
    const d = GHOST_SPAWN_MIN_DIST + Math.random() * 60;
    x = altarX + Math.cos(a) * d;
    y = altarY + Math.sin(a) * d;
  } else {
    // Бродячие: клетка болота вне орбиты алтаря и в допустимой дистанции от игрока
    let pt: { x: number; y: number } | null = null;
    for (let tries = 0; tries < 12; tries++) {
      const cand = randomSwampPoint(map);
      if (!cand) return;
      const dAltar = Math.sqrt((cand.x - altarX) ** 2 + (cand.y - altarY) ** 2);
      const dPlayer = Math.sqrt((cand.x - px) ** 2 + (cand.y - py) ** 2);
      if (dAltar > ALTAR_ORBIT_KEEP_OUT && dPlayer >= GHOST_SPAWN_MIN_DIST && dPlayer <= GHOST_SPAWN_MAX_DIST) {
        pt = cand;
        break;
      }
      pt = cand; // запасной вариант, если ограничения не выполнены
    }
    if (!pt) return;
    x = pt.x;
    y = pt.y;
  }

  if (x < T0 || y < T0 || x > (map.W - 1) * T0 || y > (map.H - 1) * T0) return;

  const eid = spawnEnemyInEcs('ghost', x, y);
  if (eid < 0) return;
  Enemy[eid].aggro = 1;
  Enemy[eid].state = EnemyState.appear;
  Enemy[eid].stateT = GHOST_STATE_T_BASE + Math.random() * GHOST_STATE_T_RAND;
  Enemy[eid].fade = 0; // начать с полной прозрачности для плавного появления
  Enemy[eid].fogOnly = GHOST_FOG_ONLY;
  // Привязка к алтарю
  if (leashed) {
    Enemy[eid].leashX = altarX;
    Enemy[eid].leashY = altarY;
  }
}
