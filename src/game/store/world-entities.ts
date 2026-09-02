/* ============ WorldEntities — инкапсулированные коллекции сущностей ============ */

import { Vec, EnemyKind, DropKind, ProjectileKind } from "../world";
import { dist2 } from "../utils";
import { Graphics } from "pixi.js";

// ── Runtime-сущности (данные + Graphics) ──

export interface EnemyRt {
  kind: EnemyKind;
  x: number; y: number;
  vx: number; vy: number; r: number;
  hp: number; maxHp: number;
  facing: Vec;
  t: number;
  state: string;
  aggro: boolean;
  dead: boolean;
  hidden: boolean;
  lungeT: number;
  freezeT: number;
  flashT: number;
  seed: number;
  speed: number;
  dmg: number;
  stateT: number;
  path: { x: number; y: number }[] | null;
  pathI: number;
  repathT: number;
  contactCd: number;
  guardOf: number;
  fade?: number;
  leash?: Vec;
  dropDew?: boolean;
  body: any; // PhysicsCircle
  g: Graphics; // PixiJS graphic
}

export interface ProjectileRt {
  kind: ProjectileKind;
  x: number; y: number;
  vx: number; vy: number; r: number;
  dmg: number;
  life: number;
  dist: number;
  returning: boolean;
  dead: boolean;
  spin: number;
  g: Graphics;
}

export interface DropRt {
  kind: DropKind;
  x: number; y: number;
  t: number;
  taken: boolean;
  magnet: boolean;
  life?: number;
  ambientIdx?: number;
  g: Graphics;
}

export interface ChestRt {
  x: number; y: number;
  item: string;
  opened: boolean;
  g: Graphics;
}

export interface PedestalRt {
  id: string;
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
  id: string;
  name: string;
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

// ── Интерфейсы коллекций ──

/** Коллекция врагов */
export interface IEnemyCollection {
  readonly all: EnemyRt[];
  readonly alive: EnemyRt[];
  readonly bossRef: EnemyRt | null;
  setBossRef(boss: EnemyRt | null): void;
  add(e: EnemyRt): void;
  remove(i: number): void;
  clear(): void;
  filterAlive(): EnemyRt[];
  findAlive(): EnemyRt[];
}

/** Коллекция снарядов */
export interface IProjectileCollection {
  readonly all: ProjectileRt[];
  add(p: ProjectileRt): void;
  remove(i: number): void;
  clear(): void;
}

/** Коллекция дропов */
export interface IDropCollection {
  readonly all: DropRt[];
  add(d: DropRt): void;
  remove(i: number): void;
  clear(): void;
}

/** Коллекция NPC */
export interface INpcCollection {
  readonly all: NpcRt[];
  add(n: NpcRt): void;
  remove(i: number): void;
  clear(): void;
}

/** Коллекция сундуков */
export interface IChestCollection {
  readonly all: ChestRt[];
  add(c: ChestRt): void;
  remove(i: number): void;
  clear(): void;
}

/** Коллекция пьедесталов */
export interface IPedestalCollection {
  readonly all: PedestalRt[];
  add(p: PedestalRt): void;
  remove(i: number): void;
  clear(): void;
}

/** Коллекция святилищ */
export interface IShrineCollection {
  readonly all: ShrineRt[];
  add(s: ShrineRt): void;
  remove(i: number): void;
  clear(): void;
}

/** Коллекция дверей */
export interface IDoorCollection {
  readonly all: DoorRt[];
  add(d: DoorRt): void;
  remove(i: number): void;
  clear(): void;
}

// ── Реализация коллекций ──

export class EnemyCollection implements IEnemyCollection {
  private _all: EnemyRt[];
  private _bossRef: EnemyRt | null = null;

