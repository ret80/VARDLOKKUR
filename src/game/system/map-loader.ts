/* ============ MapLoader ============
 * Загружает данные карты: очищает сущности, строит текстуры,
 * создаёт data-объекты (без Graphics).
 * Не знает про PixiJS, Graphics, renderers. */

import { Graphics, Sprite } from "pixi.js";
import { WorldData, Vec, T, solidTileAt } from "../world";
import { clamp } from "../utils";
import { Cat } from "./planck-world";
import { Vec2 } from "planck-js";
import type { Player, Enemy } from "../entities";
import type { PlayerDomain } from "../store/player-domain";
import type { ProjectileRt, DropRt, ChestRt, PedestalRt, ShrineRt, NpcRt, DoorRt, FloatText } from "../store";
import type { EntityManager } from "./entity-manager";

/** Сохранённый дроп, переживший смену карты. */
interface SavedDrop {
  kind: string;
  x: number;
  y: number;
  life: number;
  ambientIdx: number;
}

export class MapLoader {
  constructor(
    private entityManager: EntityManager,
    private entities: {
      enemies: (Enemy & { g: Graphics })[];
      projectiles: ProjectileRt[];
      drops: DropRt[];
      chests: ChestRt[];
      pedestals: PedestalRt[];
      shrines: ShrineRt[];
      npcs: NpcRt[];
      doors: DoorRt[];
    },
    private dynamicContainer: { addChild(child: Graphics | Sprite): void }
  ) {}

  /* ===== Загрузка карты ===== */

