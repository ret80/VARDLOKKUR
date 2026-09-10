/* player-lifecycle.ts – Управление респавном и использованием сердца */

import { T } from "../world";
import type { GameStore } from "../store";
import { PlayerDomain } from "../store/player-domain";
import type { EventBus } from "../event-bus";
import type { HudSystem } from "../hud/hud-system";
import { logger } from "../debug/logger";

export interface PlayerLifecycleCallbacks {
  /** Плавно перейти к непрозрачности */
  fadeTo: (a: number) => void;
  /** Загрузить карту */
  loadMap: (map: any, spawn: { x: number; y: number }) => void;
  /** Создать всплывающий текст */
  float: (x: number, y: number, text: string, color: number) => void;
  /** Воспроизвести звук исцеления */
  playHeal: () => void;
  /** Эффект частиц */
  fxBurst: (x: number, y: number, color: number, count: number, size: number, life: number, speed: number, yOff: number) => void;
  /** Сбросить состояние смерти игрока (вызывается при респавне) */
  resetDeath?: () => void;
}

/** Проверить, свободна ли клетка для спавна */
function isSpawnFree(ow: any, tx: number, ty: number): boolean {
  if (!ow || !ow.tiles) return false;
  const tile = ow.tiles[ty * ow.W + tx];
  // Считаем клетку свободной, если она не является твёрдой
  // и не занята святилищем, NPC, сундуком, педесталом или врагом
  const isSolid = [0, 1, 6, 7, 12, 13, 15, 17, 20, 21].includes(tile); // WATER, TREE, ROCK, PALISADE, HOUSE, COLUMN, CAVEWALL, DWALL, ALTAR
  if (isSolid) return false;

  // Проверить, не занята ли клетка другой сущностью
  for (const s of ow.shrines || []) {
    if (s.x === tx && s.y === ty) return false;
  }
  for (const n of ow.npcs || []) {
    if (n.x === tx && n.y === ty) return false;
  }
  for (const c of ow.chests || []) {
    if (c.x === tx && c.y === ty) return false;
  }
  for (const p of ow.pedestals || []) {
    if (p.x === tx && p.y === ty) return false;
  }
  for (const sp of ow.spawns || []) {
    if (sp.x === tx * 16 + 8 && sp.y === ty * 16 + 8) return false;
  }
  return true;
}

/** Найти случайную свободную соседнюю клетку вокруг позиции */
function findFreeNeighbor(ow: any, cx: number, cy: number): { x: number; y: number } {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  // Перемешать направления для случайности
  for (let i = dirs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }

  for (const [dx, dy] of dirs) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (isSpawnFree(ow, nx, ny)) {
      return { x: nx * T + 8, y: ny * T + 8 };
    }
  }

  // Фолбэк — если нет свободных соседних клеток, используем центр
  return { x: cx * T + 8, y: cy * T + 8 };
}

export class PlayerLifecycle {
  constructor(
    private store: GameStore,
    private playerDomain: PlayerDomain,
    private bus: EventBus,
    private hud: HudSystem,
    private cbs: PlayerLifecycleCallbacks
  ) {}

  /** Использовать сохранённое сердце для восстановления HP */
  useStoredHeart(): void {
    const p = this.playerDomain;
    if (p.hp >= p.maxHp) {
      this.cbs.float(p.x, p.y, "Здоровье полное", 0x6e7f8d);
      return;
    }
    if (this.store.flags.hearts <= 0) {
      this.cbs.float(p.x, p.y, "Сума пуста", 0x6e7f8d);
      return;
    }
    this.store.flags.hearts--;
    this.playerDomain.heal(4);
    this.cbs.playHeal();
    this.cbs.fxBurst(p.x, p.y, 0x7ee2a8, 10, 50, 0.8, 2, -20);
    this.cbs.float(p.x, p.y - 10, "+4", 0x7ee2a8);
    this.hud.pushHud(true);
  }

  /** Респавн игрока после смерти */
  respawn(): void {
    const { ow, flags, player } = this.store;
    let spawn: { x: number; y: number };

    if (flags.shrineIdx >= 0 && ow && ow.shrines && ow.shrines[flags.shrineIdx]) {
      const s = ow.shrines[flags.shrineIdx];
      // Игрок появляется на случайной свободной соседней клетке со святилищем
      spawn = findFreeNeighbor(ow, s.x, s.y);
    } else if (ow) {
      // Фолбэк — спавн в деревне (оверворлд)
      spawn = ow.spawn ?? { x: 0, y: 0 };
    } else {
      spawn = this.store.map?.spawn ?? { x: 0, y: 0 };
    }

    // Sync to store.player for legacy minimap (before ECS player created)
    player.x = spawn.x;
    player.y = spawn.y;

    logger.debug('respawn', `spawn=${JSON.stringify(spawn)} ow=${ow ? 'present' : 'null'} shrines=${ow?.shrines?.length ?? -1}`);

    this.cbs.resetDeath?.();
    logger.debug('respawn', 'calling loadMap(ow, spawn)...');
    this.cbs.loadMap(ow, spawn);
    logger.debug('respawn', `loadMap done, playerDomain._eid=${(this.playerDomain as any)._eid}`);
    this.store.setScreen("play");
    this.cbs.fadeTo(1);
    this.hud.pushHud(true);
    this.bus.emit("player:respawned", {});
  }
}
