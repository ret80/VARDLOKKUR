/* ============ WorldEntities — заглушка для обратной совместимости ============
 * TODO: Удалить после полной миграции на ECS
 */

import { Graphics } from "pixi.js";
import { Enemy, Projectile, Drop } from "../entities";

export interface EnemyRt extends Enemy {
  g: Graphics;
}

export interface ProjectileRt extends Projectile {
  g: Graphics;
}

export interface DropRt extends Drop {
  g: Graphics;
}

export interface ChestRt {
  x: number; y: number;
  item: string;
  opened: boolean;
  g: Graphics;
}

export interface PedestalRt {
  x: number; y: number;
  taken: boolean;
  guardsLeft: number;
  guardsSpawned: boolean;
  g: Graphics;
}

export interface ShrineRt {
  x: number; y: number;
  g: Graphics;
}

export interface NpcRt {
  id: string; name: string;
  x: number; y: number;
  g: Graphics;
}

export interface DoorRt {
  x: number; y: number;
  open: number;
  locked: boolean;
  g: Graphics;
}

export interface BarrierRt {
  x: number; y: number;
  active: boolean;
  g: Graphics;
}

export interface AltarRt {
  x: number; y: number;
  g: Graphics;
}

/** Коллекция врагов */
class EnemyCollection {
  private _array: EnemyRt[];
  constructor(array: EnemyRt[]) { this._array = array; }
  get all() { return this._array; }
}

/** Коллекция снарядов */
class ProjectileCollection {
  private _array: ProjectileRt[];
  constructor(array: ProjectileRt[]) { this._array = array; }
  get all() { return this._array; }
}

/** Коллекция дропов */
class DropCollection {
  private _array: DropRt[];
  constructor(array: DropRt[]) { this._array = array; }
  get all() { return this._array; }
}

/** Коллекция сундуков */
class ChestCollection {
  private _array: ChestRt[];
  constructor(array: ChestRt[]) { this._array = array; }
  get all() { return this._array; }
}

/** Коллекция пьедесталов */
class PedestalCollection {
  private _array: PedestalRt[];
  constructor(array: PedestalRt[]) { this._array = array; }
  get all() { return this._array; }
}

/** Коллекция святилищ */
class ShrineCollection {
  private _array: ShrineRt[];
  constructor(array: ShrineRt[]) { this._array = array; }
  get all() { return this._array; }
}

/** Коллекция NPC */
class NpcCollection {
  private _array: NpcRt[];
  constructor(array: NpcRt[]) { this._array = array; }
  get all() { return this._array; }
}

/** Коллекция дверей */
class DoorCollection {
  private _array: DoorRt[];
  constructor(array: DoorRt[]) { this._array = array; }
  get all() { return this._array; }
}

export class WorldEntities {
  public enemies: EnemyCollection;
  public projectiles: ProjectileCollection;
  public drops: DropCollection;
  public chests: ChestCollection;
  public pedestals: PedestalCollection;
  public shrines: ShrineCollection;
  public npcs: NpcCollection;
  public doors: DoorCollection;
  private _barrier: BarrierRt | null = null;
  private _altar: AltarRt | null = null;

  constructor(arrays?: {
    enemies: EnemyRt[];
    projectiles: ProjectileRt[];
    drops: DropRt[];
    chests: ChestRt[];
    pedestals: PedestalRt[];
    shrines: ShrineRt[];
    npcs: NpcRt[];
    doors: DoorRt[];
  }) {
    if (arrays) {
      this.enemies = new EnemyCollection(arrays.enemies);
      this.projectiles = new ProjectileCollection(arrays.projectiles);
      this.drops = new DropCollection(arrays.drops);
      this.chests = new ChestCollection(arrays.chests);
      this.pedestals = new PedestalCollection(arrays.pedestals);
      this.shrines = new ShrineCollection(arrays.shrines);
      this.npcs = new NpcCollection(arrays.npcs);
      this.doors = new DoorCollection(arrays.doors);
    } else {
      this.enemies = new EnemyCollection([]);
      this.projectiles = new ProjectileCollection([]);
      this.drops = new DropCollection([]);
      this.chests = new ChestCollection([]);
      this.pedestals = new PedestalCollection([]);
      this.shrines = new ShrineCollection([]);
      this.npcs = new NpcCollection([]);
      this.doors = new DoorCollection([]);
    }
  }

  setBarrier(b: BarrierRt | null) { this._barrier = b; }
  setAltar(a: AltarRt | null) { this._altar = a; }
  get barrier(): BarrierRt | null { return this._barrier; }
  get altar(): AltarRt | null { return this._altar; }
}