  loadMap(
    map: WorldData,
    spawn: Vec,
    player: Player,
    playerDomain: PlayerDomain,
    playerG: Graphics,
    cam: { x: number; y: number },
    viewW: number,
    viewH: number,
    flags: { secretKnown: boolean; shrineIdx: number; runes: number; snakeStarted: boolean },
    store: { openedChests: Set<string>; takenPedestals: Set<string>; visitedShrines: Set<number> },
    dropsSystem: { spawnWorldDrops(map: WorldData): void },
    dropsArr: DropRt[],
    floats: FloatText[],
    toast: (msg: string) => void,
    pushHud: (force?: boolean) => void
  ): void {
    this.entities.projectiles.length = 0;
    this.entities.chests.length = 0;
    this.entities.pedestals.length = 0;
    this.entities.shrines.length = 0;
    this.entities.npcs.length = 0;
    this.entities.doors.length = 0;
    floats.length = 0;

    // Сохраняем дропы — они переживают смену карты и смерть игрока
    const savedDrops = dropsArr.filter((d) => !d.taken).map((d) => ({
      kind: d.kind, x: d.x, y: d.y, life: d.life, ambientIdx: d.ambientIdx,
    }));

    // Очищаем и строим текстуры
    this.entityManager.clearEntities();

    // Создаём тайловые коллайдеры (Planck.js static bodies)
    this.createTileBodies(map);

    // Позиция игрока
    player.x = spawn.x;
    player.y = spawn.y;
    playerDomain.setPosition(spawn.x, spawn.y);
    playerDomain.setVelocity(0, 0);
    playerDomain.resetTimers();
    player.hp = Math.min(player.hp, player.maxHp);
    playerG.position.set(spawn.x, spawn.y);
    this.dynamicContainer.addChild(playerG);
    playerG.zIndex = 100;

    // Физика игрока
    const playerBody = this.entityManager.makeBody(player.r, spawn, Cat.Player, { kind: "player", dead: false });
    cam.x = clamp(spawn.x - viewW / 2, 0, Math.max(0, map.W * T - viewW));
    cam.y = clamp(spawn.y - viewH / 2, 0, Math.max(0, map.H * T - viewH));

    // Спавн врагов — используем entityManager.spawnEnemy (без колбэка)
    for (const s of map.spawns) {
      const enemy = this.entityManager.spawnEnemy(s.kind, s.x, s.y) as Enemy & { g: Graphics };
      enemy.g.position.set(s.x, s.y);
    }
    this.entityManager.ensureSpawnSafety(map, spawn);

    // Сундуки (data only, без Graphics)
    for (const c of map.chests) {
      const key = c.x + "_" + c.y;
      this.entities.chests.push({
        x: c.x * T + 8, y: c.y * T + 8, item: c.item,
        opened: store.openedChests.has(key), g: null as any,
      });
    }

    // Секретный сундук
    if (!map.isDungeon && flags.secretKnown) {
      const sk = map.stashSpot.x + "_" + map.stashSpot.y;
      this.entities.chests.push({
        x: map.stashSpot.x * T + 8, y: map.stashSpot.y * T + 8, item: "heartPiece",
        opened: store.openedChests.has(sk), g: null as any,
      });
    }

    // Пьедесталы
    for (const pd of map.pedestals) {
      const id = "ped_" + pd.x + "_" + pd.y;
      this.entities.pedestals.push({
        id,
        x: pd.x * T + 8, y: pd.y * T + 8,
        taken: store.takenPedestals.has(id),
        guardsLeft: store.takenPedestals.has(id) ? 0 : pd.guards.length,
        guardsSpawned: false, g: null as any,
      });
    }

    // Святилища
    for (const s of map.shrines) {
      this.entities.shrines.push({
        x: s.x * T + 8, y: s.y * T + 8, g: null as any,
      });
    }

    // NPC
    for (const n of map.npcs) {
      this.entities.npcs.push({
        id: n.id, name: n.name, x: n.x * T + 8, y: n.y * T + 8, g: null as any,
      });
    }

    // Души (не подземелье)
    if (!map.isDungeon) {
      for (const s of map.souls) {
        this.entities.npcs.push({
          id: `soul${map.souls.indexOf(s)}`, name: "Потерянная душа",
          x: s.x * T + 8, y: s.y * T + 8, g: null as any,
        });
      }
    }

    // Двери (подземелье)
    if (map.isDungeon) {
      for (const d of map.doors) {
        this.entities.doors.push({
          x: d.x, y: d.y, open: 0, locked: true, g: null as any,
        });
        // Create kinematic body for door
        const planck = this.entityManager.planckWorld;
        const doorBody = planck.createKinematicBody(d.x, d.y, 18, 16, Cat.Door);
        (this.entities.doors[this.entities.doors.length - 1] as any).body = doorBody;
      }
    } else {
      // Барьер и алтарь
      const b = {
        x: map.treeAltar.x * T + 8,
        y: (map.treeAltar.y + 5) * T + 8,
        active: flags.runes < 5 && !flags.snakeStarted,
        g: null as any,
      };
      this.entityManager.barrier = b;

      // Create kinematic body for barrier
      if (b.active) {
        const planck = this.entityManager.planckWorld;
        const barrierBody = planck.createKinematicBody(b.x, b.y, 40, 16, Cat.Barrier);
        (b as any).body = barrierBody;
      }

      const a = { x: map.treeAltar.x * T + 8, y: map.treeAltar.y * T + 8, g: null as any };
      this.entityManager.altar = a;

      dropsSystem.spawnWorldDrops(map);
    }

    // Восстанавливаем дропы
    for (const sd of savedDrops) {
      dropsArr.push({
        kind: sd.kind, x: sd.x, y: sd.y, t: Math.random() * 5,
        taken: false, magnet: sd.kind === "heart" || sd.kind === "arrows" || sd.kind === "dew",
        g: null as any, life: sd.life, ambientIdx: sd.ambientIdx,
      });
    }
  }

  // ============================================================
  // Создание тайловых коллайдеров
  // ============================================================

  private createTileBodies(map: WorldData): void {
    const planck = this.entityManager.planckWorld;
    const r = T / 2; // radius = half tile size

    for (let ty = 0; ty < map.H; ty++) {
      for (let tx = 0; tx < map.W; tx++) {
        if (!solidTileAt(map, tx, ty)) continue;
        const px = tx * T + T / 2;
        const py = ty * T + T / 2;
        planck.createTileBody(px, py, r);
      }
    }
  }
}
