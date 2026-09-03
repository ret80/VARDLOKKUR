/* ============ MapLoader ============ */
import { Graphics, Sprite, Texture } from "pixi.js";
import { EventBus } from "../event-bus";
import { WorldData, Vec, T, solidTileAt, tileAt, Tl } from "../world";
import { dist2, clamp } from "../utils";
import type { Player, Enemy } from "../entities";
import type { PlayerDomain } from "../store/player-domain";
import type { ProjectileRt, DropRt, ChestRt, PedestalRt, ShrineRt, NpcRt, DoorRt, FloatText } from "../store";
import type { EntityManager, EntityManagerServices, EntityManagerEntities } from "./entity-manager";
import {
  IPlayerData, IEnemyData, INpcData, IDropData, IProjectileData,
  IChestData, IPedestalData, IShrineData, IDoorData, IBarrierData, IAltarData,
  IPlayerExtra,
  PlayerRenderer, EnemyRenderer, NpcRenderer, DropRenderer, ProjectileRenderer,
  ChestRenderer, PedestalRenderer, ShrineRenderer, DoorRenderer, BarrierRenderer, AltarRenderer
} from "../entities";
import { buildMinimapBase, drawMinimap } from "../tiles";
import { type GraphicsFactory } from "./render-system";

/** Сохранённый дроп, переживший смену карты. */
interface SavedDrop {
  kind: string;
  x: number;
  y: number;
  life: number;
  ambientIdx: number;
}

export class MapLoader {
  private renderers = {
    player: new PlayerRenderer(),
    enemy: new EnemyRenderer(),
    npc: new NpcRenderer(),
    drop: new DropRenderer(),
    projectile: new ProjectileRenderer(),
    chest: new ChestRenderer(),
    pedestal: new PedestalRenderer(),
    shrine: new ShrineRenderer(),
    door: new DoorRenderer(),
    barrier: new BarrierRenderer(),
    altar: new AltarRenderer(),
  };

