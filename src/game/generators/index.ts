/* Основной entry point генераторов — переэкспорт для обратной совместимости */

// Types & constants
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
} from "./types";

// Utils
export { tileAt, solidTileAt, setTile, zoneFor } from "./utils";
export { findWalkableNear, clearAround, findFree, floodReach } from "./utils";

// Generators
export { IslandGenerator } from "./island-generator";
export { VillageGenerator } from "./village-generator";
export { GlobalRoadGenerator } from "./global-road-generator";
export { NavBuilder } from "./nav-builder";

// Main functions
export { generateOverworld } from "./overworld";
export { generateDungeon, DUNGEONS } from "./dungeons";
