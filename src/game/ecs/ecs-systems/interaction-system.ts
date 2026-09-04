/* interaction-system.ts — система взаимодействия на основе ECS */

import { query, hasComponent, type World } from 'bitecs';
import { EventBus } from '../../event-bus';
import { GameStore } from '../../store';
import { audio } from '../../audio';
import {
  Position,
  Radius,
  NPC,
  Chest,
  Pedestal,
  Shrine,
  Door,
  Barrier,
  Altar,
  Taken,
  Dead,
  Player,
  Enemy,
} from '../ecs-components';
import { dist2 } from '../../utils';
import { T, Tl, tileAt, solidTileAt } from '../../world';

// ============================================================
// Конфигурация
// ============================================================

const INTERACTION_RANGE = 20;

/** Callback для спавна стража пьедестала */
export type GuardSpawnCallback = (kind: string, x: number, y: number, pedestalIndex: number) => void;

// ============================================================
// Взаимодействие
// ============================================================

/** Проверить взаимодействие с ближайшим объектом */
export function tryInteract(
  world: World,
  playerEid: number,
  store: GameStore,
  bus: EventBus,
  onDialogue: (id: string) => void,
  onGuardSpawn?: GuardSpawnCallback
): boolean {
  if (playerEid < 0 || !store.map) return false;

  const { x: px, y: py } = Position;
  const playerX = px[playerEid];
  const playerY = py[playerEid];

  const hit = findNearest(world, playerEid, store);
  if (!hit) return false;

  audio.uiClick();

  switch (hit.kind) {
    case 'npc':
      onDialogue(hit.ref.id);
      return true;
    case 'chest':
      openChestEcs(world, hit.eid, hit.ref, store, bus);
      return true;
    case 'pedestal':
      takePedestalEcs(world, hit.eid, hit.ref, store, bus, onGuardSpawn);
      return true;
    case 'shrine':
      useShrineEcs(world, hit.eid, hit.ref.i, store, bus);
      return true;
    case 'altar':
      bus.emit('boss:spawned', { kind: 'snake' as any, id: -1 });
      return true;
    case 'oldAltar':
      atoneEcs(store, bus);
      return true;
    case 'stairs':
      enterDungeonOrExitEcs(store, bus);
      return true;
  }

  return false;
}

interface InteractableHit {
  kind: string;
  eid: number;
  ref: any;
  x: number;
  y: number;
}

/** Найти ближайший интерактивный объект */
function findNearest(world: World, playerEid: number, store: GameStore): InteractableHit | null {
  const m = store.map!;
  const { x: px, y: py } = Position;
  const playerX = px[playerEid];
  const playerY = py[playerEid];

  let best: InteractableHit | null = null;
  let bd = INTERACTION_RANGE * INTERACTION_RANGE;

  const consider = (kind: string, eid: number, ref: any, x: number, y: number) => {
    const d2 = dist2(x, y, playerX, playerY);
    if (d2 < bd) {
      bd = d2;
      best = { kind, eid, ref, x, y };
    }
  };

  // NPCs
  for (const eid of query(world, [Position, NPC])) {
    consider('npc', eid, NPC[eid], px[eid], py[eid]);
  }

  // Chests (не открытые)
  for (const eid of query(world, [Position, Chest])) {
    if (!Chest[eid].opened) {
      consider('chest', eid, Chest[eid], px[eid], py[eid]);
    }
  }

  // Pedestals (не взятые)
  for (const eid of query(world, [Position, Pedestal])) {
    if (!Pedestal[eid].taken) {
      consider('pedestal', eid, Pedestal[eid], px[eid], py[eid]);
    }
  }

  // Shrines
  for (const eid of query(world, [Position, Shrine])) {
    consider('shrine', eid, { s: Shrine[eid], i: eid }, px[eid], py[eid]);
  }

  // Altar (barrier) — если есть руны и змея не начата
  const f = store.flags;
  if (store.barrier && f.runes >= 5 && !f.snakeStarted) {
    const b = store.barrier;
    consider('altar', -1, b, b.x, b.y);
  }

  // Old Altar — если есть реликвия и ещё не искупился
  if (f.relic && !f.atoneDone && !m.isDungeon) {
    consider('oldAltar', -1, null, m.oldAltar.x * T + 8, m.oldAltar.y * T + 8);
  }

  // Stairs — проверка тайлов вокруг игрока
  const tx = Math.floor(playerX / T);
  const ty = Math.floor(playerY / T);
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (tileAt(m, tx + dx, ty + dy) === Tl.STAIRS) {
      consider('stairs', -1, null, (tx + dx) * T + 8, (ty + dy) * T + 8);
    }
  }

  return best;
}

