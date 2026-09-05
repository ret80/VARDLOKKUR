/* ============ Store barrel export ============ */

// Core stores
export { GameStore } from "./game-store";
export { WorldStore } from "./world-store";

// Flag domains
export { FlagDomain, type GameFlags, INITIAL_FLAGS, type FlagDomainKey } from "./flag-domain";

// Decomposed flag domains
export type {
  InventoryFlags,
  ResourceFlags,
  QuestItemFlags,
  QuestFlags,
  KillFlags,
  WorldFlags,
  FlagDomainMap,
} from "./flag-domains";
export { getFlagDomain } from "./flag-domains";

// Player domain
export { PlayerDomain, type PlayerEvents, type IPlayerDomain, type IPlayerMutations } from "./player-domain";

// Store types
export type { GameStoreConfig, GameStoreState } from "./game-store";
export type { WorldStoreConfig, WorldStoreState } from "./world-store";

// Shared types from models
export type { EngineCallbacks, EngineServices, GameActions } from "../models";

// Re-export shared types from models for convenience
export type {
  FloatText, Screen,
  ChestRt, PedestalRt, ShrineRt, NpcRt, DoorRt, BarrierRt, AltarRt,
  ProjectileRt, DropRt,
} from "../models";
