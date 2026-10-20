/* Типы и константы для генерации мира */

export const T = 16;

export enum Tile {
  WATER = 0, SHORE = 1, SNOW = 2, SNOW2 = 3, PATH = 4, FOREST = 5, TREE = 6, ROCK = 7,
  MTN = 8, SWAMP = 9, POOL = 10, VILLAGE = 11, PALISADE = 12, HOUSE = 13, RUINS = 14,
  COLUMN = 15, CAVE = 16, CAVEWALL = 17, STAIRS = 18, DFLOOR = 19, DWALL = 20, ALTAR = 21,
  MEADOW = 22, WASTE = 23,
  DEADTREE = 24, FIR = 25, GRASS = 26,
  /** Каменистая осыпь на склоне (проходимая) */
  SCREE = 27,
  /** Скальный уступ/обрыв (проходимый, иллюзия высоты) */
  CLIFF = 28,
}

export const Tl = Tile;

/**
 * Число уровней высоты (террас) для оверворлда. Высота квантуется по уровням:
 * перепад между соседними уровнями даёт уступ/обрыв, одинаковые — ровную
 * площадку. Именно террасирование создаёт читаемые перепады высот при
 * плоском тайлсете.
 */
export const ELEV_LEVELS = 6;
/** Уровень высоты тайла (0..ELEV_LEVELS) по нормированной высоте 0..1. */
export const elevLevel = (h: number): number =>
  Math.max(0, Math.min(ELEV_LEVELS, Math.floor(h * ELEV_LEVELS + 0.0001)));

export enum Biome {
  SNOW = 0,      // священная гряда (центр)
  RIDGE = 1,     // хребет
  FOREST = 2,    // лес
  SWAMP = 3,     // топи
  MEADOW = 4,    // луга
  RUINS = 5,     // руины
  WASTE = 6,     // пустошь
  WATER = 7,     // вода/берег (для удобства)
}
export type BiomeId = number;

const SOLID = new Set<number>([
  Tl.WATER, Tl.TREE, Tl.ROCK, Tl.PALISADE, Tl.HOUSE, Tl.COLUMN, Tl.CAVEWALL, Tl.DWALL, Tl.ALTAR,
  Tl.DEADTREE, Tl.FIR,
]);
export const isSolidTileId = (id: number) => SOLID.has(id);

export type ChestItem = "bow" | "sword" | "arrows" | "heartPiece" | "key";
export type EnemyKind = "draugr" | "varg" | "raven" | "shroom" | "crawler" | "frost" | "reaper" | "spider" | "giant" | "snake" | "ghost" | "skeleton" | "skeleton_archer";
export type BossReward = "axe" | "bow" | "hammer";
export type DropKind = "heart" | "arrows" | "axe" | "sword" | "bear" | "hammer" | "bow" | "horn" | "mead" | "ore" | "moss" | "amber" | "flower" | "diary" | "bundle" | "relic" | "shard" | "bones" | "rune" | "dew" | "soul";
export type ProjectileKind = "arrow" | "axe" | "spore" | "fire" | "bone_arrow";

export interface Vec { x: number; y: number }
/**
 * Сторона проёма двери (куда «смотрит» проём относительно помещения):
 * `down` — нижняя стена, `up` — верхняя, `left`/`right` — боковые.
 */
export type DoorDir = "up" | "down" | "left" | "right";
export interface DoorSpec extends Vec { dir?: DoorDir }
export interface ChestDef { x: number; y: number; item: ChestItem }
export interface PedestalDef { x: number; y: number; guards: EnemyKind[] }
export interface NpcDef { id: string; name: string; x: number; y: number }
export interface ShrineDef { x: number; y: number }
export interface SpawnDef { kind: EnemyKind; x: number; y: number }
export interface ZoneRect { x: number; y: number; w: number; h: number; name: string }
export interface DungeonEntry { x: number; y: number; id: number; name: string }
export interface AmbientDef { kind: "shard" | "bones"; x: number; y: number }
export interface GateDef extends Vec { edge: Edge; target?: Vec }

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
  doors: DoorSpec[];
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
  noBarrier?: boolean;
  /** Коды тайлов стен подземелья (DUNGEON_FLOOR / 0..53), заполняется генератором. */
  dungeonWall?: Uint8Array;
  /** Карта биомов для оверворлда */
  biomes?: Uint8Array;
  /** Поле высот рельефа (0..1) для оверворлда — используется для отрисовки
   *  перепадов высот (обрывов, осыпей, подсветки вершин). */
  height?: Float32Array;
  /**
   * Битовая маска стен-уступов по сторонам клетки: N=1, E=2, S=4, W=8
   * (см. `WallBit` в generators/terrain-walls).
   *
   * Бит выставлен, если сосед по этой стороне ВЫШЕ, а переход запрещён.
   * Если уровни отличаются, но бита нет — это пандус (подъём разрешён).
   * Стена лежит только на клетке-«ниже» и занимает узкую полосу на самом
   * стыке, поэтому коллизия не покрывает всю клетку.
   */
  walls?: Uint8Array;
  /** Отладка: центры деревень (vA, vB, vR) */
  villageSites?: Vec[];
  /** Отладка: ворота каждой деревни */
  villageGates?: GateDef[][];
  /** Отладка: рёбра графа связей деревень */
  villageGraph?: [number, number][];
}

export const idx = (w: { W: number }, x: number, y: number) => y * w.W + x;
export const inB = (w: { W: number; H: number }, x: number, y: number) => x >= 0 && y >= 0 && x < w.W && y < w.H;

export enum Edge { North = 0, East = 1, South = 2, West = 3 }

export interface HouseDef { x: number; y: number; w: number; h: number }
export interface VillageResult { 
  x0: number; y0: number; x1: number; y1: number; 
  gate: Vec; gateEdge: Edge; 
  gates: GateDef[];
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