/** Открыть сундук */
function openChestEcs(world: World, chestEid: number, chest: any, store: GameStore, bus: EventBus): void {
  chest.opened = true;
  const m = store.map!;
  const cx = Math.round((chest.x - 8) / T);
  const cy = Math.round((chest.y - 8) / T);
  store.openedChests.add(`${cx}_${cy}`);
  audio.chest();

  const f = store.flags;
  switch (chest.item) {
    case 'bow':
      f.setFlag('hasBow', true);
      bus.emit('toast', { msg: 'Лук Сумерек [удерживай L] — время замирает, стрела летит' });
      break;
    case 'arrows':
      f.incrementFlag('arrows', 10);
      bus.emit('toast', { msg: '+10 стрел' });
      break;
    case 'heartPiece': {
      const r = store.playerDomain!.increaseMaxHp(2);
      store.player.maxHp = r.maxHp;
      store.player.hp = r.hp;
      bus.emit('toast', { msg: 'Осколок жизни: максимальное здоровье +2' });
      audio.rune();
      break;
    }
    case 'key':
      f.setFlag('hasKey', true);
      bus.emit('toast', { msg: 'Ключ стража. Дверь впереди ждёт' });
      break;
  }
  bus.emit('hud:dirty', {});
}

/** Взять предмет с пьедестала */
function takePedestalEcs(
  world: World, pedestalEid: number, pd: any, store: GameStore, bus: EventBus, onGuardSpawn?: GuardSpawnCallback
): void {
  const m = store.map!;
  if (pd.guardsLeft > 0) {
    audio.locked();
    bus.emit('toast', { msg: 'Печать крепка' });
    if (!pd.guardsSpawned) {
      pd.guardsSpawned = true;
      // Спавн стражей через callback
      const pedestalIndex = getPedestalIndex(world, pedestalEid);
      if (pedestalIndex >= 0 && m.pedestals[pedestalIndex]) {
        const def = m.pedestals[pedestalIndex];
        for (const k of def.guards) {
          const a = Math.random() * Math.PI * 2;
          const gx = pd.x + Math.cos(a) * 26;
          const gy = pd.y + Math.sin(a) * 26;
          if (onGuardSpawn) {
            onGuardSpawn(k, gx, gy, pedestalIndex);
          }
        }
        bus.emit('toast', { msg: 'Стражи пьедестала восстали!' });
        audio.horn();
      }
    }
    return;
  }

  pd.taken = true;
  store.takenPedestals.add(pd.id);
  audio.chime();
  bus.emit('drop:spawn', { kind: 'rune' as any, x: pd.x, y: pd.y - 6 });
  const pedestalIndex = getPedestalIndex(world, pedestalEid);
  if (pedestalIndex >= 0) {
    bus.emit('pedestal:unsealed', { pedestalIndex });
  }
}

function getPedestalIndex(world: World, pedestalEid: number): number {
  let idx = 0;
  for (const eid of query(world, [Position, Pedestal])) {
    if (eid === pedestalEid) return idx;
    idx++;
  }
  return -1;
}

/** Использовать святилище */
function useShrineEcs(world: World, shrineEid: number, i: number, store: GameStore, bus: EventBus): void {
  const m = store.map!;
  // Святилища работают только в оверворлде
  if (!m.isDungeon) {
    store.flags.setFlag('shrineIdx', i);
  }
  const firstVisit = !m.isDungeon && !store.visitedShrines.has(i);
  if (firstVisit) {
    store.visitedShrines.add(i);
    bus.emit('quest:reveal', { id: 's_shrines' });
  }
  store.player.hp = store.playerDomain!.fullHeal();
  audio.chime();
  audio.heal();
  bus.emit('toast', { msg: 'Святилище запомнило тебя. Раны затянулись' });
  bus.emit('hud:dirty', {});
}

