/* interaction-handlers.ts — Strategy Pattern для взаимодействия (SOLID) */

import { query, type World } from 'bitecs';
import { EventBus } from '../../event-bus';
import { GameStore } from '../../store';
import { audio } from '../../audio';
import {
  Position,
  Chest,
  Pedestal,
  Shrine,
  poolGet,
  StringPool,
} from '../ecs-components';
import { logger } from '../../debug/logger';
import type { GuardSpawnCallback } from './interaction-system';
import type { InteractableHit } from './interaction-system';

// ============================================================
// Контекст
// ============================================================

/** Контекст для обработчиков взаимодействия */
export interface InteractionContext {
  world: World;
  store: GameStore;
  bus: EventBus;
  onDialogue: (id: string) => void;
  onGuardSpawn?: GuardSpawnCallback;
  dungeonRegistry?: DungeonUnlockRegistry;
  chestItemRegistry?: ChestItemHandlerRegistry;
  playerX?: number;
  playerY?: number;
}

// ============================================================
// Интерфейсы
// ============================================================

/** Интерфейс обработчика взаимодействия */
export interface InteractionHandler {
  /** Тип интерактивного объекта (совпадает с hit.kind) */
  kind: string;

  /**
   * Обработка взаимодействия.
   * @returns true если объект найден и обработан, false — игнорировать
   */
  handle(
    world: World,
    eid: number,
    ref: any,
    ctx: InteractionContext
  ): boolean;
}

/** Интерфейс обработчика предмета в сундуке */
export interface ChestItemHandler {
  itemKind: string; // 'bow' | 'sword' | 'arrows' | 'heartPiece' | 'key'
  handle(chestEid: number, store: GameStore, bus: EventBus): void;
}

/** Интерфейс проверки разблокировки подземелья */
export interface DungeonUnlockChecker {
  dungeonId: number;
  check(flags: any): { ok: boolean; req: string };
}

// ============================================================
// Реестры
// ============================================================

/** Реестр обработчиков взаимодействия */
export class InteractionHandlerRegistry {
  private handlers = new Map<string, InteractionHandler>();

  register(handler: InteractionHandler): this {
    this.handlers.set(handler.kind, handler);
    return this;
  }

  interact(hit: InteractableHit, ctx: InteractionContext): boolean {
    const handler = this.handlers.get(hit.kind);
    if (!handler) {
      logger.warn('interaction', `No handler for interact kind: ${hit.kind}`);
      return false;
    }
    return handler.handle(ctx.world, hit.eid, hit.ref, ctx);
  }
}

/** Реестр обработчиков предметов в сундуках */
export class ChestItemHandlerRegistry {
  private handlers = new Map<string, ChestItemHandler>();

  register(handler: ChestItemHandler): this {
    this.handlers.set(handler.itemKind, handler);
    return this;
  }

  collect(itemKind: string, chestEid: number, store: GameStore, bus: EventBus): void {
    const handler = this.handlers.get(itemKind);
    if (!handler) {
      logger.warn('interaction', `No chest item handler: ${itemKind}`);
      return;
    }
    handler.handle(chestEid, store, bus);
  }
}

/** Реестр проверок разблокировки подземелий */
export class DungeonUnlockRegistry {
  private checkers = new Map<number, DungeonUnlockChecker>();

  register(checker: DungeonUnlockChecker): this {
    this.checkers.set(checker.dungeonId, checker);
    return this;
  }

  check(id: number, flags: any): { ok: boolean; req: string } {
    const checker = this.checkers.get(id);
    if (!checker) return { ok: false, req: 'Путь запечатан' };
    return checker.check(flags);
  }
}

// ============================================================
// Создание реестров (factory)
// ============================================================

export function createInteractionRegistry(): InteractionHandlerRegistry {
  return new InteractionHandlerRegistry()
    .register(new NpcHandler())
    .register(new ChestHandler())
    .register(new PedestalHandler())
    .register(new ShrineHandler())
    .register(new AltarHandler())
    .register(new OldAltarHandler())
    .register(new StairsHandler());
}

export function createChestItemRegistry(): ChestItemHandlerRegistry {
  return new ChestItemHandlerRegistry()
    .register(new BowChestHandler())
    .register(new SwordChestHandler())
    .register(new ArrowsChestHandler())
    .register(new HeartPieceChestHandler())
    .register(new KeyChestHandler());
}

export function createDungeonUnlockRegistry(): DungeonUnlockRegistry {
  return new DungeonUnlockRegistry()
    .register(new SwordDungeonChecker())
    .register(new AxeDungeonChecker())
    .register(new RunesDungeonChecker());
}

// ============================================================
// InteractionHandler реализации
// ============================================================

/** Обработка взаимодействия с NPC */
class NpcHandler implements InteractionHandler {
  readonly kind = 'npc';

