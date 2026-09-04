/* ecs-map-loader.ts — загрузка сущностей карты в ECS */

import { type World } from 'bitecs';
import { Graphics } from 'pixi.js';
import { Cat } from '../physics/planck-world';
import { T, WorldData, Vec, solidTileAt } from '../world';
import { clamp } from '../utils';
import type { PlanckWorld } from '../physics/planck-world';
import type { DropKind } from '../generators/types';
import {
  createPlayerInEcs,
  createEnemyInEcs,
  createNpcInEcs,
  createChestInEcs,
  createPedestalInEcs,
  createShrineInEcs,
  createDoorInEcs,
  createBarrierInEcs,
  createAltarInEcs,
  createDropInEcs,
} from './ecs-bridge';
import { createBodyForEntity } from './ecs-systems';

// ============================================================
// Конфигурация Map Loader
// ============================================================

export interface EcsMapLoaderConfig {
  world: World;
  planckWorld: PlanckWorld;
  dynamicContainer: { addChild(child: Graphics): void; removeChild(child: Graphics): void; children: unknown[] };
  openedChests: Set<string>;
  takenPedestals: Set<string>;
  visitedShrines: Set<number>;
  flags: {
    secretKnown: boolean;
    shrineIdx: number;
    runes: number;
    snakeStarted: boolean;
    hasKey: boolean;
  };
  map: WorldData;
  spawn: Vec;
  viewW: number;
  viewH: number;
  savedDrops: { kind: string; x: number; y: number; life?: number; ambientIdx?: number }[];
  toast: (msg: string) => void;
}

// ============================================================
// ECS Map Loader
// ============================================================

export class EcsMapLoader {
  private config: EcsMapLoaderConfig;
  private playerEid: number = -1;
  private barrierBody: any = null;

  constructor(config: EcsMapLoaderConfig) {
    this.config = config;
  }

  get playerEidValue(): number { return this.playerEid; }

  /** Загрузить карту в ECS */
  loadMap(
    playerG: Graphics,
    playerDomain: any
  ): { playerEid: number; playerBody: any; cam: { x: number; y: number } } {
    const { world, planckWorld, dynamicContainer, map, spawn, viewW, viewH, flags } = this.config;

    // 1. Очистить старый мир
    this.clearWorld(world);

    // 2. Создать тайловые коллайдеры
    this.createTileBodies(map, planckWorld);

    // 3. Создать игрока
    this.playerEid = this.createPlayer(world, spawn, playerG, planckWorld);
    dynamicContainer.addChild(playerG);
    playerG.zIndex = 100;

    // 4. Камера
    const cam = {
      x: clamp(spawn.x - viewW / 2, 0, Math.max(0, map.W * T - viewW)),
      y: clamp(spawn.y - viewH / 2, 0, Math.max(0, map.H * T - viewH)),
    };

    // 5-11. Спавн всех сущностей
    this.spawnEnemies(world, map, planckWorld, dynamicContainer);
    this.spawnChests(world, map, dynamicContainer);
    this.spawnPedestals(world, map, dynamicContainer);
    this.spawnShrines(world, map, dynamicContainer);
    this.spawnNpcs(world, map, dynamicContainer);
    if (map.isDungeon) {
      this.spawnDungeonDoors(world, map, planckWorld, dynamicContainer);
    } else {
      this.spawnOverworldObjects(world, map, planckWorld, dynamicContainer);
    }
    this.spawnDrops(world, map, dynamicContainer);

    // Переместить игрока в конец children — он должен рисоваться поверх всех сущностей
    if (dynamicContainer.children.includes(playerG)) {
      dynamicContainer.removeChild(playerG);
      dynamicContainer.addChild(playerG);
    }

    return { playerEid: this.playerEid, playerBody: null, cam };
  }

  private clearWorld(_world: World): void {
    // TODO: оптимизация
  }

  private createTileBodies(map: WorldData, planckWorld: PlanckWorld): void {
    const r = T / 2;
    for (let ty = 0; ty < map.H; ty++) {
      for (let tx = 0; tx < map.W; tx++) {
        if (!solidTileAt(map, tx, ty)) continue;
        const px = tx * T + T / 2;
        const py = ty * T + T / 2;
        planckWorld.createTileBody(px, py, r);
      }
    }
  }

  private createPlayer(
    world: World, spawn: Vec, playerG: Graphics, planckWorld: PlanckWorld
  ): number {
    const eid = createPlayerInEcs(world, spawn.x, spawn.y, playerG);
    createBodyForEntity(planckWorld, world, eid, 5, Cat.Player, Cat.Player | Cat.Ground | Cat.Enemy | Cat.Projectile);
    return eid;
  }