/** Искупление у старого алтаря */
function atoneEcs(store: GameStore, bus: EventBus): void {
  const f = store.flags;
  if (!f.relic || f.atoneDone) return;
  f.setFlag('relic', false);
  f.setFlag('atoneDone', true);
  f.setFlag('nornsFavor', true);
  const r = store.playerDomain!.increaseMaxHp(2);
  store.player.maxHp = r.maxHp;
  store.player.hp = r.hp;
  audio.rune();
  bus.emit('toast', { msg: 'Норны приняли дар: пьедесталы Рун видны на карте' });
  bus.emit('hud:dirty', {});
}

/** Войти в подземелье или выйти */
function enterDungeonOrExitEcs(store: GameStore, bus: EventBus): void {
  const m = store.map!;
  const f = store.flags;
  if (m.isDungeon) {
    bus.emit('engine:exit-dungeon', { spawn: m.exitSpot });
    return;
  }
  if (f.snakeStarted && !f.snakeDead) return;
  const entry = nearestDungeonEntry(store);
  if (!entry) return;
  const gate = dungeonUnlocked(entry.id, f);
  if (!gate.ok) {
    audio.locked();
    bus.emit('toast', { msg: gate.req });
    return;
  }
  bus.emit('engine:enter-dungeon', { dungeonId: entry.id, name: entry.name });
}

function nearestDungeonEntry(store: GameStore): { id: number; name: string } | null {
  let best: { id: number; name: string } | null = null;
  let bd = 40 * 40;
  const ow = store.ow!;
  const { x: px, y: py } = Position;
  const playerEid = getPlayerEid(store);
  if (playerEid < 0) return null;
  const playerX = px[playerEid];
  const playerY = py[playerEid];

  for (const en of ow.dungeonEntries) {
    const d2 = dist2(en.x * T + 8, en.y * T + 8, playerX, playerY);
    if (d2 < bd) {
      bd = d2;
      best = { id: en.id, name: en.name };
    }
  }
  return best;
}

function getPlayerEid(store: GameStore): number {
  // Получаем playerEid из store или возвращаем -1
  return (store as any).playerEid ?? -1;
}

function dungeonUnlocked(id: number, f: any): { ok: boolean; req: string } {
  if (id === 0) return { ok: f.hasItem('sword'), req: 'Эйрик должен вручить тебе клинок' };
  if (id === 1) return { ok: f.hasItem('axe'), req: 'Путь преграждают корни — нужна Ледяная Секира' };
  const runes = f.getRunes();
  return { ok: runes >= 5, req: `Крепость запечатана — нужно ещё ${5 - runes} Рун` };
}

/** Обработка убийства врага-стража */
export function onEnemyKilledEcs(world: World, enemyEid: number, store: GameStore, bus: EventBus): void {
  if (!hasComponent(world, enemyEid, Enemy)) return;
  const g = Enemy[enemyEid];
  if (g.guardOf < 0) return;
  
  // Найти пьедестал через ECS query
  const { Pedestal } = require('../ecs-components');
  const { query } = require('bitecs');
  const pedestals = query(world, [Pedestal]);
  if (g.guardOf >= pedestals.length) return;
  
  const pdEid = pedestals[g.guardOf];
  if (!pdEid || Pedestal.taken[pdEid] || Pedestal.guardsLeft[pdEid] <= 0) return;
  Pedestal.guardsLeft[pdEid] = Math.max(0, Pedestal.guardsLeft[pdEid] - 1);
  if (Pedestal.guardsLeft[pdEid] === 0) {
    bus.emit('toast', { msg: 'Печать пьедестала пала' });
    audio.chime();
  }
  bus.emit('pedestal:guardKilled', { pedestalIndex: g.guardOf });
}