  handle(_world: World, _eid: number, ref: any, ctx: InteractionContext): boolean {
    ctx.onDialogue(ref.id);
    return true;
  }
}

/** Обработка взаимодействия с сундуком */
class ChestHandler implements InteractionHandler {
  readonly kind = 'chest';

  handle(world: World, chestEid: number, _ref: any, ctx: InteractionContext): boolean {
    const { store, bus, chestItemRegistry } = ctx;
    Chest.opened[chestEid] = 1;
    const m = store.map!;
    const cx = Math.round((Position.x[chestEid] - 8) / 16);
    const cy = Math.round((Position.y[chestEid] - 8) / 16);
    store.openedChests.add(`${cx}_${cy}`);
    audio.chest();

    // Выдать предмет из сундука через ChestItemHandlerRegistry
    const itemKind = poolGet(StringPool.chestItems, Chest.item[chestEid]);
    if (chestItemRegistry) {
      chestItemRegistry.collect(itemKind, chestEid, store, bus);
    } else {
      logger.warn('interaction', `No chestItemRegistry for chest ${chestEid}, item: ${itemKind}`);
    }
    bus.emit('hud:dirty', {});
    return true;
  }
}

/** Обработка взаимодействия с пьедесталом */
class PedestalHandler implements InteractionHandler {
  readonly kind = 'pedestal';

  handle(
    world: World,
    pedestalEid: number,
    _ref: any,
    ctx: InteractionContext
  ): boolean {
    const { store, bus, onGuardSpawn } = ctx;
    const m = store.map!;

    if (Pedestal.guardsLeft[pedestalEid] > 0) {
      audio.locked();
      bus.emit('toast', { msg: 'Печать крепка' });
      if (!Pedestal.guardsSpawned[pedestalEid]) {
        Pedestal.guardsSpawned[pedestalEid] = 1;
        if (onGuardSpawn) {
          const px = Position.x[pedestalEid];
          const py = Position.y[pedestalEid];
          const pdDef = m.pedestals?.find(
            (p: { x: number; y: number }) => p.x * 16 + 8 === px && p.y * 16 + 8 === py
          );
          if (pdDef) {
            for (const k of pdDef.guards) {
              const a = Math.random() * Math.PI * 2;
              const gx = px + Math.cos(a) * 26;
              const gy = py + Math.sin(a) * 26;
              onGuardSpawn(k, gx, gy, pedestalEid);
            }
            bus.emit('toast', { msg: 'Стражи пьедестала восстали!' });
            audio.horn();
          }
        }
      }
      return true;
    }

    Pedestal.taken[pedestalEid] = 1;
    store.takenPedestals.add(poolGet(StringPool.pedestalIds, Pedestal.id[pedestalEid]));
    audio.chime();
    bus.emit('drop:spawn', { kind: 'rune' as any, x: Position.x[pedestalEid], y: Position.y[pedestalEid] - 6 });

    let idx = 0;
    for (const eid of query(world, [Position, Pedestal])) {
      if (eid === pedestalEid) {
        bus.emit('pedestal:unsealed', { pedestalIndex: idx });
        break;
      }
      idx++;
    }
    return true;
  }
}

/** Обработка взаимодействия со святилищем */
class ShrineHandler implements InteractionHandler {
  readonly kind = 'shrine';

  handle(world: World, shrineEid: number, _ref: any, ctx: InteractionContext): boolean {
    const { store, bus } = ctx;
    const m = store.map!;

    let shrineIdx = -1;
    if (m.shrines) {
      const sx = Position.x[shrineEid];
      const sy = Position.y[shrineEid];
      for (let j = 0; j < m.shrines.length; j++) {
        const s = m.shrines[j];
        if (s.x * 16 + 8 === sx && s.y * 16 + 8 === sy) {
          shrineIdx = j;
          break;
        }
      }
    }

    if (!m.isDungeon && shrineIdx >= 0) {
      store.flags.setFlag('shrineIdx', shrineIdx);
    }

    const firstVisit = !m.isDungeon && !store.visitedShrines.has(shrineIdx);
    if (firstVisit) {
      store.visitedShrines.add(shrineIdx);
      bus.emit('quest:reveal', { id: 's_shrines' });
    }

    Shrine.lit[shrineEid] = 1;
    store.playerDomain!.fullHeal();
    audio.chime();
    audio.heal();
    bus.emit('toast', { msg: 'Святилище запомнило тебя. Раны затянулись' });
    bus.emit('hud:dirty', {});
    return true;
  }
}

/** Обработка взаимодействия с алтарём (барьер) */
class AltarHandler implements InteractionHandler {
  readonly kind = 'altar';

  handle(_world: World, _eid: number, _ref: any, ctx: InteractionContext): boolean {
    ctx.bus.emit('boss:spawned', { kind: 'snake' as any, id: -1 });
    return true;
  }
}

