/* Типы и константы для генерации мира */

export const T = 16;

export const Tl = {
  WATER: 0, SHORE: 1, SNOW: 2, SNOW2: 3, PATH: 4, FOREST: 5, TREE: 6, ROCK: 7,
  MTN: 8, SWAMP: 9, POOL: 10, VILLAGE: 11, PALISADE: 12, HOUSE: 13, RUINS: 14,
  COLUMN: 15, CAVE: 16, CAVEWALL: 17, STAIRS: 18, DFLOOR: 19, DWALL: 20, ALTAR: 21,
} as const;

const SOLID = new Set<number>([
  Tl.WATER, Tl.TREE, Tl.ROCK, Tl.PALISADE, Tl.HOUSE, Tl.COLUMN, Tl.CAVEWALL, Tl.DWALL, Tl.ALTAR,
]);
export const isSolidTileId = (id: number) => SOLID.has(id);

export type ChestItem = "bow" | "arrows" | "heartPiece" | "key";
export type EnemyKind = "draugr" | "varg" | "raven" | "shroom" | "crawler" | "frost" | "reaper" | "spider" | "giant" | "snake" | "ghost";
export type BossReward = "axe" | "bow" | "hammer";
export type DropKind = "heart" | "arrows" | "axe" | "sword" | "bear" | "hammer" | "bow" | "horn" | "mead" | "ore" | "moss" | "amber" | "flower" | "diary" | "bundle" | "relic" | "shard" | "bones" | "rune" | "dew" | "soul";
export type ProjectileKind = "arrow" | "axe" | "spore" | "fire";

export interface Vec { x: number; y: number }
export interface ChestDef { x: number; y: number; item: ChestItem }
export interface PedestalDef { x: number; y: number; guards: EnemyKind[] }
export interface NpcDef { id: string; name: string; x: number; y: number }
export interface ShrineDef { x: number; y: number }
export interface SpawnDef { kind: EnemyKind; x: number; y: number }
export interface ZoneRect { x: number; y: number; w: number; h: number; name: string }
export interface DungeonEntry { x: number; y: number; id: number; name: string }
export interface AmbientDef { kind: "shard" | "bones"; x: number; y: number }

export interface WorldData {
  W: number; H: number;
  tiles: Uint8Array;
  nav: import("navmesh").NavMesh;
  isDungeon: boolean;
  dungeonId: number;
  dungeonName: string;
  bossReward: BossReward | null;
  spawn: Vec;
  zones: ZoneRect[];
  shrines: ShrineDef[];
  npcs: NpcDef[];
  chests: ChestDef[];
  pedestals: PedestalDef[];
  spawns: SpawnDef[];
  doors: Vec[];
  souls: Vec[];
  ambient: AmbientDef[];
  dungeonEntries: DungeonEntry[];
  exitSpot: Vec;
  hornSpot: Vec; meadSpot: Vec; oreSpot: Vec; bearSpot: Vec;
  mossSpot: Vec; amberSpot: Vec; flowerSpot: Vec;
  diarySpot: Vec; bundleSpot: Vec; relicSpot: Vec;
  oldAltar: Vec; stashSpot: Vec; ruinedVillage: Vec;
  treeAltar: Vec; arena: { x: number; y: number; r: number }; snakeSpot: Vec;
  villageA: Vec; villageB: Vec;
   bossRoom: { x: number; y: number; w: number; h: number }; bossSpot: Vec; entryStairs: Vec;
   ruinedHouses: HouseDef[];
}

export const idx = (w: { W: number }, x: number, y: number) => y * w.W + x;
export const inB = (w: { W: number; H: number }, x: number, y: number) => x >= 0 && y >= 0 && x < w.W && y < w.H;

export enum Edge { North = 0, East = 1, South = 2, West = 3 }

export interface HouseDef { x: number; y: number; w: number; h: number }
export interface VillageResult { 
  x0: number; y0: number; x1: number; y1: number; 
  gate: Vec; gateEdge: Edge; 
  houses: HouseDef[];
  residentSpots: Vec[];
  plazaCenter: Vec;
}

export interface DungeonCfg {
  id: number;
  name: string;
  boss: EnemyKind;
  bossReward: BossReward;
  pool: EnemyKind[];
}