  constructor(
    private bus: EventBus,
    private entityManager: EntityManager,
    private entities: EntityManagerEntities,
    private services: EntityManagerServices,
    private dynamic: { addChild(child: Graphics | Sprite): void; removeChildren(): void },
    private gfxFactory: GraphicsFactory
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
    this.entityManager.buildMapTextures(map);

    // Позиция игрока
    player.x = spawn.x;
    player.y = spawn.y;
    playerDomain.setPosition(spawn.x, spawn.y);
    playerDomain.setVelocity(0, 0);
    playerDomain.resetTimers();
    player.hp = Math.min(player.hp, player.maxHp);
    playerG.position.set(spawn.x, spawn.y);
    this.dynamic.addChild(playerG);
    playerG.zIndex = 100;

    // Физика игрока
    const playerBody = this.entityManager.makeBody(player.r, spawn);
    cam.x = clamp(spawn.x - viewW / 2, 0, Math.max(0, map.W * T - viewW));
    cam.y = clamp(spawn.y - viewH / 2, 0, Math.max(0, map.H * T - viewH));

    // Спавн врагов
    for (const s of map.spawns) {
      const enemy = this.services.spawnEnemy(s.kind, s.x, s.y) as Enemy & { g: Graphics };
      enemy.g.position.set(s.x, s.y);
    }
    this.entityManager.ensureSpawnSafety(map, spawn);

    // Сундуки
    for (const c of map.chests) {
      const key = c.x + "_" + c.y;
      const rt: ChestRt = {
        x: c.x * T + 8, y: c.y * T + 8, item: c.item,
        opened: store.openedChests.has(key), g: this.gfxFactory.createGraphics(),
      };
      rt.g.position.set(rt.x, rt.y);
      this.renderers.chest.render(rt.g, { opened: rt.opened } as IChestData);
      this.entities.chests.push(rt);
      this.dynamic.addChild(rt.g);
    }

    // Секретный сундук
    if (!map.isDungeon && flags.secretKnown) {
      const sk = map.stashSpot.x + "_" + map.stashSpot.y;
      const rt: ChestRt = {
        x: map.stashSpot.x * T + 8, y: map.stashSpot.y * T + 8, item: "heartPiece",
        opened: store.openedChests.has(sk), g: this.gfxFactory.createGraphics(),
      };
      rt.g.position.set(rt.x, rt.y);
      this.renderers.chest.render(rt.g, { opened: rt.opened } as IChestData);
      this.entities.chests.push(rt);
      this.dynamic.addChild(rt.g);
    }

    // Пьедесталы
    map.pedestals.forEach((pd) => {
      const id = "ped_" + pd.x + "_" + pd.y;
      const rt: PedestalRt = {
        id,
        x: pd.x * T + 8, y: pd.y * T + 8,
        taken: store.takenPedestals.has(id),
        guardsLeft: store.takenPedestals.has(id) ? 0 : pd.guards.length,
        guardsSpawned: false, g: this.gfxFactory.createGraphics(),
      };
      rt.g.position.set(rt.x, rt.y);
      this.entities.pedestals.push(rt);
      this.dynamic.addChild(rt.g);
    });

    // Святилища
    map.shrines.forEach((s) => {
      const rt: ShrineRt = { x: s.x * T + 8, y: s.y * T + 8, g: this.gfxFactory.createGraphics() };
      rt.g.position.set(rt.x, rt.y);
      this.entities.shrines.push(rt);
      this.dynamic.addChild(rt.g);
    });

    // NPC
    for (const n of map.npcs) {
      const rt: NpcRt = { id: n.id, name: n.name, x: n.x * T + 8, y: n.y * T + 8, g: this.gfxFactory.createGraphics() };
      rt.g.position.set(rt.x, rt.y);
      this.entities.npcs.push(rt);
      this.dynamic.addChild(rt.g);
    }

    // Души (не подземелье)
    if (!map.isDungeon) {
      map.souls.forEach((s, i) => {
        const rt: NpcRt = {
          id: `soul${i}`, name: "Потерянная душа",
          x: s.x * T + 8, y: s.y * T + 8, g: this.gfxFactory.createGraphics(),
        };
        rt.g.position.set(rt.x, rt.y);
        this.entities.npcs.push(rt);
        this.dynamic.addChild(rt.g);
      });
    }

    // Двери (подземелье)
    if (map.isDungeon) {
      for (const d of map.doors) {
        const rt: DoorRt = { x: d.x, y: d.y, open: 0, locked: true, g: this.gfxFactory.createGraphics() };
        rt.g.position.set(rt.x, rt.y);
        this.entities.doors.push(rt);
        this.dynamic.addChild(rt.g);
      }
    } else {
      // Барьер и алтарь
      const b = {
        x: map.treeAltar.x * T + 8,
        y: (map.treeAltar.y + 5) * T + 8,
        active: flags.runes < 5 && !flags.snakeStarted,
        g: this.gfxFactory.createGraphics(),
      };
      b.g.position.set(b.x, b.y);
      this.entityManager.barrier = b;
      this.dynamic.addChild(b.g);

      const a = { x: map.treeAltar.x * T + 8, y: map.treeAltar.y * T + 8, g: this.gfxFactory.createGraphics() };
      a.g.position.set(a.x, a.y);
      this.entityManager.altar = a;
      this.dynamic.addChild(a.g);

      dropsSystem.spawnWorldDrops(map);
    }

    // Восстанавливаем дропы
    for (const sd of savedDrops) {
      const d: DropRt = {
        kind: sd.kind, x: sd.x, y: sd.y, t: Math.random() * 5,
        taken: false, magnet: sd.kind === "heart" || sd.kind === "arrows" || sd.kind === "dew",
        g: this.gfxFactory.createGraphics(), life: sd.life, ambientIdx: sd.ambientIdx,
      };
      d.g.position.set(d.x, d.y);
      dropsArr.push(d);
      this.dynamic.addChild(d.g);
    }
  }

  /* ===== Миникарта ===== */

  buildMinimapBase(map: WorldData): ImageData | null {
    return buildMinimapBase(map);
  }

  drawMinimap(
    cx: CanvasRenderingContext2D,
    mmBase: ImageData,
    map: WorldData,
    player: Player,
    trackedTarget: { x: number; y: number } | null,
    secretKnown: boolean,
    stashSpot: Vec,
    nornsFavor: boolean,
    pedestals: PedestalRt[],
    realT: number,
    shrines?: ShrineRt[]
  ): void {
    drawMinimap(cx, mmBase, {
      shrines: shrines || [],
      player,
      target: trackedTarget,
      secretKnown,
      stashSpot,
      nornsFavor,
      pedestals,
      map,
      realT,
    });
  }
}