  constructor(arr?: EnemyRt[]) { this._all = arr || []; }
  get all(): EnemyRt[] { return this._all; }
  get alive(): EnemyRt[] { return this._all.filter((e) => !e.dead); }
  get bossRef(): EnemyRt | null { return this._bossRef; }
  setBossRef(boss: EnemyRt | null): void { this._bossRef = boss; }
  add(e: EnemyRt): void { this._all.push(e); }
  remove(i: number): void { this._all.splice(i, 1); }
  clear(): void { this._all.length = 0; this._bossRef = null; }
  filterAlive(): EnemyRt[] { return this._all.filter((e) => !e.dead); }
  findAlive(): EnemyRt[] { return this._all.filter((e) => !e.dead); }
}

export class ProjectileCollection implements IProjectileCollection {
  private _all: ProjectileRt[];
  constructor(arr?: ProjectileRt[]) { this._all = arr || []; }
  get all(): ProjectileRt[] { return this._all; }
  add(p: ProjectileRt): void { this._all.push(p); }
  remove(i: number): void { this._all.splice(i, 1); }
  clear(): void { this._all.length = 0; }
}

export class DropCollection implements IDropCollection {
  private _all: DropRt[];
  constructor(arr?: DropRt[]) { this._all = arr || []; }
  get all(): DropRt[] { return this._all; }
  add(d: DropRt): void { this._all.push(d); }
  remove(i: number): void { this._all.splice(i, 1); }
  clear(): void { this._all.length = 0; }
}

export class NpcCollection implements INpcCollection {
  private _all: NpcRt[];
  constructor(arr?: NpcRt[]) { this._all = arr || []; }
  get all(): NpcRt[] { return this._all; }
  add(n: NpcRt): void { this._all.push(n); }
  remove(i: number): void { this._all.splice(i, 1); }
  clear(): void { this._all.length = 0; }
}

export class ChestCollection implements IChestCollection {
  private _all: ChestRt[];
  constructor(arr?: ChestRt[]) { this._all = arr || []; }
  get all(): ChestRt[] { return this._all; }
  add(c: ChestRt): void { this._all.push(c); }
  remove(i: number): void { this._all.splice(i, 1); }
  clear(): void { this._all.length = 0; }
}

export class PedestalCollection implements IPedestalCollection {
  private _all: PedestalRt[];
  constructor(arr?: PedestalRt[]) { this._all = arr || []; }
  get all(): PedestalRt[] { return this._all; }
  add(p: PedestalRt): void { this._all.push(p); }
  remove(i: number): void { this._all.splice(i, 1); }
  clear(): void { this._all.length = 0; }
}

export class ShrineCollection implements IShrineCollection {
  private _all: ShrineRt[];
  constructor(arr?: ShrineRt[]) { this._all = arr || []; }
  get all(): ShrineRt[] { return this._all; }
  add(s: ShrineRt): void { this._all.push(s); }
  remove(i: number): void { this._all.splice(i, 1); }
  clear(): void { this._all.length = 0; }
}

export class DoorCollection implements IDoorCollection {
  private _all: DoorRt[];
  constructor(arr?: DoorRt[]) { this._all = arr || []; }
  get all(): DoorRt[] { return this._all; }
  add(d: DoorRt): void { this._all.push(d); }
  remove(i: number): void { this._all.splice(i, 1); }
  clear(): void { this._all.length = 0; }
}

// ── WorldEntities — объединённый провайдер ──

export interface IWorldEntities {
  enemies: IEnemyCollection;
  projectiles: IProjectileCollection;
  drops: IDropCollection;
  npcs: INpcCollection;
  chests: IChestCollection;
  pedestals: IPedestalCollection;
  shrines: IShrineCollection;
  doors: IDoorCollection;
  barrier: BarrierRt | null;
  altar: AltarRt | null;
  setBarrier(b: BarrierRt | null): void;
  setAltar(a: AltarRt | null): void;
}

export class WorldEntities implements IWorldEntities {
  enemies: EnemyCollection;
  projectiles: ProjectileCollection;
  drops: DropCollection;
  npcs: NpcCollection;
  chests: ChestCollection;
  pedestals: PedestalCollection;
  shrines: ShrineCollection;
  doors: DoorCollection;
  barrier: BarrierRt | null = null;
  altar: AltarRt | null = null;

  constructor(arrs?: {
    enemies?: EnemyRt[];
    projectiles?: ProjectileRt[];
    drops?: DropRt[];
    chests?: ChestRt[];
    pedestals?: PedestalRt[];
    shrines?: ShrineRt[];
    npcs?: NpcRt[];
    doors?: DoorRt[];
  }) {
    this.enemies = new EnemyCollection(arrs?.enemies);
    this.projectiles = new ProjectileCollection(arrs?.projectiles);
    this.drops = new DropCollection(arrs?.drops);
    this.npcs = new NpcCollection(arrs?.npcs);
    this.chests = new ChestCollection(arrs?.chests);
    this.pedestals = new PedestalCollection(arrs?.pedestals);
    this.shrines = new ShrineCollection(arrs?.shrines);
    this.doors = new DoorCollection(arrs?.doors);
  }

  setBarrier(b: BarrierRt | null): void { this.barrier = b; }
  setAltar(a: AltarRt | null): void { this.altar = a; }
}