/** Обработка взаимодействия со старым алтарём */
class OldAltarHandler implements InteractionHandler {
  readonly kind = 'oldAltar';

  handle(_world: World, _eid: number, _ref: any, ctx: InteractionContext): boolean {
    const { store, bus } = ctx;
    const f = store.flags;
    if (!f.relic || f.atoneDone) return true;

    f.setFlag('relic', false);
    f.setFlag('atoneDone', true);
    f.setFlag('nornsFavor', true);
    store.playerDomain!.increaseMaxHp(2);
    audio.rune();
    bus.emit('toast', { msg: 'Норны приняли дар: пьедесталы Рун видны на карте' });
    bus.emit('hud:dirty', {});
    return true;
  }
}

/** Обработка взаимодействия со лестницей */
class StairsHandler implements InteractionHandler {
  readonly kind = 'stairs';

  handle(
    _world: World,
    _eid: number,
    _ref: any,
    ctx: InteractionContext
  ): boolean {
    const { store, bus } = ctx;
    const m = store.map!;
    const f = store.flags;

    if (m.isDungeon) {
      bus.emit('engine:exit-dungeon', { spawn: m.exitSpot });
      return true;
    }
    if (f.snakeStarted && !f.snakeDead) return true;

    // Найти ближайший вход в подземелье
    const ow = store.ow!;
    let best: { id: number; name: string } | null = null;
    let bd = 40 * 40;

    for (const en of ow.dungeonEntries) {
      const px = ctx.playerX ?? 0;
      const py = ctx.playerY ?? 0;
      const d2 = (en.x * 16 + 8 - px) ** 2 + (en.y * 16 + 8 - py) ** 2;
      if (d2 < bd) {
        bd = d2;
        best = { id: en.id, name: en.name };
      }
    }

    if (!best) return true;

    // Проверяем разблокировку через registry
    const gate = ctx.dungeonRegistry?.check(best.id, f) ?? { ok: false, req: 'Путь запечатан' };
    if (!gate.ok) {
      audio.locked();
      bus.emit('toast', { msg: gate.req });
      return true;
    }

    bus.emit('engine:enter-dungeon', { dungeonId: best.id, name: best.name });
    return true;
  }
}

// ============================================================
// ChestItemHandler реализации
// ============================================================

class BowChestHandler implements ChestItemHandler {
  readonly itemKind = 'bow';

  handle(_chestEid: number, store: GameStore, bus: EventBus): void {
    store.flags.setFlag('hasBow', true);
    bus.emit('toast', { msg: 'Лук Сумерек [удерживай L] — время замирает, стрела летит' });
  }
}

class SwordChestHandler implements ChestItemHandler {
  readonly itemKind = 'sword';

  handle(_chestEid: number, store: GameStore, bus: EventBus): void {
    store.flags.setFlag('hasSword', true);
    bus.emit('toast', { msg: 'Меч Одина получен!' });
    audio.rune();
  }
}

class ArrowsChestHandler implements ChestItemHandler {
  readonly itemKind = 'arrows';

  handle(_chestEid: number, store: GameStore, bus: EventBus): void {
    store.flags.incrementFlag('arrows', 10);
    bus.emit('toast', { msg: '+10 стрел' });
  }
}

class HeartPieceChestHandler implements ChestItemHandler {
  readonly itemKind = 'heartPiece';

  handle(_chestEid: number, store: GameStore, bus: EventBus): void {
    store.playerDomain!.increaseMaxHp(2);
    bus.emit('toast', { msg: 'Осколок жизни: максимальное здоровье +2' });
    audio.rune();
  }
}

class KeyChestHandler implements ChestItemHandler {
  readonly itemKind = 'key';

  handle(_chestEid: number, store: GameStore, bus: EventBus): void {
    store.flags.setFlag('hasKey', true);
    bus.emit('toast', { msg: 'Ключ стража. Дверь впереди ждёт' });
  }
}

// ============================================================
// DungeonUnlockChecker реализации
// ============================================================

class SwordDungeonChecker implements DungeonUnlockChecker {
  readonly dungeonId = 0;

  check(flags: any): { ok: boolean; req: string } {
    return { ok: flags.hasItem('sword'), req: 'Эйрик должен вручить тебе клинок' };
  }
}

class AxeDungeonChecker implements DungeonUnlockChecker {
  readonly dungeonId = 1;

  check(flags: any): { ok: boolean; req: string } {
    return { ok: flags.hasItem('axe'), req: 'Путь преграждают корни — нужна Ледяная Секира' };
  }
}

class RunesDungeonChecker implements DungeonUnlockChecker {
  readonly dungeonId = 2; // default для всех остальных

  check(flags: any): { ok: boolean; req: string } {
    const runes = flags.getRunes();
    return { ok: runes >= 5, req: `Крепость запечатана — нужно ещё ${5 - runes} Рун` };
  }
}