  private spawnEnemies(world: World, map: WorldData, planckWorld: PlanckWorld, dc: { addChild(g: Graphics): void }): void {
    for (const s of map.spawns) {
      const g = new Graphics();
      g.position.set(s.x, s.y);
      createEnemyInEcs(world, s.kind, s.x, s.y, g, planckWorld, Cat.Enemy, Cat.Enemy | Cat.Player | Cat.Projectile | Cat.Ground);
      dc.addChild(g);
    }
  }

  private spawnChests(world: World, map: WorldData, dc: { addChild(g: Graphics): void }): void {
    const { openedChests } = this.config;
    for (const c of map.chests) {
      const g = new Graphics();
      g.position.set(c.x * T + 8, c.y * T + 8);
      createChestInEcs(world, c.x * T + 8, c.y * T + 8, c.item, g);
      dc.addChild(g);
    }
    if (!map.isDungeon && this.config.flags.secretKnown) {
      const g = new Graphics();
      g.position.set(map.stashSpot.x * T + 8, map.stashSpot.y * T + 8);
      createChestInEcs(world, map.stashSpot.x * T + 8, map.stashSpot.y * T + 8, "heartPiece", g);
      dc.addChild(g);
    }
  }

  private spawnPedestals(world: World, map: WorldData, dc: { addChild(g: Graphics): void }): void {
    const { takenPedestals } = this.config;
    for (const pd of map.pedestals) {
      const id = "ped_" + pd.x + "_" + pd.y;
      const g = new Graphics();
      g.position.set(pd.x * T + 8, pd.y * T + 8);
      createPedestalInEcs(world, id, pd.x * T + 8, pd.y * T + 8, takenPedestals.has(id) ? 0 : pd.guards.length, g);
      dc.addChild(g);
    }
  }

  private spawnShrines(world: World, map: WorldData, dc: { addChild(g: Graphics): void }): void {
    for (const s of map.shrines) {
      const g = new Graphics();
      g.position.set(s.x * T + 8, s.y * T + 8);
      createShrineInEcs(world, s.x * T + 8, s.y * T + 8, g);
      dc.addChild(g);
    }
  }

  private spawnNpcs(world: World, map: WorldData, dc: { addChild(g: Graphics): void }): void {
    for (const n of map.npcs) {
      const g = new Graphics();
      g.position.set(n.x * T + 8, n.y * T + 8);
      createNpcInEcs(world, n.id, n.name, n.x * T + 8, n.y * T + 8, g);
      dc.addChild(g);
    }
    if (!map.isDungeon) {
      for (const s of map.souls) {
        const g = new Graphics();
        g.position.set(s.x * T + 8, s.y * T + 8);
        createNpcInEcs(world, `soul${map.souls.indexOf(s)}`, "Потерянная душа", s.x * T + 8, s.y * T + 8, g);
        dc.addChild(g);
      }
    }
  }

  private spawnDungeonDoors(world: World, map: WorldData, planckWorld: PlanckWorld, dc: { addChild(g: Graphics): void }): void {
    for (const d of map.doors) {
      const g = new Graphics();
      g.position.set(d.x, d.y);
      createDoorInEcs(world, d.x, d.y, true, g);
      dc.addChild(g);
      planckWorld.createKinematicBody(d.x, d.y, 18, 16, Cat.Door);
    }
  }

  private spawnOverworldObjects(world: World, map: WorldData, planckWorld: PlanckWorld, dc: { addChild(g: Graphics): void }): void {
    const { flags } = this.config;
    const bx = map.treeAltar.x * T + 8;
    const by = (map.treeAltar.y + 5) * T + 8;
    const active = flags.runes < 5 && !flags.snakeStarted;
    const barrierG = new Graphics();
    barrierG.position.set(bx, by);
    createBarrierInEcs(world, bx, by, active, barrierG);
    dc.addChild(barrierG);
    if (active) this.barrierBody = planckWorld.createKinematicBody(bx, by, 40, 16, Cat.Barrier);

    const altarG = new Graphics();
    altarG.position.set(map.treeAltar.x * T + 8, map.treeAltar.y * T + 8);
    createAltarInEcs(world, map.treeAltar.x * T + 8, map.treeAltar.y * T + 8, altarG);
    dc.addChild(altarG);
  }

  private spawnDrops(world: World, map: WorldData, dc: { addChild(g: Graphics): void }): void {
    for (const sd of this.config.savedDrops) {
      const g = new Graphics();
      g.position.set(sd.x, sd.y);
      createDropInEcs(world, sd.kind as DropKind, sd.x, sd.y, g);
      dc.addChild(g);
    }
    for (const ambient of map.ambient) {
      const g = new Graphics();
      g.position.set(ambient.x * T + 8, ambient.y * T + 8);
      const kind = ambient.kind === 'shard' ? 'shard' : 'bones';
      createDropInEcs(world, kind as DropKind, ambient.x * T + 8, ambient.y * T + 8, g);
      dc.addChild(g);
    }
  }
}
