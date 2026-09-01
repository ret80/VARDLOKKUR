/* Основной entry point генерации мира — переэкспорт из generators/ */
export {
  T, Tl, isSolidTileId,
  Edge,
  type Vec, type ChestItem, type EnemyKind, type BossReward,
  type DropKind, type ProjectileKind,
  type ChestDef, type PedestalDef, type NpcDef, type ShrineDef,
  type SpawnDef, type ZoneRect, type DungeonEntry, type AmbientDef,
  type WorldData, type HouseDef, type VillageResult,
  type DungeonCfg,
  idx, inB,
} from "./generators/types";

export { tileAt, solidTileAt, setTile, zoneFor } from "./generators/utils";
export { findWalkableNear, clearAround, findFree, floodReach } from "./generators/utils";

export { IslandGenerator } from "./generators/island-generator";
export { VillageGenerator } from "./generators/village-generator";
export { GlobalRoadGenerator } from "./generators/global-road-generator";
export { NavBuilder } from "./generators/nav-builder";

export { generateOverworld } from "./generators/overworld";
export { generateDungeon, DUNGEONS } from "./generators/dungeons";

export { mulberry, NoiseGenerator } from "./noise";
