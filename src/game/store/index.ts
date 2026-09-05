/* ============ Store barrel export ============ */

export { GameStore } from "./game-store";
export { FlagDomain, type GameFlags } from "./flag-domain";
export { PlayerDomain, type PlayerEvents, type IPlayerDomain, type IPlayerMutations } from "./player-domain";

// Store-specific types (more specific than models.ts versions)
export type { GameStoreConfig, GameStoreState } from "./game-store";

// Shared types from models
export type { EngineCallbacks, EngineServices, GameActions } from "../models";

// Re-export shared types from models for convenience
export type {
  ChestRt, PedestalRt, ShrineRt, NpcRt, DoorRt, BarrierRt, AltarRt,
  FloatText, ProjectileRt, DropRt, Screen,
} from "../models";
