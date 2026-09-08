/* ecs-map-loader.ts — загрузка сущностей карты в ECS */

import { type World, query, removeEntity, addComponent } from 'bitecs';
import { Graphics } from 'pixi.js';
import { Cat, getEnemyCategory, getEnemyMask } from '../physics/planck-world';
import { T, WorldData, Vec, solidTileAt } from '../world';
import { clamp } from '../utils';
import type { PlanckWorld } from '../physics/planck-world';
import type { DropKind } from '../generators/types';
import {
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
import { createPlayerEntity } from './ecs-utils';
import { EventBus } from '../event-bus';
import {
  Shrine,
  Sprite,
  SpriteRegistry,
  PhysicsBodyRegistry,
  EnemyAI,
  EnemyAIRegistry,
  Chest,
  resetAllComponents,
} from './ecs-components';

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
  bus?: EventBus;
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

  get planckWorld(): PlanckWorld { return this.config.planckWorld; }
  get playerEidValue(): number { return this.playerEid; }

  /** Загрузить карту в ECS */
  loadMap(
    playerG: Graphics,
    playerDomain: any,
    onPlayerCreated?: (eid: number) => void
  ): { playerEid: number; playerBody: any; cam: { x: number; y: number } } {
    const { world, planckWorld, dynamicContainer, map, spawn, viewW, viewH, flags } = this.config;

    // 1. Сохранить playerG перед очисткой — он мог быть удалён из dynamicContainer при смерти игрока
    // и будет уничтожен clearWorld из-за !s.parent
    const savedPlayerG = playerG;

    // 1-1. Очистить старый мир
    this.clearWorld(world, savedPlayerG);

    // 2. Создать тайловые коллайдеры
    this.createTileBodies(map, planckWorld);

    // 3. Создать игрока
    this.playerEid = this.createPlayer(world, spawn, playerG, planckWorld);
    (playerG as any).userData = (playerG as any).userData || {};
    (playerG as any).userData.eid = this.playerEid;
    dynamicContainer.addChild(playerG);

    // 4. Вызвать callback после создания игрока — SpriteRegistry уже заполнен
    if (onPlayerCreated) onPlayerCreated(this.playerEid);

    // 5. Камера
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

    return { playerEid: this.playerEid, playerBody: null, cam };
  }

  private clearWorld(world: World, preservePlayerSprite?: Graphics): void {
    // Удалить ВСЕ сущности из ECS мира
    const eids: number[] = [];
    for (const eid of query(world, [])) {
      eids.push(eid);
    }
    for (const eid of eids) {
      removeEntity(world, eid);
    }

    // Сбросить все SoA массивы компонентов — иначе при повторном создании сущностей
    // старые данные (Enemy.kind[0] = "crawler") останутся и могут быть прочитаны
    // для новых сущностей (например, сундука с тем же ID=0)
    resetAllComponents();

    // Очистить SpriteRegistry — но не уничтожать playerG
    for (const s of [...SpriteRegistry]) {
      if (s !== preservePlayerSprite) {
        s.destroy({ texture: true });
      }
    }
    SpriteRegistry.length = 0;
    if (preservePlayerSprite) {
      SpriteRegistry.push(preservePlayerSprite);
    }

    // Очистить другие реестры
    EnemyAIRegistry.length = 0;
    PhysicsBodyRegistry.length = 0;
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
    // Создаём ECS сущность игрока (без Sprite — playerG уже восстановлен в clearWorld)
    const eid = createPlayerEntity(world, spawn.x, spawn.y);
    // Добавляем компонент Sprite и связываем с уже существующим playerG
    addComponent(world, eid, Sprite);
    // playerG уже в SpriteRegistry[0] после clearWorld — устанавливаем индекс
    Sprite.ref[eid] = 1;
    // Создаём физическое тело
    createBodyForEntity(planckWorld, world, eid, 5, Cat.Player, Cat.Player | Cat.Ground | Cat.Enemy | Cat.Projectile);
    return eid;
  }

  private spawnEnemies(world: World, map: WorldData, planckWorld: PlanckWorld, dc: { addChild(g: Graphics): void }): void {
    for (const s of map.spawns) {
      const g = new Graphics();
      g.position.set(s.x, s.y);
      const category = getEnemyCategory(s.kind);
      const mask = getEnemyMask(s.kind);
      const eid = createEnemyInEcs(world, s.kind, s.x, s.y, g, planckWorld, category, mask);
      (g as any).userData = (g as any).userData || {};
      (g as any).userData.eid = eid;
      dc.addChild(g);
    }
  }

  private spawnChests(world: World, map: WorldData, dc: { addChild(g: Graphics): void }): void {
    const { openedChests } = this.config;
    for (const c of map.chests) {
      const g = new Graphics();
      g.position.set(c.x * T + 8, c.y * T + 8);
      const eid = createChestInEcs(world, c.x * T + 8, c.y * T + 8, c.item, g);
      (g as any).userData = (g as any).userData || {};
      (g as any).userData.eid = eid;
      dc.addChild(g);
      // Восстановить состояние opened из store.openedChests
      if (openedChests.has(`${c.x}_${c.y}`)) {
        Chest.opened[eid] = 1;
      }
    }
    if (!map.isDungeon && this.config.flags.secretKnown) {
      const g = new Graphics();
      g.position.set(map.stashSpot.x * T + 8, map.stashSpot.y * T + 8);
      const eid = createChestInEcs(world, map.stashSpot.x * T + 8, map.stashSpot.y * T + 8, "heartPiece", g);
      (g as any).userData = (g as any).userData || {};
      (g as any).userData.eid = eid;
      dc.addChild(g);
      if (openedChests.has(`${map.stashSpot.x}_${map.stashSpot.y}`)) {
        Chest.opened[eid] = 1;
      }
    }
  }

  private spawnPedestals(world: World, map: WorldData, dc: { addChild(g: Graphics): void }): void {
    const { takenPedestals } = this.config;
    for (const pd of map.pedestals) {
      const id = "ped_" + pd.x + "_" + pd.y;
      const px = pd.x * T + 8;
      const py = pd.y * T + 8;
      const g = new Graphics();
      g.position.set(px, py);
      const eid = createPedestalInEcs(world, id, px, py, takenPedestals.has(id) ? 0 : pd.guards.length, g);
      (g as any).userData = (g as any).userData || {};
      (g as any).userData.eid = eid;
      dc.addChild(g);
      // Статическое тело для коллизии — через него нельзя пройти
      this.planckWorld.createStaticBody(px, py, 6, Cat.Pedestal);
    }
  }

  private spawnShrines(world: World, map: WorldData, dc: { addChild(g: Graphics): void }): void {
    for (let j = 0; j < map.shrines.length; j++) {
      const s = map.shrines[j];
      const sx = s.x * T + 8;
      const sy = s.y * T + 8;
      const g = new Graphics();
      g.position.set(sx, sy);
      const eid = createShrineInEcs(world, sx, sy, g);
      (g as any).userData = (g as any).userData || {};
      (g as any).userData.eid = eid;
      dc.addChild(g);
      // Восстановить состояние lit из visitedShrines
      if (this.config.visitedShrines.has(j)) {
        Shrine.lit[eid] = 1;
      }
      // Статическое тело для коллизии — через него нельзя пройти
      this.planckWorld.createStaticBody(sx, sy, 6, Cat.Shrine);
    }
  }

  private spawnNpcs(world: World, map: WorldData, dc: { addChild(g: Graphics): void }): void {
    for (const n of map.npcs) {
      const g = new Graphics();
      g.position.set(n.x * T + 8, n.y * T + 8);
      const eid = createNpcInEcs(world, n.id, n.name, n.x * T + 8, n.y * T + 8, g);
      (g as any).userData = (g as any).userData || {};
      (g as any).userData.eid = eid;
      dc.addChild(g);
    }
    if (!map.isDungeon) {
      for (const s of map.souls) {
        const g = new Graphics();
        g.position.set(s.x * T + 8, s.y * T + 8);
        const eid = createNpcInEcs(world, `soul${map.souls.indexOf(s)}`, "Потерянная душа", s.x * T + 8, s.y * T + 8, g);
        (g as any).userData = (g as any).userData || {};
        (g as any).userData.eid = eid;
        dc.addChild(g);
      }
    }
  }

  private spawnDungeonDoors(world: World, map: WorldData, planckWorld: PlanckWorld, dc: { addChild(g: Graphics): void }): void {
    for (const d of map.doors) {
      const g = new Graphics();
      g.position.set(d.x, d.y);
      const eid = createDoorInEcs(world, d.x, d.y, true, g);
      (g as any).userData = (g as any).userData || {};
      (g as any).userData.eid = eid;
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
    const barrierEid = createBarrierInEcs(world, bx, by, active, barrierG);
    (barrierG as any).userData = (barrierG as any).userData || {};
    (barrierG as any).userData.eid = barrierEid;
    dc.addChild(barrierG);
    if (active) this.barrierBody = planckWorld.createKinematicBody(bx, by, 40, 16, Cat.Barrier);

    const altarG = new Graphics();
    const ax = map.treeAltar.x * T + 8;
    const ay = map.treeAltar.y * T + 8;
    altarG.position.set(ax, ay);
    const altarEid = createAltarInEcs(world, ax, ay, altarG);
    (altarG as any).userData = (altarG as any).userData || {};
    (altarG as any).userData.eid = altarEid;
    dc.addChild(altarG);
    // Статическое тело для коллизии — через алтарь нельзя пройти
    this.planckWorld.createStaticBody(ax, ay, 8, Cat.Altar);
  }

  private spawnDrops(world: World, map: WorldData, dc: { addChild(g: Graphics): void }): void {
    for (const sd of this.config.savedDrops) {
      const g = new Graphics();
      g.position.set(sd.x, sd.y);
      const eid = createDropInEcs(world, sd.kind as DropKind, sd.x, sd.y, g);
      (g as any).userData = (g as any).userData || {};
      (g as any).userData.eid = eid;
      dc.addChild(g);
    }
    for (const ambient of map.ambient) {
      const g = new Graphics();
      g.position.set(ambient.x * T + 8, ambient.y * T + 8);
      const kind = ambient.kind === 'shard' ? 'shard' : 'bones';
      const eid = createDropInEcs(world, kind as DropKind, ambient.x * T + 8, ambient.y * T + 8, g);
      (g as any).userData = (g as any).userData || {};
      (g as any).userData.eid = eid;
      dc.addChild(g);
    }
  }
}
