/* ai-system.ts — диспетчер AI врагов.
 *
 * Отвечает только за общее за кадр: таймеры, заморозку, контактный урон, агро/leash.
 * Поведение каждого вида делегируется его `EnemyBrain` из реестра (без switch).
 */

import { query, hasComponent, type World } from 'bitecs';
import {
  Position, Velocity, Enemy, Health, Time, Dead, Shrine, poolGet, StringPool,
} from '../../ecs-components';
import { beginPathTick, clearEnemyPath, resetAllEnemyPaths } from '../enemy-path';
import { zoneFor, T, type WorldData } from '../../../world';
import { isPlayerInVillage } from '../../../world/zones';
import type { EventBus } from '../../../event-bus';
import type { AiContext, EnemyBrain } from './brain';
import type { BrainRegistry } from './brain-registry';
import { createDefaultBrainRegistry } from './behaviors';

// ============================================================
// Константы
// ============================================================

/** Радиус защиты святилища от призраков (в пикселях). */
const SHRINE_PROTECT_RADIUS = 25;
/** Дистанция отрыва: игрок убежал дальше — враг прекращает преследование. */
const LEASH_RANGE = 240;
/** Буфер контакта: урон наносится ДО физического касания, иначе Planck не даёт телам сблизиться. */
const CONTACT_BUFFER = 5 + 3;

// ============================================================
// Состояние за кадр (кэши, сброс путей)
// ============================================================

/** Карта, для которой построены пути врагов (для сброса при смене карты). */
let _lastMap: WorldData | null = null;
/** Кэш `isPlayerNearLitShrine` — вычисляется один раз за кадр. */
let _cachedNearLitShrine: boolean | null = null;

/** Вычислить и закешировать `isPlayerNearLitShrine` на текущий кадр. */
function cachedIsPlayerNearLitShrine(world: World, playerX: number, playerY: number): boolean {
  if (_cachedNearLitShrine === null) {
    _cachedNearLitShrine = isPlayerNearLitShrine(world, playerX, playerY, SHRINE_PROTECT_RADIUS);
  }
  return _cachedNearLitShrine;
}

/** Проверить, находится ли игрок рядом со зажжённым святилищем. */
function isPlayerNearLitShrine(world: World, playerX: number, playerY: number, shrineCheckRadius: number): boolean {
  for (const shrineEid of query(world, [Shrine, Position])) {
    if (Shrine[shrineEid].lit) {
      const d2 = (playerX - Position[shrineEid].x) ** 2 + (playerY - Position[shrineEid].y) ** 2;
      if (d2 < shrineCheckRadius * shrineCheckRadius) return true;
    }
  }
  return false;
}

// ============================================================
// AI система
// ============================================================

export interface AiUpdateArgs {
  world: World;
  playerEid: number;
  map: WorldData;
  dt: number;
  onPlayerDamaged?: (dmg: number, sx: number, sy: number) => void;
  onPlayerSlowed?: (duration: number) => void;
  fogActive?: boolean;
  bus?: EventBus | null;
}

/** Реестр по умолчанию (ленивая инициализация). */
let _defaultRegistry: BrainRegistry | null = null;
function defaultRegistry(): BrainRegistry {
  if (!_defaultRegistry) _defaultRegistry = createDefaultBrainRegistry();
  return _defaultRegistry;
}

/** Обновить все вражеские AI. */
export function aiUpdateSystem(args: AiUpdateArgs): void {
  const { world, playerEid, map, dt } = args;
  if (playerEid < 0 || !map) return;

  // Смена карты — все построенные ранее пути врагов недействительны
  if (_lastMap !== map) {
    resetAllEnemyPaths();
    _lastMap = map;
  }
  // Бюджет поиска пути (A*) за кадр
  beginPathTick();

  // Сброс кэша nearLitShrine — будет вычислен один раз за кадр
  _cachedNearLitShrine = null;

  const playerX = Position[playerEid].x;
  const playerY = Position[playerEid].y;
  const registry = defaultRegistry();

  // Один контекст на кадр: все данные в нём константны в пределах кадра,
  // кэш святилища живёт внутри.
  const frameCtx: AiContext = {
    world,
    map,
    dt,
    playerEid,
    playerX,
    playerY,
    bus: args.bus ?? null,
    onPlayerDamaged: args.onPlayerDamaged ?? (() => {}),
    onPlayerSlowed: args.onPlayerSlowed ?? (() => {}),
    isPlayerNearLitShrine: () => cachedIsPlayerNearLitShrine(world, playerX, playerY),
  };

  // Игрок в поселении — враги там не агрятся
  const inVillage = isInVillage(map, playerX, playerY);

  for (const eid of query(world, [Enemy, Position, Velocity, Health])) {
    if (hasComponent(world, eid, Dead)) continue;
    if (!Enemy[eid]) continue; // AoS элемент может быть undefined

    // --- Общие таймеры ---
    Time[eid].value += dt;
    Enemy[eid].t += dt;
    Enemy[eid].flashT = Math.max(0, Enemy[eid].flashT - dt);
    Enemy[eid].contactCd = Math.max(0, Enemy[eid].contactCd - dt);
    Enemy[eid].lungeT = Math.max(0, Enemy[eid].lungeT - dt);

    // Замороженные враги пропускают AI
    if (Enemy[eid].freezeT > 0) {
      Velocity[eid].x = 0;
      Velocity[eid].y = 0;
      continue;
    }

    const brain = registry.get(poolGet(StringPool.enemyKinds, Enemy[eid].kind));

    // --- Контактный урон (буфер +3: см. CONTACT_BUFFER) ---
    {
      const d2 = (Position[eid].x - playerX) ** 2 + (Position[eid].y - playerY) ** 2;
      const minDist = Enemy[eid].radius + CONTACT_BUFFER;
      if (d2 < minDist * minDist && Enemy[eid].contactCd <= 0) {
        Enemy[eid].contactCd = 0.5;
        Enemy[eid].flashT = 0.12;
        brain.onContact(frameCtx, eid);
      }
    }

    // --- Агро + отвязка (leash) ---
    const d2p = (Position[eid].x - playerX) ** 2 + (Position[eid].y - playerY) ** 2;
    updateAggro(eid, d2p, inVillage, brain.aggroRange);

    // --- Поведение вида ---
    brain.update(frameCtx, eid);
  }
}

/** Игрок в поселении (враги там не агрятся) — см. world/zones.ts. */
function isInVillage(map: WorldData, playerX: number, playerY: number): boolean {
  return isPlayerInVillage(map, playerX, playerY);
}

/** Применить правила агро + отвязки; сбрасывает путь при смене флага. */
function updateAggro(eid: number, d2p: number, inVillage: boolean, aggroR: number): void {
  const aggroBefore = !!Enemy[eid].aggro;
  if (inVillage && aggroBefore) Enemy[eid].aggro = 0;
  if (!aggroBefore && !inVillage && d2p < aggroR * aggroR) Enemy[eid].aggro = 1;
  // Дистанция отрыва: игрок убежал достаточно далеко — погоня прекращается,
  // путь сбрасывается, враг замирает/возвращается домой (см. enemy-path).
  if (!!Enemy[eid].aggro && d2p > LEASH_RANGE * LEASH_RANGE) Enemy[eid].aggro = 0;
  if (aggroBefore !== !!Enemy[eid].aggro) {
    clearEnemyPath(eid);
    if (!Enemy[eid].aggro) {
      Velocity[eid].x = 0;
      Velocity[eid].y = 0;
    }
  }
}
